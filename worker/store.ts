import type {
	ChangeAction,
	ChangeLogEntry,
	Comment,
	ExtraContact,
	GalleryItem,
	MediaRef,
	Member,
	Post,
	Preferences,
	Recipe,
	Reminder,
	Role,
	SiteSettings,
	SocialLink,
} from "../shared/types";
import { DEFAULT_PREFERENCES, GLASS_MAX, GLASS_MIN, AVATAR_STYLES, BACKDROP_STYLES, REVERT_WINDOW_MS } from "../shared/types";
import type { AvatarStyle, BackdropStyle, ChangeFieldDiff } from "../shared/types";
import { bootstrapAdminEmail, normalizeEmail } from "./auth";

export type UserRow = {
	id: string;
	family_email: string;
	personal_email: string;
	full_name: string;
	nickname: string;
	date_of_birth: string;
	residence: string;
	phone: string;
	socials_json: string;
	role: Role;
	onboarded: number;
	avatar_key: string | null;
	preferences_json: string;
	created_at: string;
	updated_at: string;
};

export function nowIso(): string {
	return new Date().toISOString();
}

export function newId(): string {
	return crypto.randomUUID();
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

export function mediaUrl(key: string): string {
	return `/api/media/${encodeURIComponent(key)}`;
}

export function toMedia(keys: string[]): MediaRef[] {
	return keys.filter(Boolean).map((key) => ({ key, url: mediaUrl(key) }));
}

export function mergePreferences(raw: string | null | undefined): Preferences {
	const parsed = parseJson<Partial<Preferences>>(raw, {});
	const avatarStyle = AVATAR_STYLES.some((item) => item.id === parsed.avatarStyle)
		? (parsed.avatarStyle as AvatarStyle)
		: DEFAULT_PREFERENCES.avatarStyle;
	const backdrop = BACKDROP_STYLES.some((item) => item.id === parsed.backdrop)
		? (parsed.backdrop as BackdropStyle)
		: DEFAULT_PREFERENCES.backdrop;
	return {
		...DEFAULT_PREFERENCES,
		...parsed,
		avatarStyle,
		backdrop,
		backdropKey: typeof parsed.backdropKey === "string" && parsed.backdropKey ? parsed.backdropKey : null,
		transparency: Math.min(GLASS_MAX, Math.max(GLASS_MIN, Number(parsed.transparency ?? DEFAULT_PREFERENCES.transparency))),
	};
}

function faceOf(row: {
	id?: string;
	author_id?: string;
	uploaded_by?: string;
	full_name: string;
	nickname: string;
	avatar_key: string | null;
	preferences_json?: string | null;
	role?: Role;
}) {
	const style = mergePreferences(row.preferences_json).avatarStyle;
	return {
		id: row.id || row.author_id || row.uploaded_by || "",
		fullName: row.full_name,
		nickname: row.nickname,
		avatarUrl: row.avatar_key ? mediaUrl(row.avatar_key) : null,
		avatarStyle: style,
		role: row.role ?? "member",
	};
}

export function toMember(row: UserRow): Member {
	return {
		id: row.id,
		familyEmail: row.family_email,
		personalEmail: row.personal_email,
		fullName: row.full_name,
		nickname: row.nickname,
		dateOfBirth: row.date_of_birth,
		residence: row.residence,
		phone: row.phone,
		socials: parseJson<SocialLink[]>(row.socials_json, []),
		role: row.role,
		onboarded: Boolean(row.onboarded),
		avatarUrl: row.avatar_key ? mediaUrl(row.avatar_key) : null,
		avatarStyle: mergePreferences(row.preferences_json).avatarStyle,
		preferences: mergePreferences(row.preferences_json),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
	return db
		.prepare("SELECT * FROM users WHERE family_email = ?")
		.bind(normalizeEmail(email))
		.first<UserRow>();
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
	return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
}

export async function listUsers(db: D1Database, options: { includePending?: boolean } = {}): Promise<UserRow[]> {
	const sql = options.includePending
		? "SELECT * FROM users ORDER BY onboarded DESC, full_name COLLATE NOCASE, family_email COLLATE NOCASE"
		: "SELECT * FROM users WHERE onboarded = 1 ORDER BY full_name COLLATE NOCASE";
	const { results } = await db.prepare(sql).all<UserRow>();
	return results ?? [];
}

function chunk<T>(items: T[], size: number): T[][] {
	const groups: T[][] = [];
	for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
	return groups;
}

async function listR2Keys(bucket: R2Bucket, prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let cursor: string | undefined;
	for (;;) {
		const page = await bucket.list({ prefix, cursor, limit: 1000 });
		keys.push(...page.objects.map((object) => object.key));
		if (!page.truncated) break;
		cursor = page.cursor;
	}
	return keys;
}

async function deleteR2Keys(bucket: R2Bucket, keys: string[]): Promise<void> {
	const unique = [...new Set(keys.filter(Boolean))];
	for (const group of chunk(unique, 100)) {
		await bucket.delete(group);
	}
}

export type MemberResetOptions = {
	resetProfile: boolean;
	deletePosts: boolean;
	deletePhotos: boolean;
};

export type MemberResetResult = {
	member: UserRow;
	deletedPosts: number;
	deletedPhotos: number;
};

export async function resetMemberAccount(
	db: D1Database,
	bucket: R2Bucket,
	target: UserRow,
	options: MemberResetOptions,
	adminId: string,
): Promise<MemberResetResult> {
	if (!options.resetProfile && !options.deletePosts && !options.deletePhotos) {
		throw new Error("Choose a profile reset, posts, or photos");
	}

	const mediaKeys = new Set<string>();
	const statements: D1PreparedStatement[] = [];
	let deletedPosts = 0;
	let deletedPhotos = 0;

	if (options.deletePosts) {
		const { results: posts } = await db
			.prepare("SELECT id, media_json FROM posts WHERE author_id = ?")
			.bind(target.id)
			.all<{ id: string; media_json: string }>();
		const postIds = (posts ?? []).map((post) => post.id);
		deletedPosts = postIds.length;
		for (const post of posts ?? []) {
			for (const key of parseJson<string[]>(post.media_json, [])) {
				if (key) mediaKeys.add(key);
			}
		}
		for (const group of chunk(postIds, 40)) {
			const placeholders = group.map(() => "?").join(", ");
			statements.push(db.prepare(`DELETE FROM reactions WHERE post_id IN (${placeholders})`).bind(...group));
			statements.push(db.prepare(`DELETE FROM comments WHERE post_id IN (${placeholders})`).bind(...group));
			statements.push(db.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).bind(...group));
		}
	}

	if (options.deletePhotos) {
		const { results: photos } = await db
			.prepare("SELECT media_key FROM gallery_items WHERE uploaded_by = ?")
			.bind(target.id)
			.all<{ media_key: string }>();
		deletedPhotos = (photos ?? []).length;
		for (const photo of photos ?? []) {
			if (photo.media_key) mediaKeys.add(photo.media_key);
		}
		statements.push(db.prepare("DELETE FROM gallery_items WHERE uploaded_by = ?").bind(target.id));
	}

	let next = target;
	if (options.resetProfile) {
		if (target.avatar_key) mediaKeys.add(target.avatar_key);
		statements.push(db.prepare("DELETE FROM comments WHERE author_id = ?").bind(target.id));
		statements.push(db.prepare("DELETE FROM reactions WHERE user_id = ?").bind(target.id));
		const now = nowIso();
		next = {
			...target,
			personal_email: "",
			full_name: "",
			nickname: "",
			date_of_birth: "",
			residence: "",
			phone: "",
			socials_json: "[]",
			onboarded: 0,
			avatar_key: null,
			preferences_json: JSON.stringify(DEFAULT_PREFERENCES),
			updated_at: now,
		};
		statements.push(
			db
				.prepare(
					`UPDATE users SET personal_email = '', full_name = '', nickname = '', date_of_birth = '', residence = '', phone = '', socials_json = '[]', onboarded = 0, avatar_key = NULL, preferences_json = ?, updated_at = ? WHERE id = ?`,
				)
				.bind(next.preferences_json, now, target.id),
		);
	}

	for (const group of chunk(statements, 40)) {
		await db.batch(group);
	}

	if (options.deletePosts && options.deletePhotos) {
		for (const key of await listR2Keys(bucket, `media/${target.id}/`)) mediaKeys.add(key);
	}

	await deleteR2Keys(bucket, [...mediaKeys]);
	await logChange(db, {
		entityType: "member-reset",
		entityId: target.id,
		action: "delete",
		before: {
			user: target,
			options,
			deletedPosts,
			deletedPhotos,
		},
		after: next,
		actorId: adminId,
	});

	return { member: next, deletedPosts, deletedPhotos };
}

export async function getSite(db: D1Database): Promise<SiteSettings> {
	const { results } = await db.prepare("SELECT key, value_json FROM site_settings").all<{ key: string; value_json: string }>();
	const map = new Map((results ?? []).map((row) => [row.key, row.value_json]));
	return {
		banner: parseJson(map.get("banner"), {
			title: "Welcome home",
			body: "Share something with the family.",
			active: true,
		}),
		family: parseJson(map.get("family"), {
			name: "Winstead",
			tagline: "Our people, our stories, our table.",
		}),
	};
}

export async function setSiteValue(
	db: D1Database,
	key: string,
	value: unknown,
	actorId: string,
): Promise<void> {
	await db
		.prepare(
			"INSERT INTO site_settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
		)
		.bind(key, JSON.stringify(value), actorId, nowIso())
		.run();
}

export function assignedRole(email: string, env: Env): Role {
	return normalizeEmail(email) === bootstrapAdminEmail(env) ? "admin" : "member";
}

export async function logChange(
	db: D1Database,
	input: {
		entityType: string;
		entityId: string;
		action: ChangeAction;
		before: unknown;
		after: unknown;
		actorId: string;
	},
): Promise<void> {
	await db
		.prepare(
			"INSERT INTO change_log (id, entity_type, entity_id, action, before_json, after_json, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(
			newId(),
			input.entityType,
			input.entityId,
			input.action,
			input.before == null ? null : JSON.stringify(input.before),
			input.after == null ? null : JSON.stringify(input.after),
			input.actorId,
			nowIso(),
		)
		.run();
}

const TABLE_BY_ENTITY: Record<string, string> = {
	post: "posts",
	comment: "comments",
	recipe: "recipes",
	contact: "contacts",
	gallery: "gallery_items",
	reminder: "reminders",
	user: "users",
	site: "site_settings",
};

const SOFT_DELETE_ENTITIES = new Set(["post", "comment"]);
const PERMANENT_ENTITIES = new Set(["member-reset"]);
const FIELD_LABELS: Record<string, string> = {
	full_name: "Name",
	nickname: "Nickname",
	family_email: "Family email",
	personal_email: "Personal email",
	phone: "Phone",
	residence: "Address",
	date_of_birth: "Birthday",
	role: "Role",
	onboarded: "Profile",
	body: "Text",
	kind: "Type",
	title: "Title",
	caption: "Caption",
	album: "Album",
	description: "Description",
	notes: "Notes",
	display_name: "Name",
	first_name: "First name",
	last_name: "Last name",
	email: "Email",
	address: "Address",
	due_at: "Due",
	audience: "Audience",
	completed: "Done",
	tagline: "Tagline",
	name: "Family name",
	active: "Banner",
};

type ChangeRow = {
	id: string;
	entity_type: string;
	entity_id: string;
	action: ChangeAction;
	before_json: string | null;
	after_json: string | null;
	actor_id: string;
	actor_name?: string | null;
	created_at: string;
	reverted_at: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textOf(row: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number") return String(value);
	}
	return "";
}

function snippet(text: string, max = 100) {
	const compact = text.replace(/\s+/g, " ").trim();
	if (!compact) return "";
	return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function formatDiffValue(value: unknown): string {
	if (value == null || value === "") return "—";
	if (typeof value === "boolean") return value ? "On" : "Off";
	if (value === 0 || value === 1 || value === "0" || value === "1") return Number(value) === 1 ? "Yes" : "No";
	if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
	if (typeof value === "object") {
		const record = asRecord(value);
		return snippet(textOf(record, ["title", "body", "name", "full_name", "display_name"]) || JSON.stringify(value), 80);
	}
	return snippet(String(value), 120);
}

function labelField(key: string) {
	return FIELD_LABELS[key] || key.replace(/_/g, " ");
}

function skipDiffKey(key: string) {
	return /^(id|entity_id|author_id|created_by|uploaded_by|actor_id|created_at|updated_at|deleted_at|user_id|post_id|media_json|media_key|avatar_key|preferences_json|socials_json|ingredients_json|steps_json)$/.test(
		key,
	);
}

function collectDiffs(action: ChangeAction, before: unknown, after: unknown): ChangeFieldDiff[] {
	if (action === "create") {
		const row = asRecord(after);
		return Object.keys(row)
			.filter((key) => !skipDiffKey(key) && row[key] != null && row[key] !== "")
			.slice(0, 8)
			.map((key) => ({ field: labelField(key), from: "", to: formatDiffValue(row[key]) }));
	}
	if (action === "delete") {
		const row = asRecord(before);
		const nestedUser = asRecord(row.user);
		const source = Object.keys(nestedUser).length ? nestedUser : row;
		return Object.keys(source)
			.filter((key) => !skipDiffKey(key) && source[key] != null && source[key] !== "")
			.slice(0, 8)
			.map((key) => ({ field: labelField(key), from: formatDiffValue(source[key]), to: "Removed" }));
	}
	const prev = asRecord(before);
	const next = asRecord(after);
	if (prev.banner || prev.family || next.banner || next.family) {
		const diffs: ChangeFieldDiff[] = [];
		const bannerPrev = asRecord(prev.banner);
		const bannerNext = asRecord(next.banner);
		const familyPrev = asRecord(prev.family);
		const familyNext = asRecord(next.family);
		for (const key of ["title", "body", "active"]) {
			if (String(bannerPrev[key] ?? "") === String(bannerNext[key] ?? "")) continue;
			diffs.push({ field: labelField(key), from: formatDiffValue(bannerPrev[key]), to: formatDiffValue(bannerNext[key]) });
		}
		for (const key of ["name", "tagline"]) {
			if (String(familyPrev[key] ?? "") === String(familyNext[key] ?? "")) continue;
			diffs.push({ field: labelField(key), from: formatDiffValue(familyPrev[key]), to: formatDiffValue(familyNext[key]) });
		}
		return diffs;
	}
	const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
	const diffs: ChangeFieldDiff[] = [];
	for (const key of keys) {
		if (skipDiffKey(key)) continue;
		const from = formatDiffValue(prev[key]);
		const to = formatDiffValue(next[key]);
		if (from === to) continue;
		diffs.push({ field: labelField(key), from, to });
		if (diffs.length >= 8) break;
	}
	return diffs;
}

function describeChange(entityType: string, action: ChangeAction, before: unknown, after: unknown) {
	const prev = asRecord(before);
	const next = asRecord(after);
	const body = snippet(textOf(next, ["body"]) || textOf(prev, ["body"]));
	const title = textOf(next, ["title", "display_name"]) || textOf(prev, ["title", "display_name"]);
	const name =
		snippet(
			textOf(asRecord(prev.user), ["full_name", "nickname", "family_email"]) ||
				[textOf(next, ["first_name"]), textOf(next, ["last_name"])].filter(Boolean).join(" ") ||
				textOf(next, ["full_name", "nickname", "display_name", "family_email"]) ||
				[textOf(prev, ["first_name"]), textOf(prev, ["last_name"])].filter(Boolean).join(" ") ||
				textOf(prev, ["full_name", "nickname", "display_name", "family_email"]),
			60,
		) || "someone";

	if (entityType === "member-reset") {
		return { title: `Cleared ${name}'s account`, detail: "Profile reset and/or posts and photos removed. This cannot be undone." };
	}
	if (entityType === "site") {
		return {
			title: "Updated house copy",
			detail: snippet(textOf(asRecord(next.banner), ["title", "body"]) || textOf(asRecord(next.family), ["name", "tagline"])),
		};
	}
	if (entityType === "user") {
		if (action === "create") return { title: `${name} joined the house`, detail: "A family profile was created." };
		if (String(prev.role) !== String(next.role)) {
			return { title: `Changed ${name}'s role`, detail: `${formatDiffValue(prev.role)} → ${formatDiffValue(next.role)}` };
		}
		if (String(prev.family_email) !== String(next.family_email)) {
			return { title: `Moved ${name}'s login email`, detail: `${formatDiffValue(prev.family_email)} → ${formatDiffValue(next.family_email)}` };
		}
		return { title: `Updated ${name}'s profile`, detail: snippet(textOf(next, ["full_name", "nickname", "residence", "phone"])) };
	}
	if (entityType === "post") {
		if (action === "create") return { title: next.kind === "announcement" ? "Posted an announcement" : "Posted a family update", detail: body };
		if (action === "delete") return { title: "Removed a post", detail: body };
		return { title: "Edited a post", detail: body };
	}
	if (entityType === "comment") {
		if (action === "create") return { title: "Added a comment", detail: body };
		if (action === "delete") return { title: "Removed a comment", detail: body };
		return { title: "Edited a comment", detail: body };
	}
	if (entityType === "recipe") {
		if (action === "create") return { title: `Added recipe “${title || "Untitled"}”`, detail: snippet(textOf(next, ["description", "notes"])) };
		if (action === "delete") return { title: `Removed recipe “${title || "Untitled"}”`, detail: "" };
		return { title: `Edited recipe “${title || "Untitled"}”`, detail: "" };
	}
	if (entityType === "contact") {
		if (action === "create") return { title: `Added ${name} to the phone book`, detail: snippet(textOf(next, ["phone", "email", "address"])) };
		if (action === "delete") return { title: `Removed ${name} from the phone book`, detail: "" };
		return { title: `Edited ${name} in the phone book`, detail: snippet(textOf(next, ["phone", "email", "address"])) };
	}
	if (entityType === "gallery") {
		if (action === "create") return { title: `Added a photo${title ? ` “${title}”` : ""}`, detail: snippet(textOf(next, ["caption", "album"])) };
		if (action === "delete") return { title: `Removed a photo${title ? ` “${title}”` : ""}`, detail: "" };
		return { title: `Edited a photo${title ? ` “${title}”` : ""}`, detail: snippet(textOf(next, ["caption", "album"])) };
	}
	if (entityType === "reminder") {
		if (action === "create") return { title: `Added reminder “${title || "Untitled"}”`, detail: snippet(textOf(next, ["body"])) };
		if (action === "delete") return { title: `Removed reminder “${title || "Untitled"}”`, detail: "" };
		return { title: `Updated reminder “${title || "Untitled"}”`, detail: snippet(textOf(next, ["body"])) };
	}
	return { title: `${action} ${entityType.replace(/-/g, " ")}`, detail: body || title };
}

function blockedReasonFor(row: ChangeRow, remainingMs: number) {
	if (PERMANENT_ENTITIES.has(row.entity_type)) return "This change is permanent.";
	if (row.entity_type === "user" && row.action === "create") return "Creating a family profile can't be undone here. Clear the account instead.";
	if (!TABLE_BY_ENTITY[row.entity_type] && row.entity_type !== "site") return "This kind of change can't be reverted.";
	if (row.reverted_at) return "Already reverted.";
	if (remainingMs <= 0) return "The 24-hour window has closed.";
	return null;
}

export async function listChanges(db: D1Database): Promise<ChangeLogEntry[]> {
	const { results } = await db
		.prepare(
			`SELECT c.*, u.full_name as actor_name
       FROM change_log c
       LEFT JOIN users u ON u.id = c.actor_id
       ORDER BY c.created_at DESC
       LIMIT 200`,
		)
		.all<ChangeRow>();

	const rows = results ?? [];
	const now = Date.now();
	return rows.map((row) => {
		const before = parseJson<unknown>(row.before_json, null);
		const after = parseJson<unknown>(row.after_json, null);
		const described = describeChange(row.entity_type, row.action, before, after);
		const created = Date.parse(row.created_at);
		const windowEnds = created + REVERT_WINDOW_MS;
		const remainingMs = Math.max(0, windowEnds - now);
		const laterCount = rows.filter(
			(other) =>
				other.entity_type === row.entity_type &&
				other.entity_id === row.entity_id &&
				!other.reverted_at &&
				other.created_at > row.created_at,
		).length;
		const permanent = PERMANENT_ENTITIES.has(row.entity_type) || (row.entity_type === "user" && row.action === "create");
		const revertibleType = Boolean(TABLE_BY_ENTITY[row.entity_type]) || row.entity_type === "site";
		const canRevert = revertibleType && !permanent && !row.reverted_at && remainingMs > 0;
		return {
			id: row.id,
			entityType: row.entity_type,
			entityId: row.entity_id,
			action: row.action,
			actorName: row.actor_name || "Family",
			createdAt: row.created_at,
			revertedAt: row.reverted_at,
			canRevert,
			needsCascade: canRevert && laterCount > 0,
			laterCount,
			permanent,
			title: described.title,
			detail: described.detail,
			blockedReason: blockedReasonFor(row, remainingMs),
			windowEndsAt: new Date(windowEnds).toISOString(),
			remainingMs,
			diffs: collectDiffs(row.action, before, after),
		};
	});
}

function quoteIdent(name: string): string {
	if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid column");
	return name;
}

async function tableColumns(db: D1Database, table: string): Promise<Set<string>> {
	const { results } = await db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all<{ name: string }>();
	return new Set((results ?? []).map((row) => row.name));
}

function bindSqlValue(value: unknown) {
	if (value == null) return null;
	if (typeof value === "object") return JSON.stringify(value);
	return value;
}

function prepareRestoreRow(table: string, row: Record<string, unknown>, allowed: Set<string>) {
	const next = { ...row };
	if (table === "contacts") {
		const display = String(next.display_name || "").trim();
		if (allowed.has("first_name") && !String(next.first_name || "").trim() && display) {
			const parts = display.split(/\s+/);
			next.first_name = parts[0] || "";
			if (allowed.has("last_name") && !String(next.last_name || "").trim()) {
				next.last_name = parts.slice(1).join(" ");
			}
		}
		if (allowed.has("avatar_style") && !next.avatar_style) next.avatar_style = "gold";
	}
	return next;
}

async function restoreRow(db: D1Database, table: string, row: Record<string, unknown>): Promise<void> {
	const allowed = await tableColumns(db, table);
	const source = prepareRestoreRow(table, row, allowed);
	const cols = Object.keys(source).filter((col) => allowed.has(col));
	if (cols.length === 0) throw new Error("Nothing to restore");
	const placeholders = cols.map(() => "?").join(", ");
	const quoted = cols.map(quoteIdent).join(", ");
	const pk = table === "site_settings" ? "key" : "id";
	const updates = cols
		.filter((col) => col !== pk)
		.map((col) => `${quoteIdent(col)} = excluded.${quoteIdent(col)}`)
		.join(", ");
	const sql = updates
		? `INSERT INTO ${table} (${quoted}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${updates}`
		: `INSERT INTO ${table} (${quoted}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO NOTHING`;
	await db
		.prepare(sql)
		.bind(...cols.map((col) => bindSqlValue(source[col])))
		.run();
}

async function applyOneRevert(db: D1Database, change: ChangeRow, adminId: string): Promise<void> {
	if (change.reverted_at) return;
	if (PERMANENT_ENTITIES.has(change.entity_type)) throw new Error("This change is permanent");
	if (change.entity_type === "user" && change.action === "create") {
		throw new Error("Creating a family profile can't be undone here");
	}

	const table = TABLE_BY_ENTITY[change.entity_type];
	if (change.entity_type === "site") {
		const before = parseJson<SiteSettings | null>(change.before_json, null);
		if (!before) throw new Error("Nothing to restore");
		if (before.banner) await setSiteValue(db, "banner", before.banner, adminId);
		if (before.family) await setSiteValue(db, "family", before.family, adminId);
	} else if (!table) {
		throw new Error("Unknown entity");
	} else if (change.action === "create") {
		if (SOFT_DELETE_ENTITIES.has(change.entity_type)) {
			if (table === "comments") {
				await db.prepare("UPDATE comments SET deleted_at = ? WHERE id = ?").bind(nowIso(), change.entity_id).run();
			} else {
				await db.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(nowIso(), nowIso(), change.entity_id).run();
			}
		} else {
			await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(change.entity_id).run();
		}
	} else if (change.action === "delete" && SOFT_DELETE_ENTITIES.has(change.entity_type)) {
		if (table === "comments") {
			await db.prepare("UPDATE comments SET deleted_at = NULL WHERE id = ?").bind(change.entity_id).run();
		} else {
			await db.prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`).bind(nowIso(), change.entity_id).run();
		}
	} else {
		const before = parseJson<Record<string, unknown> | null>(change.before_json, null);
		if (!before) throw new Error("Nothing to restore");
		await restoreRow(db, table, before);
	}

	await db.prepare("UPDATE change_log SET reverted_at = ?, reverted_by = ? WHERE id = ?").bind(nowIso(), adminId, change.id).run();
}

export async function revertChange(db: D1Database, changeId: string, adminId: string, options: { cascade?: boolean } = {}): Promise<void> {
	const change = await db.prepare("SELECT * FROM change_log WHERE id = ?").bind(changeId).first<ChangeRow>();
	if (!change) throw new Error("Change not found");
	if (change.reverted_at) throw new Error("Already reverted");
	if (Date.now() - Date.parse(change.created_at) > REVERT_WINDOW_MS) {
		throw new Error("The 24-hour revert window has closed");
	}

	const { results: later } = await db
		.prepare(
			`SELECT * FROM change_log
       WHERE entity_type = ? AND entity_id = ? AND reverted_at IS NULL AND created_at > ?
       ORDER BY created_at DESC`,
		)
		.bind(change.entity_type, change.entity_id, change.created_at)
		.all<ChangeRow>();

	const newer = later ?? [];
	if (newer.length && !options.cascade) {
		throw new Error(
			newer.length === 1
				? "A newer change sits on top of this one. Revert that first, or revert to this point."
				: `${newer.length} newer changes sit on top of this one. Revert those first, or revert to this point.`,
		);
	}

	for (const item of newer) await applyOneRevert(db, item, adminId);
	await applyOneRevert(db, change, adminId);
}

export async function mapPosts(db: D1Database, viewerId: string, includeDeleted = false): Promise<Post[]> {
	const sql = includeDeleted
		? `SELECT p.*, u.full_name, u.nickname, u.avatar_key, u.role, u.preferences_json
       FROM posts p JOIN users u ON u.id = p.author_id
       ORDER BY p.created_at DESC LIMIT 80`
		: `SELECT p.*, u.full_name, u.nickname, u.avatar_key, u.role, u.preferences_json
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.created_at DESC LIMIT 80`;
	const { results } = await db.prepare(sql).all<
		UserRow & {
			id: string;
			author_id: string;
			kind: Post["kind"];
			body: string;
			media_json: string;
			created_at: string;
			updated_at: string;
			full_name: string;
			nickname: string;
			avatar_key: string | null;
			role: Role;
		}
	>();
	return hydratePosts(db, viewerId, results ?? []);
}

export async function getPost(
	db: D1Database,
	viewerId: string,
	id: string,
	includeDeleted = false,
): Promise<Post | null> {
	const row = await db
		.prepare(
			`SELECT p.*, u.full_name, u.nickname, u.avatar_key, u.role, u.preferences_json
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = ? ${includeDeleted ? "" : "AND p.deleted_at IS NULL"}`,
		)
		.bind(id)
		.first<
			UserRow & {
				id: string;
				author_id: string;
				kind: Post["kind"];
				body: string;
				media_json: string;
				created_at: string;
				updated_at: string;
			}
		>();
	if (!row) return null;
	const [post] = await hydratePosts(db, viewerId, [row]);
	if (!post) return null;
	post.comments = await listComments(db, id);
	return post;
}

async function hydratePosts(
	db: D1Database,
	viewerId: string,
	rows: Array<{
		id: string;
		author_id: string;
		kind: Post["kind"];
		body: string;
		media_json: string;
		created_at: string;
		updated_at: string;
		full_name: string;
		nickname: string;
		avatar_key: string | null;
		role: Role;
	}>,
): Promise<Post[]> {
	if (rows.length === 0) return [];
	const ids = rows.map((row) => row.id);
	const placeholders = ids.map(() => "?").join(", ");

	const [{ results: commentCounts }, { results: reactionRows }, { results: commentRows }] = await db.batch([
		db
			.prepare(
				`SELECT post_id, COUNT(*) as count FROM comments WHERE post_id IN (${placeholders}) AND deleted_at IS NULL GROUP BY post_id`,
			)
			.bind(...ids),
		db
			.prepare(`SELECT post_id, user_id, emoji FROM reactions WHERE post_id IN (${placeholders})`)
			.bind(...ids),
		db
			.prepare(
				`SELECT c.id, c.post_id, c.author_id, c.body, c.created_at, u.full_name, u.nickname, u.avatar_key, u.preferences_json
         FROM comments c JOIN users u ON u.id = c.author_id
         WHERE c.post_id IN (${placeholders}) AND c.deleted_at IS NULL
         ORDER BY c.created_at ASC`,
			)
			.bind(...ids),
	]);

	const countMap = new Map(
		((commentCounts ?? []) as { post_id: string; count: number }[]).map((row) => [row.post_id, row.count]),
	);
	const reactionMap = new Map<string, { emoji: string; count: number; me: boolean }[]>();
	for (const row of (reactionRows ?? []) as { post_id: string; user_id: string; emoji: string }[]) {
		const list = reactionMap.get(row.post_id) ?? [];
		const existing = list.find((item) => item.emoji === row.emoji);
		if (existing) {
			existing.count += 1;
			if (row.user_id === viewerId) existing.me = true;
		} else {
			list.push({ emoji: row.emoji, count: 1, me: row.user_id === viewerId });
		}
		reactionMap.set(row.post_id, list);
	}

	const commentMap = new Map<string, Comment[]>();
	for (const row of (commentRows ?? []) as {
		id: string;
		post_id: string;
		author_id: string;
		body: string;
		created_at: string;
		full_name: string;
		nickname: string;
		avatar_key: string | null;
		preferences_json?: string;
	}[]) {
		const list = commentMap.get(row.post_id) ?? [];
		list.push({
			id: row.id,
			postId: row.post_id,
			author: faceOf({
				id: row.author_id,
				full_name: row.full_name,
				nickname: row.nickname,
				avatar_key: row.avatar_key,
				preferences_json: row.preferences_json,
			}),
			body: row.body,
			createdAt: row.created_at,
		});
		commentMap.set(row.post_id, list);
	}

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		body: row.body,
		media: toMedia(parseJson<string[]>(row.media_json, [])),
		author: faceOf({
			id: row.author_id,
			full_name: row.full_name,
			nickname: row.nickname,
			avatar_key: row.avatar_key,
			preferences_json: (row as { preferences_json?: string }).preferences_json,
			role: row.role,
		}),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		commentCount: countMap.get(row.id) ?? 0,
		reactions: reactionMap.get(row.id) ?? [],
		comments: commentMap.get(row.id) ?? [],
	}));
}

export async function listComments(db: D1Database, postId: string): Promise<Comment[]> {
	const { results } = await db
		.prepare(
			`SELECT c.*, u.full_name, u.nickname, u.avatar_key, u.preferences_json
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
		)
		.bind(postId)
		.all<{
			id: string;
			post_id: string;
			author_id: string;
			body: string;
			created_at: string;
			full_name: string;
			nickname: string;
			avatar_key: string | null;
			preferences_json?: string;
		}>();

	return (results ?? []).map((row) => ({
		id: row.id,
		postId: row.post_id,
		author: faceOf({
			id: row.author_id,
			full_name: row.full_name,
			nickname: row.nickname,
			avatar_key: row.avatar_key,
			preferences_json: row.preferences_json,
		}),
		body: row.body,
		createdAt: row.created_at,
	}));
}

export async function listReminders(db: D1Database, userId: string): Promise<Reminder[]> {
	const { results } = await db
		.prepare(
			`SELECT r.*, u.full_name as author_name
       FROM reminders r JOIN users u ON u.id = r.author_id
       WHERE r.audience = 'family' OR r.author_id = ?
       ORDER BY COALESCE(r.due_at, r.created_at) ASC`,
		)
		.bind(userId)
		.all<{
			id: string;
			author_id: string;
			author_name: string;
			title: string;
			body: string;
			due_at: string | null;
			audience: Reminder["audience"];
			completed: number;
			created_at: string;
		}>();

	return (results ?? []).map((row) => ({
		id: row.id,
		authorId: row.author_id,
		authorName: row.author_name,
		title: row.title,
		body: row.body,
		dueAt: row.due_at,
		audience: row.audience,
		completed: Boolean(row.completed),
		createdAt: row.created_at,
		mine: row.author_id === userId,
	}));
}

export async function listRecipes(db: D1Database): Promise<Recipe[]> {
	const { results } = await db
		.prepare(
			`SELECT r.*, u.full_name, u.nickname, u.avatar_key, u.preferences_json
       FROM recipes r JOIN users u ON u.id = r.author_id
       ORDER BY r.updated_at DESC`,
		)
		.all<RecipeRow>();
	return (results ?? []).map(toRecipe);
}

export async function getRecipe(db: D1Database, id: string): Promise<Recipe | null> {
	const row = await db
		.prepare(
			`SELECT r.*, u.full_name, u.nickname, u.avatar_key, u.preferences_json
       FROM recipes r JOIN users u ON u.id = r.author_id
       WHERE r.id = ?`,
		)
		.bind(id)
		.first<RecipeRow>();
	return row ? toRecipe(row) : null;
}

type RecipeRow = {
	id: string;
	title: string;
	description: string;
	ingredients_json: string;
	steps_json: string;
	notes: string;
	media_json: string;
	author_id: string;
	created_at: string;
	updated_at: string;
	full_name: string;
	nickname: string;
	avatar_key: string | null;
	preferences_json?: string;
};

function toRecipe(row: RecipeRow): Recipe {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		ingredients: parseJson<string[]>(row.ingredients_json, []),
		steps: parseJson<string[]>(row.steps_json, []),
		notes: row.notes,
		media: toMedia(parseJson<string[]>(row.media_json, [])),
		author: faceOf({
			id: row.author_id,
			full_name: row.full_name,
			nickname: row.nickname,
			avatar_key: row.avatar_key,
			preferences_json: row.preferences_json,
		}),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function contactDisplayName(firstName: string, lastName: string) {
	return `${firstName} ${lastName}`.trim();
}

function splitLegacyName(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
	return { firstName: parts[0] || "", lastName: "" };
}

type ContactRow = {
	id: string;
	user_id: string | null;
	display_name: string;
	phone: string;
	email: string;
	address: string;
	notes: string;
	created_by: string;
	created_at: string;
	updated_at: string;
	first_name?: string;
	last_name?: string;
	avatar_key?: string | null;
	avatar_style?: string | null;
};

export function toContact(row: ContactRow): ExtraContact {
	const split = splitLegacyName(row.display_name);
	const firstName = (row.first_name || "").trim() || split.firstName;
	const lastName = (row.last_name || "").trim() || split.lastName;
	const style = AVATAR_STYLES.some((item) => item.id === row.avatar_style)
		? (row.avatar_style as AvatarStyle)
		: "gold";
	return {
		id: row.id,
		userId: row.user_id,
		firstName,
		lastName,
		displayName: contactDisplayName(firstName, lastName) || row.display_name,
		phone: row.phone || "",
		email: row.email || "",
		address: row.address || "",
		notes: row.notes || "",
		avatarKey: row.avatar_key || null,
		avatarUrl: row.avatar_key ? mediaUrl(row.avatar_key) : null,
		avatarStyle: style,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function listContacts(db: D1Database): Promise<ExtraContact[]> {
	const { results } = await db.prepare("SELECT * FROM contacts ORDER BY display_name COLLATE NOCASE").all<ContactRow>();
	return (results ?? []).map(toContact);
}

export async function getContact(db: D1Database, id: string): Promise<ContactRow | null> {
	return db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first<ContactRow>();
}

export async function listGallery(db: D1Database, album?: string): Promise<GalleryItem[]> {
	const query = album
		? db.prepare(
				`SELECT g.*, u.full_name, u.nickname, u.avatar_key, u.preferences_json
         FROM gallery_items g JOIN users u ON u.id = g.uploaded_by
         WHERE g.album = ?
         ORDER BY g.created_at DESC`,
			).bind(album)
		: db.prepare(
				`SELECT g.*, u.full_name, u.nickname, u.avatar_key, u.preferences_json
         FROM gallery_items g JOIN users u ON u.id = g.uploaded_by
         ORDER BY g.created_at DESC`,
			);
	const { results } = await query.all<{
		id: string;
		title: string;
		caption: string;
		album: string;
		media_key: string;
		uploaded_by: string;
		created_at: string;
		updated_at: string;
		full_name: string;
		nickname: string;
		avatar_key: string | null;
		preferences_json?: string;
	}>();
	return (results ?? []).map((row) => ({
		id: row.id,
		title: row.title,
		caption: row.caption,
		album: row.album,
		media: { key: row.media_key, url: mediaUrl(row.media_key) },
		uploadedBy: faceOf({
			id: row.uploaded_by,
			full_name: row.full_name,
			nickname: row.nickname,
			avatar_key: row.avatar_key,
			preferences_json: row.preferences_json,
		}),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}));
}

export function isAdmin(user: UserRow): boolean {
	return user.role === "admin";
}

export function canManageContent(user: UserRow, ownerId: string): boolean {
	return user.role === "admin" || user.id === ownerId;
}
