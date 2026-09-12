import {
	DEFAULT_NOTIFICATION_PREFS,
	type NoticeKind,
	type NotificationPrefs,
} from "../shared/types";
import { nowIso } from "./store";
import { sendToSubscriptions, type StoredSubscription, vapidKeys } from "./push";

type PrefRow = StoredSubscription & {
	updates: number;
	comments: number;
	recipes: number;
	gallery: number;
	directory: number;
};

const PREF_FIELD: Record<NoticeKind, keyof NotificationPrefs | null> = {
	announcement: null,
	reminder: null,
	update: "updates",
	comment: "comments",
	recipe: "recipes",
	gallery: "gallery",
	directory: "directory",
};

export function actorLabel(user: { nickname: string; full_name: string }): string {
	return user.nickname.trim() || user.full_name.trim() || "Family";
}

export function snippet(text: string, max = 140): string {
	const value = text.replace(/\s+/g, " ").trim();
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

export async function getNotificationPrefs(db: D1Database, userId: string): Promise<NotificationPrefs> {
	const row = await db.prepare("SELECT * FROM notification_prefs WHERE user_id = ?").bind(userId).first<{
		updates: number;
		comments: number;
		recipes: number;
		gallery: number;
		directory: number;
	}>();
	if (!row) return { ...DEFAULT_NOTIFICATION_PREFS };
	return {
		updates: row.updates !== 0,
		comments: row.comments !== 0,
		recipes: row.recipes !== 0,
		gallery: row.gallery !== 0,
		directory: row.directory !== 0,
	};
}

export async function saveNotificationPrefs(db: D1Database, userId: string, patch: Partial<NotificationPrefs>) {
	const current = await getNotificationPrefs(db, userId);
	const next: NotificationPrefs = {
		updates: patch.updates ?? current.updates,
		comments: patch.comments ?? current.comments,
		recipes: patch.recipes ?? current.recipes,
		gallery: patch.gallery ?? current.gallery,
		directory: patch.directory ?? current.directory,
	};
	await db
		.prepare(
			`INSERT INTO notification_prefs (user_id, updates, comments, recipes, gallery, directory, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         updates = excluded.updates,
         comments = excluded.comments,
         recipes = excluded.recipes,
         gallery = excluded.gallery,
         directory = excluded.directory,
         updated_at = excluded.updated_at`,
		)
		.bind(userId, next.updates ? 1 : 0, next.comments ? 1 : 0, next.recipes ? 1 : 0, next.gallery ? 1 : 0, next.directory ? 1 : 0, nowIso())
		.run();
	return next;
}

export async function upsertPushSubscription(
	db: D1Database,
	userId: string,
	input: { endpoint: string; p256dh: string; auth: string; userAgent: string },
) {
	const now = nowIso();
	const existing = await db
		.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?")
		.bind(input.endpoint)
		.first<{ id: string }>();
	const id = existing?.id || crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         updated_at = excluded.updated_at`,
		)
		.bind(id, userId, input.endpoint, input.p256dh, input.auth, input.userAgent.slice(0, 180), now, now)
		.run();
	return id;
}

export async function removePushSubscription(db: D1Database, userId: string, endpoint: string) {
	await db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").bind(userId, endpoint).run();
}

export async function userHasSubscription(db: D1Database, userId: string): Promise<boolean> {
	const row = await db.prepare("SELECT id FROM push_subscriptions WHERE user_id = ? LIMIT 1").bind(userId).first();
	return Boolean(row);
}

export async function listUserSubscriptions(db: D1Database, userId: string): Promise<StoredSubscription[]> {
	const { results } = await db
		.prepare("SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
		.bind(userId)
		.all<StoredSubscription>();
	return results ?? [];
}

async function listTargetSubscriptions(db: D1Database, omitUserId?: string, userIds?: string[]): Promise<PrefRow[]> {
	if (userIds && userIds.length === 0) return [];
	const clauses = ["1=1"];
	const binds: string[] = [];
	if (omitUserId) {
		clauses.push("s.user_id != ?");
		binds.push(omitUserId);
	}
	if (userIds) {
		clauses.push(`s.user_id IN (${userIds.map(() => "?").join(",")})`);
		binds.push(...userIds);
	}
	const query = db.prepare(
		`SELECT
         s.id, s.user_id, s.endpoint, s.p256dh, s.auth,
         COALESCE(p.updates, 1) AS updates,
         COALESCE(p.comments, 1) AS comments,
         COALESCE(p.recipes, 1) AS recipes,
         COALESCE(p.gallery, 1) AS gallery,
         COALESCE(p.directory, 0) AS directory
       FROM push_subscriptions s
       LEFT JOIN notification_prefs p ON p.user_id = s.user_id
       WHERE ${clauses.join(" AND ")}`,
	);
	const { results } = binds.length ? await query.bind(...binds).all<PrefRow>() : await query.all<PrefRow>();
	return results ?? [];
}

export async function dispatchNotice(
	env: Env,
	notice: {
		kind: NoticeKind;
		title: string;
		body: string;
		url: string;
		tag: string;
		omitUserId?: string;
		userIds?: string[];
	},
) {
	if (!vapidKeys(env)) return;
	const pref = PREF_FIELD[notice.kind];
	const rows = await listTargetSubscriptions(env.DB, notice.omitUserId, notice.userIds);
	const subscriptions = rows.filter((row) => {
		if (!pref) return true;
		return Boolean(row[pref]);
	});
	if (subscriptions.length === 0) return;
	await sendToSubscriptions(
		env,
		subscriptions,
		{ title: notice.title, body: notice.body, url: notice.url, tag: notice.tag },
		notice.kind === "announcement" || notice.kind === "reminder" ? "high" : "normal",
	);
}

type DueReminder = {
	id: string;
	author_id: string;
	title: string;
	body: string;
	audience: string;
	due_at: string | null;
	nickname: string;
	full_name: string;
};

export async function notifyDueReminders(env: Env) {
	if (!vapidKeys(env)) return;
	const { results } = await env.DB.prepare(
		`SELECT r.id, r.author_id, r.title, r.body, r.audience, r.due_at, u.nickname, u.full_name
     FROM reminders r
     JOIN users u ON u.id = r.author_id
     WHERE r.completed = 0 AND r.due_at IS NOT NULL AND r.notified_at IS NULL`,
	).all<DueReminder>();
	const now = Date.now();
	for (const reminder of results ?? []) {
		const due = Date.parse(String(reminder.due_at));
		if (!Number.isFinite(due) || due > now) continue;
		const claimed = await env.DB.prepare("UPDATE reminders SET notified_at = ? WHERE id = ? AND notified_at IS NULL")
			.bind(nowIso(), reminder.id)
			.run();
		if (!claimed.meta.changes) continue;
		const name = actorLabel(reminder);
		const body = snippet(reminder.body ? `${reminder.title} — ${reminder.body}` : reminder.title);
		if (reminder.audience === "family") {
			await dispatchNotice(env, {
				kind: "reminder",
				title: "Family reminder",
				body,
				url: "/life",
				tag: `reminder-due-${reminder.id}`,
			});
		} else {
			await dispatchNotice(env, {
				kind: "reminder",
				title: `${name}'s reminder`,
				body,
				url: "/life",
				tag: `reminder-due-${reminder.id}`,
				userIds: [reminder.author_id],
			});
		}
	}
}
