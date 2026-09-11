import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
	AVATAR_STYLES,
	type AvatarStyle,
	type PostKind,
	type Preferences,
	type ReminderAudience,
	type Role,
	type SocialLink,
} from "../shared/types";
import {
	clearDevEmailCookie,
	devEmailCookie,
	isDev,
	isFamilyEmail,
	normalizeEmail,
	accessStatus,
	resolveIdentity,
	type AccessIdentity,
} from "./auth";
import {
	assignedRole,
	canManageContent,
	contactDisplayName,
	getContact,
	getPost,
	getRecipe,
	getSite,
	getUserByEmail,
	getUserById,
	isAdmin,
	listChanges,
	listComments,
	listContacts,
	listGallery,
	listRecipes,
	listReminders,
	listUsers,
	logChange,
	mapPosts,
	mediaUrl,
	mergePreferences,
	newId,
	nowIso,
	resetMemberAccount,
	revertChange,
	setSiteValue,
	toContact,
	toMember,
	type UserRow,
} from "./store";

type AppEnv = {
	Bindings: Env;
	Variables: {
		identity: AccessIdentity | null;
		user: UserRow | null;
	};
};

const app = new Hono<AppEnv>();
const MAX_UPLOAD = 12 * 1024 * 1024;

app.onError((err, c) => {
	if (err instanceof HTTPException) return err.getResponse();
	console.error(err);
	const message = err instanceof Error ? err.message : "Something went wrong";
	const status = /not found/i.test(message)
		? 404
		: /window|already|must|invalid|required|permanent|undone|newer|closed|restore|unknown|cannot|can't/i.test(message)
			? 400
			: 500;
	return c.json({ error: message }, status);
});

app.use("/api/*", async (c, next) => {
	if (c.req.path === "/api/dev/login" || c.req.path === "/api/dev/logout") {
		c.set("identity", null);
		c.set("user", null);
		await next();
		return;
	}

	const identity = await resolveIdentity(c.req.raw, c.env);
	c.set("identity", identity);
	if (!identity) {
		c.set("user", null);
		if (c.req.path === "/api/me") {
			await next();
			return;
		}
		throw new HTTPException(401, {
			res: c.json(
				{
					error: "Sign in required",
					reason: isDev(c.env) ? "dev" : "access",
					allowedDomain: c.env.ALLOWED_EMAIL_DOMAIN || "winstead.family",
				},
				401,
			),
		});
	}

	const user = await getUserByEmail(c.env.DB, identity.email);
	c.set("user", user);
	const openPaths = new Set(["/api/me", "/api/me/onboard"]);
	if (!user?.onboarded && !openPaths.has(c.req.path) && !c.req.path.startsWith("/api/media/")) {
		throw new HTTPException(403, { res: c.json({ error: "Finish creating your family profile first" }, 403) });
	}
	await next();
});

function currentUser(c: { get: (key: "user") => UserRow | null }): UserRow {
	const user = c.get("user");
	if (!user?.onboarded) throw new HTTPException(403, { message: "Profile required" });
	return user;
}

function currentIdentity(c: { get: (key: "identity") => AccessIdentity | null }): AccessIdentity {
	const identity = c.get("identity");
	if (!identity) throw new HTTPException(401, { message: "Sign in required" });
	return identity;
}

function adminUser(c: { get: (key: "user") => UserRow | null }): UserRow {
	const user = currentUser(c);
	if (!isAdmin(user)) throw new HTTPException(403, { message: "Admins only" });
	return user;
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value.trim() : fallback;
}

function asAvatarStyle(value: unknown, fallback: AvatarStyle = "gold"): AvatarStyle {
	return AVATAR_STYLES.some((item) => item.id === value) ? (value as AvatarStyle) : fallback;
}

function contactFields(body: Record<string, unknown>, fallback?: { first_name?: string; last_name?: string; phone?: unknown; email?: unknown; address?: unknown; notes?: unknown; avatar_key?: unknown; avatar_style?: unknown }) {
	const firstName = asString(body.firstName, fallback?.first_name || "");
	const lastName = asString(body.lastName, fallback?.last_name || "");
	const phone = asString(body.phone, fallback ? String(fallback.phone ?? "") : "");
	const email = asString(body.email, fallback ? String(fallback.email ?? "") : "");
	const address = asString(body.address, fallback ? String(fallback.address ?? "") : "");
	const notes = asString(body.notes, fallback ? String(fallback.notes ?? "") : "");
	const avatarStyle = asAvatarStyle(body.avatarStyle, asAvatarStyle(fallback?.avatar_style, "gold"));
	const avatarKey =
		typeof body.avatarKey === "string"
			? body.avatarKey
			: body.avatarKey === null
				? null
				: typeof fallback?.avatar_key === "string"
					? fallback.avatar_key
					: null;
	return { firstName, lastName, phone, email, address, notes, avatarStyle, avatarKey };
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item).trim()).filter(Boolean);
}

function asSocials(value: unknown): SocialLink[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const record = item as Record<string, unknown>;
			const url = asString(record.url);
			const label = asString(record.label) || "Link";
			if (!url) return null;
			return { label, handle: asString(record.handle), url };
		})
		.filter((item): item is SocialLink => Boolean(item));
}

app.post("/api/dev/login", async (c) => {
	if (!isDev(c.env)) throw new HTTPException(404, { message: "Not found" });
	const body = await c.req.json<{ email?: string }>();
	const email = normalizeEmail(body.email || "");
	if (!isFamilyEmail(email, c.env)) {
		return c.json({ error: `Use a @${c.env.ALLOWED_EMAIL_DOMAIN || "winstead.family"} email` }, 400);
	}
	c.header("Set-Cookie", devEmailCookie(email, false));
	return c.json({ ok: true, email });
});

app.post("/api/dev/logout", (c) => {
	c.header("Set-Cookie", clearDevEmailCookie(false));
	return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
	const identity = c.get("identity");
	const site = await getSite(c.env.DB);
	if (!identity) {
		return c.json({
			status: "unauthenticated",
			reason: isDev(c.env) ? "dev" : "access",
			allowedDomain: c.env.ALLOWED_EMAIL_DOMAIN || "winstead.family",
			...accessStatus(c.req.raw, c.env),
		});
	}
	const user = c.get("user");
	if (!user?.onboarded) {
		return c.json({ status: "needs_onboarding", familyEmail: identity.email, site });
	}
	return c.json({ status: "ok", user: toMember(user), site });
});

app.post("/api/me/onboard", async (c) => {
	const identity = currentIdentity(c);
	const existing = c.get("user");
	if (existing?.onboarded) return c.json({ user: toMember(existing) });

	const body = await c.req.json<Record<string, unknown>>();
	const fullName = asString(body.fullName);
	const nickname = asString(body.nickname);
	const dateOfBirth = asString(body.dateOfBirth);
	const residence = asString(body.residence);
	if (!fullName || !nickname || !dateOfBirth || !residence) {
		return c.json({ error: "Name, nickname, birthday, and residence are required" }, 400);
	}

	const now = nowIso();
	const id = existing?.id || newId();
	const role = assignedRole(identity.email, c.env);
	const row = {
		id,
		family_email: identity.email,
		personal_email: asString(body.personalEmail),
		full_name: fullName,
		nickname,
		date_of_birth: dateOfBirth,
		residence,
		phone: asString(body.phone),
		socials_json: JSON.stringify(asSocials(body.socials)),
		role,
		onboarded: 1,
		avatar_key: existing?.avatar_key ?? null,
		preferences_json: JSON.stringify(mergePreferences(existing?.preferences_json)),
		created_at: existing?.created_at || now,
		updated_at: now,
	};

	await c.env.DB.prepare(
		`INSERT INTO users (id, family_email, personal_email, full_name, nickname, date_of_birth, residence, phone, socials_json, role, onboarded, avatar_key, preferences_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       personal_email = excluded.personal_email,
       full_name = excluded.full_name,
       nickname = excluded.nickname,
       date_of_birth = excluded.date_of_birth,
       residence = excluded.residence,
       phone = excluded.phone,
       socials_json = excluded.socials_json,
       onboarded = 1,
       updated_at = excluded.updated_at`,
	)
		.bind(
			row.id,
			row.family_email,
			row.personal_email,
			row.full_name,
			row.nickname,
			row.date_of_birth,
			row.residence,
			row.phone,
			row.socials_json,
			row.role,
			row.onboarded,
			row.avatar_key,
			row.preferences_json,
			row.created_at,
			row.updated_at,
		)
		.run();

	await logChange(c.env.DB, {
		entityType: "user",
		entityId: id,
		action: existing ? "update" : "create",
		before: existing,
		after: row,
		actorId: id,
	});

	const created = await getUserById(c.env.DB, id);
	return c.json({ user: created ? toMember(created) : toMember(row as UserRow) });
});

app.patch("/api/me", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Record<string, unknown>>();
	const next = {
		...user,
		personal_email: asString(body.personalEmail, user.personal_email),
		full_name: asString(body.fullName, user.full_name),
		nickname: asString(body.nickname, user.nickname),
		date_of_birth: asString(body.dateOfBirth, user.date_of_birth),
		residence: asString(body.residence, user.residence),
		phone: asString(body.phone, user.phone),
		socials_json: body.socials ? JSON.stringify(asSocials(body.socials)) : user.socials_json,
		avatar_key: typeof body.avatarKey === "string" ? body.avatarKey : body.avatarKey === null ? null : user.avatar_key,
		updated_at: nowIso(),
	};
	await c.env.DB.prepare(
		`UPDATE users SET personal_email = ?, full_name = ?, nickname = ?, date_of_birth = ?, residence = ?, phone = ?, socials_json = ?, avatar_key = ?, updated_at = ? WHERE id = ?`,
	)
		.bind(
			next.personal_email,
			next.full_name,
			next.nickname,
			next.date_of_birth,
			next.residence,
			next.phone,
			next.socials_json,
			next.avatar_key,
			next.updated_at,
			user.id,
		)
		.run();
	await logChange(c.env.DB, {
		entityType: "user",
		entityId: user.id,
		action: "update",
		before: user,
		after: next,
		actorId: user.id,
	});
	const updated = await getUserById(c.env.DB, user.id);
	return c.json({ user: updated ? toMember(updated) : toMember(next) });
});

app.patch("/api/me/preferences", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Partial<Preferences>>();
	const preferences = mergePreferences(JSON.stringify({ ...mergePreferences(user.preferences_json), ...body }));
	const updatedAt = nowIso();
	await c.env.DB.prepare("UPDATE users SET preferences_json = ?, updated_at = ? WHERE id = ?")
		.bind(JSON.stringify(preferences), updatedAt, user.id)
		.run();
	return c.json({ preferences });
});

app.get("/api/site", async (c) => c.json(await getSite(c.env.DB)));

app.patch("/api/site", async (c) => {
	const user = adminUser(c);
	const before = await getSite(c.env.DB);
	const body = await c.req.json<Record<string, unknown>>();
	if (body.banner && typeof body.banner === "object") {
		const banner = body.banner as Record<string, unknown>;
		await setSiteValue(
			c.env.DB,
			"banner",
			{
				title: asString(banner.title, before.banner.title),
				body: asString(banner.body, before.banner.body),
				active: Boolean(banner.active),
			},
			user.id,
		);
	}
	if (body.family && typeof body.family === "object") {
		const family = body.family as Record<string, unknown>;
		await setSiteValue(
			c.env.DB,
			"family",
			{
				name: asString(family.name, before.family.name),
				tagline: asString(family.tagline, before.family.tagline),
			},
			user.id,
		);
	}
	const after = await getSite(c.env.DB);
	await logChange(c.env.DB, {
		entityType: "site",
		entityId: "banner",
		action: "update",
		before,
		after,
		actorId: user.id,
	});
	return c.json(after);
});

app.get("/api/posts", async (c) => {
	const user = currentUser(c);
	return c.json({ posts: await mapPosts(c.env.DB, user.id) });
});

app.post("/api/posts", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Record<string, unknown>>();
	const text = asString(body.body);
	if (!text) return c.json({ error: "Write something for the family" }, 400);
	const kind: PostKind = body.kind === "announcement" ? "announcement" : "update";
	if (kind === "announcement" && !isAdmin(user)) {
		return c.json({ error: "Only admins can post announcements" }, 403);
	}
	const now = nowIso();
	const row = {
		id: newId(),
		author_id: user.id,
		kind,
		body: text,
		media_json: JSON.stringify(asStringArray(body.mediaKeys)),
		created_at: now,
		updated_at: now,
		deleted_at: null,
	};
	await c.env.DB.prepare(
		"INSERT INTO posts (id, author_id, kind, body, media_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(row.id, row.author_id, row.kind, row.body, row.media_json, row.created_at, row.updated_at)
		.run();
	await logChange(c.env.DB, {
		entityType: "post",
		entityId: row.id,
		action: "create",
		before: null,
		after: row,
		actorId: user.id,
	});
	return c.json({ post: await getPost(c.env.DB, user.id, row.id) }, 201);
});

app.get("/api/posts/:id", async (c) => {
	const user = currentUser(c);
	const post = await getPost(c.env.DB, user.id, c.req.param("id"));
	if (!post) return c.json({ error: "Post not found" }, 404);
	return c.json({ post });
});

app.patch("/api/posts/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Post not found" }, 404);
	if (!canManageContent(user, String(before.author_id))) return c.json({ error: "You can only edit your own posts" }, 403);
	const body = await c.req.json<Record<string, unknown>>();
	const next = {
		...before,
		body: asString(body.body, String(before.body)),
		media_json: body.mediaKeys ? JSON.stringify(asStringArray(body.mediaKeys)) : before.media_json,
		kind: body.kind === "announcement" && isAdmin(user) ? "announcement" : before.kind,
		updated_at: nowIso(),
	};
	await c.env.DB.prepare("UPDATE posts SET body = ?, media_json = ?, kind = ?, updated_at = ? WHERE id = ?")
		.bind(next.body, next.media_json, next.kind, next.updated_at, before.id)
		.run();
	await logChange(c.env.DB, {
		entityType: "post",
		entityId: String(before.id),
		action: "update",
		before,
		after: next,
		actorId: user.id,
	});
	return c.json({ post: await getPost(c.env.DB, user.id, String(before.id)) });
});

app.delete("/api/posts/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Post not found" }, 404);
	if (!canManageContent(user, String(before.author_id))) return c.json({ error: "You can only remove your own posts" }, 403);
	const deletedAt = nowIso();
	await c.env.DB.prepare("UPDATE posts SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(deletedAt, deletedAt, before.id).run();
	await logChange(c.env.DB, {
		entityType: "post",
		entityId: String(before.id),
		action: "delete",
		before,
		after: { ...before, deleted_at: deletedAt },
		actorId: user.id,
	});
	return c.json({ ok: true });
});

app.post("/api/posts/:id/comments", async (c) => {
	const user = currentUser(c);
	const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("id")).first();
	if (!post) return c.json({ error: "Post not found" }, 404);
	const body = await c.req.json<{ body?: string }>();
	const text = asString(body.body);
	if (!text) return c.json({ error: "Comment cannot be empty" }, 400);
	const row = {
		id: newId(),
		post_id: String(post.id),
		author_id: user.id,
		body: text,
		created_at: nowIso(),
		deleted_at: null,
	};
	await c.env.DB.prepare("INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
		.bind(row.id, row.post_id, row.author_id, row.body, row.created_at)
		.run();
	await logChange(c.env.DB, {
		entityType: "comment",
		entityId: row.id,
		action: "create",
		before: null,
		after: row,
		actorId: user.id,
	});
	return c.json({ comments: await listComments(c.env.DB, row.post_id) }, 201);
});

app.delete("/api/comments/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Comment not found" }, 404);
	if (!canManageContent(user, String(before.author_id))) return c.json({ error: "You can only remove your own comments" }, 403);
	const deletedAt = nowIso();
	await c.env.DB.prepare("UPDATE comments SET deleted_at = ? WHERE id = ?").bind(deletedAt, before.id).run();
	await logChange(c.env.DB, {
		entityType: "comment",
		entityId: String(before.id),
		action: "delete",
		before,
		after: { ...before, deleted_at: deletedAt },
		actorId: user.id,
	});
	return c.json({ ok: true });
});

app.post("/api/posts/:id/react", async (c) => {
	const user = currentUser(c);
	const postId = c.req.param("id");
	const body = await c.req.json<{ emoji?: string }>();
	const emoji = asString(body.emoji) || "heart";
	const existing = await c.env.DB.prepare("SELECT * FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?")
		.bind(postId, user.id, emoji)
		.first();
	if (existing) {
		await c.env.DB.prepare("DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND emoji = ?")
			.bind(postId, user.id, emoji)
			.run();
	} else {
		await c.env.DB.prepare("INSERT INTO reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)")
			.bind(postId, user.id, emoji, nowIso())
			.run();
	}
	return c.json({ post: await getPost(c.env.DB, user.id, postId) });
});

app.get("/api/reminders", async (c) => {
	const user = currentUser(c);
	return c.json({ reminders: await listReminders(c.env.DB, user.id) });
});

app.post("/api/reminders", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Record<string, unknown>>();
	const title = asString(body.title);
	if (!title) return c.json({ error: "A reminder needs a title" }, 400);
	const row = {
		id: newId(),
		author_id: user.id,
		title,
		body: asString(body.body),
		due_at: asString(body.dueAt) || null,
		audience: (asString(body.audience) === "family" ? "family" : "self") as ReminderAudience,
		completed: 0,
		created_at: nowIso(),
		updated_at: nowIso(),
	};
	await c.env.DB.prepare(
		"INSERT INTO reminders (id, author_id, title, body, due_at, audience, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(row.id, row.author_id, row.title, row.body, row.due_at, row.audience, row.completed, row.created_at, row.updated_at)
		.run();
	await logChange(c.env.DB, {
		entityType: "reminder",
		entityId: row.id,
		action: "create",
		before: null,
		after: row,
		actorId: user.id,
	});
	return c.json({ reminders: await listReminders(c.env.DB, user.id) }, 201);
});

app.patch("/api/reminders/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM reminders WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Reminder not found" }, 404);
	const familyComplete = before.audience === "family";
	if (!canManageContent(user, String(before.author_id)) && !familyComplete) {
		return c.json({ error: "You can only update your reminders" }, 403);
	}
	const body = await c.req.json<Record<string, unknown>>();
	const next = {
		...before,
		title: asString(body.title, String(before.title)),
		body: asString(body.body, String(before.body)),
		due_at: body.dueAt === undefined ? before.due_at : asString(body.dueAt) || null,
		completed: body.completed === undefined ? before.completed : body.completed ? 1 : 0,
		updated_at: nowIso(),
	};
	if (!canManageContent(user, String(before.author_id))) {
		next.title = String(before.title);
		next.body = String(before.body);
		next.due_at = (before.due_at as string | null) ?? null;
	}
	await c.env.DB.prepare("UPDATE reminders SET title = ?, body = ?, due_at = ?, completed = ?, updated_at = ? WHERE id = ?")
		.bind(next.title, next.body, next.due_at, next.completed, next.updated_at, before.id)
		.run();
	await logChange(c.env.DB, {
		entityType: "reminder",
		entityId: String(before.id),
		action: "update",
		before,
		after: next,
		actorId: user.id,
	});
	return c.json({ reminders: await listReminders(c.env.DB, user.id) });
});

app.delete("/api/reminders/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM reminders WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Reminder not found" }, 404);
	if (!canManageContent(user, String(before.author_id))) return c.json({ error: "You can only remove your reminders" }, 403);
	await c.env.DB.prepare("DELETE FROM reminders WHERE id = ?").bind(before.id).run();
	await logChange(c.env.DB, {
		entityType: "reminder",
		entityId: String(before.id),
		action: "delete",
		before,
		after: null,
		actorId: user.id,
	});
	return c.json({ ok: true });
});

app.get("/api/recipes", async (c) => c.json({ recipes: await listRecipes(c.env.DB) }));

app.post("/api/recipes", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Record<string, unknown>>();
	const title = asString(body.title);
	if (!title) return c.json({ error: "Give the recipe a name" }, 400);
	const now = nowIso();
	const row = {
		id: newId(),
		title,
		description: asString(body.description),
		ingredients_json: JSON.stringify(asStringArray(body.ingredients)),
		steps_json: JSON.stringify(asStringArray(body.steps)),
		notes: asString(body.notes),
		media_json: JSON.stringify(asStringArray(body.mediaKeys)),
		author_id: user.id,
		created_at: now,
		updated_at: now,
	};
	await c.env.DB.prepare(
		"INSERT INTO recipes (id, title, description, ingredients_json, steps_json, notes, media_json, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(
			row.id,
			row.title,
			row.description,
			row.ingredients_json,
			row.steps_json,
			row.notes,
			row.media_json,
			row.author_id,
			row.created_at,
			row.updated_at,
		)
		.run();
	await logChange(c.env.DB, {
		entityType: "recipe",
		entityId: row.id,
		action: "create",
		before: null,
		after: row,
		actorId: user.id,
	});
	return c.json({ recipe: await getRecipe(c.env.DB, row.id) }, 201);
});

app.get("/api/recipes/:id", async (c) => {
	const recipe = await getRecipe(c.env.DB, c.req.param("id"));
	if (!recipe) return c.json({ error: "Recipe not found" }, 404);
	return c.json({ recipe });
});

app.patch("/api/recipes/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM recipes WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Recipe not found" }, 404);
	const body = await c.req.json<Record<string, unknown>>();
	const next = {
		...before,
		title: asString(body.title, String(before.title)),
		description: asString(body.description, String(before.description)),
		ingredients_json: body.ingredients ? JSON.stringify(asStringArray(body.ingredients)) : before.ingredients_json,
		steps_json: body.steps ? JSON.stringify(asStringArray(body.steps)) : before.steps_json,
		notes: asString(body.notes, String(before.notes)),
		media_json: body.mediaKeys ? JSON.stringify(asStringArray(body.mediaKeys)) : before.media_json,
		updated_at: nowIso(),
	};
	await c.env.DB.prepare(
		"UPDATE recipes SET title = ?, description = ?, ingredients_json = ?, steps_json = ?, notes = ?, media_json = ?, updated_at = ? WHERE id = ?",
	)
		.bind(next.title, next.description, next.ingredients_json, next.steps_json, next.notes, next.media_json, next.updated_at, before.id)
		.run();
	await logChange(c.env.DB, {
		entityType: "recipe",
		entityId: String(before.id),
		action: "update",
		before,
		after: next,
		actorId: user.id,
	});
	return c.json({ recipe: await getRecipe(c.env.DB, String(before.id)) });
});

app.delete("/api/recipes/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM recipes WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Recipe not found" }, 404);
	if (!canManageContent(user, String(before.author_id))) {
		return c.json({ error: "You can edit any recipe, but only the author or an admin can delete it" }, 403);
	}
	await c.env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(before.id).run();
	await logChange(c.env.DB, {
		entityType: "recipe",
		entityId: String(before.id),
		action: "delete",
		before,
		after: null,
		actorId: user.id,
	});
	return c.json({ ok: true });
});

app.get("/api/directory", async (c) => {
	const members = (await listUsers(c.env.DB)).map(toMember);
	const contacts = await listContacts(c.env.DB);
	return c.json({ members, contacts });
});

app.get("/api/members/:id", async (c) => {
	const row = await getUserById(c.env.DB, c.req.param("id"));
	if (!row?.onboarded) return c.json({ error: "Person not found" }, 404);
	return c.json({ member: toMember(row) });
});

app.post("/api/contacts", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Record<string, unknown>>();
	const fields = contactFields(body);
	if (!fields.firstName || !fields.lastName) return c.json({ error: "First and last name are required" }, 400);
	if (!fields.phone && !fields.email) return c.json({ error: "Add a phone number or an email" }, 400);
	const now = nowIso();
	const displayName = contactDisplayName(fields.firstName, fields.lastName);
	const row = {
		id: newId(),
		user_id: asString(body.userId) || null,
		display_name: displayName,
		first_name: fields.firstName,
		last_name: fields.lastName,
		phone: fields.phone,
		email: fields.email,
		address: fields.address,
		notes: fields.notes,
		avatar_key: fields.avatarKey,
		avatar_style: fields.avatarStyle,
		created_by: user.id,
		created_at: now,
		updated_at: now,
	};
	await c.env.DB.prepare(
		"INSERT INTO contacts (id, user_id, display_name, first_name, last_name, phone, email, address, notes, avatar_key, avatar_style, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(
			row.id,
			row.user_id,
			row.display_name,
			row.first_name,
			row.last_name,
			row.phone,
			row.email,
			row.address,
			row.notes,
			row.avatar_key,
			row.avatar_style,
			row.created_by,
			row.created_at,
			row.updated_at,
		)
		.run();
	await logChange(c.env.DB, {
		entityType: "contact",
		entityId: row.id,
		action: "create",
		before: null,
		after: row,
		actorId: user.id,
	});
	return c.json({ contact: toContact(row), contacts: await listContacts(c.env.DB) }, 201);
});

app.patch("/api/contacts/:id", async (c) => {
	const user = currentUser(c);
	const before = await getContact(c.env.DB, c.req.param("id"));
	if (!before) return c.json({ error: "Contact not found" }, 404);
	if (!canManageContent(user, before.created_by)) {
		return c.json({ error: "Only the person who added this contact or an admin can edit it" }, 403);
	}
	const body = await c.req.json<Record<string, unknown>>();
	const fields = contactFields(body, before);
	if (!fields.firstName || !fields.lastName) return c.json({ error: "First and last name are required" }, 400);
	if (!fields.phone && !fields.email) return c.json({ error: "Add a phone number or an email" }, 400);
	const next = {
		...before,
		display_name: contactDisplayName(fields.firstName, fields.lastName),
		first_name: fields.firstName,
		last_name: fields.lastName,
		phone: fields.phone,
		email: fields.email,
		address: fields.address,
		notes: fields.notes,
		avatar_key: fields.avatarKey,
		avatar_style: fields.avatarStyle,
		updated_at: nowIso(),
	};
	await c.env.DB.prepare(
		"UPDATE contacts SET display_name = ?, first_name = ?, last_name = ?, phone = ?, email = ?, address = ?, notes = ?, avatar_key = ?, avatar_style = ?, updated_at = ? WHERE id = ?",
	)
		.bind(
			next.display_name,
			next.first_name,
			next.last_name,
			next.phone,
			next.email,
			next.address,
			next.notes,
			next.avatar_key,
			next.avatar_style,
			next.updated_at,
			before.id,
		)
		.run();
	await logChange(c.env.DB, {
		entityType: "contact",
		entityId: before.id,
		action: "update",
		before,
		after: next,
		actorId: user.id,
	});
	return c.json({ contacts: await listContacts(c.env.DB) });
});

app.delete("/api/contacts/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Contact not found" }, 404);
	if (!canManageContent(user, String(before.created_by))) {
		return c.json({ error: "Only the person who added this contact or an admin can delete it" }, 403);
	}
	await c.env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(before.id).run();
	await logChange(c.env.DB, {
		entityType: "contact",
		entityId: String(before.id),
		action: "delete",
		before,
		after: null,
		actorId: user.id,
	});
	return c.json({ ok: true });
});

app.get("/api/gallery", async (c) => {
	const album = c.req.query("album") || undefined;
	return c.json({ items: await listGallery(c.env.DB, album) });
});

app.post("/api/gallery", async (c) => {
	const user = currentUser(c);
	const body = await c.req.json<Record<string, unknown>>();
	const mediaKey = asString(body.mediaKey);
	if (!mediaKey) return c.json({ error: "Upload a photo first" }, 400);
	const now = nowIso();
	const row = {
		id: newId(),
		title: asString(body.title),
		caption: asString(body.caption),
		album: asString(body.album) || "Family",
		media_key: mediaKey,
		uploaded_by: user.id,
		created_at: now,
		updated_at: now,
	};
	await c.env.DB.prepare(
		"INSERT INTO gallery_items (id, title, caption, album, media_key, uploaded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
	)
		.bind(row.id, row.title, row.caption, row.album, row.media_key, row.uploaded_by, row.created_at, row.updated_at)
		.run();
	await logChange(c.env.DB, {
		entityType: "gallery",
		entityId: row.id,
		action: "create",
		before: null,
		after: row,
		actorId: user.id,
	});
	return c.json({ items: await listGallery(c.env.DB) }, 201);
});

app.patch("/api/gallery/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM gallery_items WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Photo not found" }, 404);
	const body = await c.req.json<Record<string, unknown>>();
	const next = {
		...before,
		title: asString(body.title, String(before.title)),
		caption: asString(body.caption, String(before.caption)),
		album: asString(body.album, String(before.album)),
		updated_at: nowIso(),
	};
	await c.env.DB.prepare("UPDATE gallery_items SET title = ?, caption = ?, album = ?, updated_at = ? WHERE id = ?")
		.bind(next.title, next.caption, next.album, next.updated_at, before.id)
		.run();
	await logChange(c.env.DB, {
		entityType: "gallery",
		entityId: String(before.id),
		action: "update",
		before,
		after: next,
		actorId: user.id,
	});
	return c.json({ items: await listGallery(c.env.DB) });
});

app.delete("/api/gallery/:id", async (c) => {
	const user = currentUser(c);
	const before = await c.env.DB.prepare("SELECT * FROM gallery_items WHERE id = ?").bind(c.req.param("id")).first();
	if (!before) return c.json({ error: "Photo not found" }, 404);
	if (!canManageContent(user, String(before.uploaded_by))) {
		return c.json({ error: "You can only remove photos you added" }, 403);
	}
	await c.env.DB.prepare("DELETE FROM gallery_items WHERE id = ?").bind(before.id).run();
	await logChange(c.env.DB, {
		entityType: "gallery",
		entityId: String(before.id),
		action: "delete",
		before,
		after: null,
		actorId: user.id,
	});
	return c.json({ ok: true });
});

app.post("/api/media", async (c) => {
	const user = currentUser(c);
	const form = await c.req.parseBody();
	const file = form.file;
	if (!(file instanceof File)) return c.json({ error: "Choose a photo to upload" }, 400);
	if (file.size > MAX_UPLOAD) return c.json({ error: "Photos need to be 12MB or smaller" }, 400);
	if (!file.type.startsWith("image/")) return c.json({ error: "Only images can be added" }, 400);
	const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
	const key = `media/${user.id}/${newId()}.${ext.replace(/[^a-z0-9]/g, "")}`;
	await c.env.MEDIA.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000" },
		customMetadata: { uploadedBy: user.id },
	});
	return c.json({ key, url: mediaUrl(key) }, 201);
});

app.get("/api/media/*", async (c) => {
	const key = decodeURIComponent(c.req.path.replace(/^\/api\/media\//, ""));
	const object = await c.env.MEDIA.get(key);
	if (!object) return c.json({ error: "File not found" }, 404);
	const headers = new Headers();
	const contentType = object.httpMetadata?.contentType || "application/octet-stream";
	headers.set("Content-Type", contentType);
	headers.set("Cache-Control", object.httpMetadata?.cacheControl || "private, max-age=3600");
	return new Response(object.body, { headers });
});

app.get("/api/admin/changes", async (c) => {
	adminUser(c);
	return c.json({ changes: await listChanges(c.env.DB) });
});

app.post("/api/admin/changes/:id/revert", async (c) => {
	const user = adminUser(c);
	const body = await c.req.json<{ cascade?: boolean }>().catch(() => ({ cascade: false }));
	await revertChange(c.env.DB, c.req.param("id"), user.id, { cascade: Boolean(body.cascade) });
	return c.json({ ok: true, changes: await listChanges(c.env.DB) });
});

app.post("/api/admin/members/:id/role", async (c) => {
	const admin = adminUser(c);
	const target = await getUserById(c.env.DB, c.req.param("id"));
	if (!target) return c.json({ error: "Person not found" }, 404);
	const body = await c.req.json<{ role?: Role }>();
	const role: Role = body.role === "admin" ? "admin" : "member";
	if (target.id === admin.id && role !== "admin") {
		return c.json({ error: "You cannot remove your own admin access" }, 400);
	}
	const next = { ...target, role, updated_at: nowIso() };
	await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").bind(role, next.updated_at, target.id).run();
	await logChange(c.env.DB, {
		entityType: "user",
		entityId: target.id,
		action: "update",
		before: target,
		after: next,
		actorId: admin.id,
	});
	return c.json({ member: toMember(next) });
});

app.post("/api/admin/members/:id/migrate-email", async (c) => {
	const admin = adminUser(c);
	const target = await getUserById(c.env.DB, c.req.param("id"));
	if (!target) return c.json({ error: "Person not found" }, 404);
	const body = await c.req.json<{ familyEmail?: string }>();
	const nextEmail = normalizeEmail(asString(body.familyEmail));
	if (!isFamilyEmail(nextEmail, c.env)) {
		return c.json({ error: `New login must be a @${c.env.ALLOWED_EMAIL_DOMAIN || "winstead.family"} email` }, 400);
	}
	const taken = await getUserByEmail(c.env.DB, nextEmail);
	if (taken && taken.id !== target.id) return c.json({ error: "That family email already belongs to someone" }, 400);
	const now = nowIso();
	const next = { ...target, family_email: nextEmail, updated_at: now };
	await c.env.DB.batch([
		c.env.DB.prepare("UPDATE users SET family_email = ?, updated_at = ? WHERE id = ?").bind(nextEmail, now, target.id),
		c.env.DB.prepare(
			"INSERT INTO email_migrations (id, user_id, old_email, new_email, migrated_by, migrated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(newId(), target.id, target.family_email, nextEmail, admin.id, now),
	]);
	await logChange(c.env.DB, {
		entityType: "user",
		entityId: target.id,
		action: "update",
		before: target,
		after: next,
		actorId: admin.id,
	});
	return c.json({ member: toMember(next) });
});

app.get("/api/admin/members", async (c) => {
	adminUser(c);
	return c.json({ members: (await listUsers(c.env.DB, { includePending: true })).map(toMember) });
});

app.post("/api/admin/members/:id/reset", async (c) => {
	const admin = adminUser(c);
	const target = await getUserById(c.env.DB, c.req.param("id"));
	if (!target) return c.json({ error: "Person not found" }, 404);
	const body = await c.req.json<{ resetProfile?: boolean; deletePosts?: boolean; deletePhotos?: boolean }>();
	const options = {
		resetProfile: Boolean(body.resetProfile),
		deletePosts: Boolean(body.deletePosts),
		deletePhotos: Boolean(body.deletePhotos),
	};
	try {
		const result = await resetMemberAccount(c.env.DB, c.env.MEDIA, target, options, admin.id);
		return c.json({
			member: toMember(result.member),
			deletedPosts: result.deletedPosts,
			deletedPhotos: result.deletedPhotos,
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "Could not clear that account" }, 400);
	}
});

app.delete("/api/admin/:type/:id", async (c) => {
	const admin = adminUser(c);
	const type = c.req.param("type");
	const id = c.req.param("id");
	const table =
		type === "posts"
			? "posts"
			: type === "comments"
				? "comments"
				: type === "recipes"
					? "recipes"
					: type === "contacts"
						? "contacts"
						: type === "gallery"
							? "gallery_items"
							: type === "reminders"
								? "reminders"
								: null;
	if (!table) return c.json({ error: "Unknown record type" }, 400);
	const before = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
	if (!before) return c.json({ error: "Record not found" }, 404);
	await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
	if (table === "gallery_items" && typeof before.media_key === "string") {
		await c.env.MEDIA.delete(before.media_key);
	}
	await logChange(c.env.DB, {
		entityType: type === "gallery" ? "gallery" : type.replace(/s$/, ""),
		entityId: id,
		action: "delete",
		before,
		after: null,
		actorId: admin.id,
	});
	return c.json({ ok: true });
});

app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found" }, 404);
	return c.body(null, 404);
});

export default {
	fetch(request, env, ctx) {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
