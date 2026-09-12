import { buildPushPayload } from "@block65/webcrypto-web-push";

export type StoredSubscription = {
	id: string;
	user_id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
};

type Vapid = {
	subject: string;
	publicKey: string;
	privateKey: string;
};

export function vapidPublicKey(env: Env): string {
	return env.VAPID_PUBLIC_KEY?.trim() || "";
}

export function vapidKeys(env: Env): Vapid | null {
	const publicKey = vapidPublicKey(env);
	const privateKey = env.VAPID_PRIVATE_KEY?.trim() || "";
	if (!publicKey || !privateKey) return null;
	return {
		publicKey,
		privateKey,
		subject: env.VAPID_SUBJECT?.trim() || "mailto:asher@winstead.family",
	};
}

type Waiter = { waitUntil: (promise: Promise<unknown>) => void };

export function enqueueNotify(ctx: Waiter | undefined, work: Promise<unknown>) {
	const caught = work.catch((error) => console.error("push", error));
	if (ctx?.waitUntil) ctx.waitUntil(caught);
}

export async function sendWebPush(
	env: Env,
	subscription: StoredSubscription,
	payload: { title: string; body: string; url: string; tag?: string },
	urgency: "high" | "normal" = "normal",
): Promise<"ok" | "gone" | "fail"> {
	const vapid = vapidKeys(env);
	if (!vapid) return "fail";
	if (!subscription.endpoint.startsWith("https://")) return "gone";
	try {
		const built = await buildPushPayload(
			{
				data: JSON.stringify({
					title: payload.title,
					body: payload.body,
					url: payload.url,
					tag: payload.tag || "winstead",
				}),
				options: { ttl: urgency === "high" ? 60 * 60 * 12 : 60 * 60 * 4, urgency },
			},
			{
				endpoint: subscription.endpoint,
				expirationTime: null,
				keys: { p256dh: subscription.p256dh, auth: subscription.auth },
			},
			vapid,
		);
		const headers = new Headers();
		headers.set("Authorization", built.headers.authorization);
		headers.set("TTL", built.headers.ttl);
		headers.set("Content-Encoding", built.headers["content-encoding"]);
		headers.set("Content-Type", built.headers["content-type"]);
		headers.set("Content-Length", built.headers["content-length"]);
		if (built.headers.urgency) headers.set("Urgency", built.headers.urgency);
		if (built.headers.topic) headers.set("Topic", built.headers.topic);
		const response = await fetch(subscription.endpoint, {
			method: built.method,
			headers,
			body: built.body,
		});
		if (response.status === 201 || response.status === 200) return "ok";
		if (response.status === 404 || response.status === 410) return "gone";
		const detail = await response.text().catch(() => "");
		console.error("push status", response.status, subscription.endpoint.slice(0, 48), detail.slice(0, 180));
		return "fail";
	} catch (error) {
		console.error("push send", error);
		return "fail";
	}
}

export async function deleteSubscription(db: D1Database, id: string) {
	await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id).run();
}

export async function sendToSubscriptions(
	env: Env,
	subscriptions: StoredSubscription[],
	payload: { title: string; body: string; url: string; tag?: string },
	urgency: "high" | "normal" = "normal",
) {
	for (let i = 0; i < subscriptions.length; i += 8) {
		const batch = subscriptions.slice(i, i + 8);
		await Promise.all(
			batch.map(async (subscription) => {
				const result = await sendWebPush(env, subscription, payload, urgency);
				if (result === "gone") await deleteSubscription(env.DB, subscription.id);
			}),
		);
	}
}
