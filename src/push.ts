import { api } from "./api";

type NavigatorStandalone = Navigator & { standalone?: boolean };

export function isIosDevice() {
	const ua = navigator.userAgent;
	if (/iPad|iPhone|iPod/.test(ua)) return true;
	return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isStandaloneDisplay() {
	const nav = navigator as NavigatorStandalone;
	return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function pushSupported() {
	return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function urlBase64ToUint8Array(value: string) {
	const padding = "=".repeat((4 - (value.length % 4)) % 4);
	const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
	const output = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
	return output;
}

export async function registerPushWorker() {
	if (!("serviceWorker" in navigator)) return null;
	return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function currentPushEndpoint() {
	if (!pushSupported()) return "";
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	return subscription?.endpoint || "";
}

export async function enablePush(vapidPublicKey: string) {
	if (!pushSupported()) throw new Error("This browser cannot receive house alerts");
	if (isIosDevice() && !isStandaloneDisplay()) {
		throw new Error("Add Winstead to your Home Screen, then open it from there to turn on alerts");
	}
	await registerPushWorker();
	const permission = await Notification.requestPermission();
	if (permission !== "granted") throw new Error("Alerts are blocked. Allow notifications for Winstead in Settings");
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
	});
	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
		throw new Error("This device did not return a push subscription");
	}
	await api.pushSubscribe({
		endpoint: json.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
	});
	return json.endpoint;
}

export async function disablePush() {
	if (!pushSupported()) return;
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	const endpoint = subscription?.endpoint;
	if (subscription) await subscription.unsubscribe();
	if (endpoint) await api.pushUnsubscribe(endpoint);
}

export async function syncPushSubscription(vapidPublicKey: string) {
	if (!pushSupported() || Notification.permission !== "granted") return;
	if (isIosDevice() && !isStandaloneDisplay()) return;
	await registerPushWorker();
	const registration = await navigator.serviceWorker.ready;
	let subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
		});
	}
	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
	await api.pushSubscribe({
		endpoint: json.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
	});
}
