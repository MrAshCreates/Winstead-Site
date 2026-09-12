import type {
	ChangeLogEntry,
	ExtraContact,
	GalleryItem,
	MeResponse,
	Member,
	NotificationPrefs,
	NotificationStatus,
	Post,
	Preferences,
	Recipe,
	Reminder,
	Role,
	SiteSettings,
} from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers);
	if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}
	const ctrl = new AbortController();
	const timer = window.setTimeout(() => ctrl.abort(), 10000);
	if (init?.signal) {
		if (init.signal.aborted) ctrl.abort();
		else init.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
	}
	try {
		const response = await fetch(path, { ...init, headers, credentials: "include", signal: ctrl.signal });
		const data = (await response.json().catch(() => ({}))) as T & { error?: string };
		if (!response.ok) throw new Error(data.error || "Request failed");
		return data;
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error("The house took too long to answer");
		}
		throw err;
	} finally {
		window.clearTimeout(timer);
	}
}

export const api = {
	me: () => request<MeResponse>("/api/me"),
	devLogin: (email: string) => request<{ ok: boolean }>("/api/dev/login", { method: "POST", body: JSON.stringify({ email }) }),
	devLogout: () => request<{ ok: boolean }>("/api/dev/logout", { method: "POST" }),
	onboard: (body: Record<string, unknown>) => request<{ user: Member }>("/api/me/onboard", { method: "POST", body: JSON.stringify(body) }),
	updateMe: (body: Record<string, unknown>) => request<{ user: Member }>("/api/me", { method: "PATCH", body: JSON.stringify(body) }),
	savePreferences: (body: Partial<Preferences>) =>
		request<{ preferences: Preferences }>("/api/me/preferences", { method: "PATCH", body: JSON.stringify(body) }),
	site: () => request<SiteSettings>("/api/site"),
	saveSite: (body: Record<string, unknown>) => request<SiteSettings>("/api/site", { method: "PATCH", body: JSON.stringify(body) }),
	posts: () => request<{ posts: Post[] }>("/api/posts"),
	post: (id: string) => request<{ post: Post }>(`/api/posts/${id}`),
	createPost: (body: Record<string, unknown>) => request<{ post: Post }>("/api/posts", { method: "POST", body: JSON.stringify(body) }),
	updatePost: (id: string, body: Record<string, unknown>) =>
		request<{ post: Post }>(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
	deletePost: (id: string) => request<{ ok: boolean }>(`/api/posts/${id}`, { method: "DELETE" }),
	comment: (id: string, body: string) =>
		request<{ comments: Post["comments"] }>(`/api/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
	deleteComment: (id: string) => request<{ ok: boolean }>(`/api/comments/${id}`, { method: "DELETE" }),
	react: (id: string, emoji: string) => request<{ post: Post }>(`/api/posts/${id}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),
	reminders: () => request<{ reminders: Reminder[] }>("/api/reminders"),
	createReminder: (body: Record<string, unknown>) =>
		request<{ reminders: Reminder[] }>("/api/reminders", { method: "POST", body: JSON.stringify(body) }),
	updateReminder: (id: string, body: Record<string, unknown>) =>
		request<{ reminders: Reminder[] }>(`/api/reminders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
	deleteReminder: (id: string) => request<{ ok: boolean }>(`/api/reminders/${id}`, { method: "DELETE" }),
	recipes: () => request<{ recipes: Recipe[] }>("/api/recipes"),
	recipe: (id: string) => request<{ recipe: Recipe }>(`/api/recipes/${id}`),
	createRecipe: (body: Record<string, unknown>) => request<{ recipe: Recipe }>("/api/recipes", { method: "POST", body: JSON.stringify(body) }),
	updateRecipe: (id: string, body: Record<string, unknown>) =>
		request<{ recipe: Recipe }>(`/api/recipes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
	deleteRecipe: (id: string) => request<{ ok: boolean }>(`/api/recipes/${id}`, { method: "DELETE" }),
	directory: () => request<{ members: Member[]; contacts: ExtraContact[] }>("/api/directory"),
	member: (id: string) => request<{ member: Member }>(`/api/members/${id}`),
	createContact: (body: Record<string, unknown>) =>
		request<{ contact: ExtraContact; contacts: ExtraContact[] }>("/api/contacts", { method: "POST", body: JSON.stringify(body) }),
	updateContact: (id: string, body: Record<string, unknown>) =>
		request<{ contacts: ExtraContact[] }>(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
	deleteContact: (id: string) => request<{ ok: boolean }>(`/api/contacts/${id}`, { method: "DELETE" }),
	gallery: (album?: string) => request<{ items: GalleryItem[] }>(`/api/gallery${album ? `?album=${encodeURIComponent(album)}` : ""}`),
	addGallery: (body: Record<string, unknown>) => request<{ items: GalleryItem[] }>("/api/gallery", { method: "POST", body: JSON.stringify(body) }),
	updateGallery: (id: string, body: Record<string, unknown>) =>
		request<{ items: GalleryItem[] }>(`/api/gallery/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
	deleteGallery: (id: string) => request<{ ok: boolean }>(`/api/gallery/${id}`, { method: "DELETE" }),
	changes: () => request<{ changes: ChangeLogEntry[] }>("/api/admin/changes"),
	revert: (id: string, body?: { cascade?: boolean }) =>
		request<{ ok: boolean; changes: ChangeLogEntry[] }>(`/api/admin/changes/${id}/revert`, {
			method: "POST",
			body: JSON.stringify(body ?? {}),
		}),
	setRole: (id: string, role: Role) =>
		request<{ member: Member }>(`/api/admin/members/${id}/role`, { method: "POST", body: JSON.stringify({ role }) }),
	migrateEmail: (id: string, familyEmail: string) =>
		request<{ member: Member }>(`/api/admin/members/${id}/migrate-email`, { method: "POST", body: JSON.stringify({ familyEmail }) }),
	adminMembers: () => request<{ members: Member[] }>("/api/admin/members"),
	resetMember: (
		id: string,
		body: { resetProfile: boolean; deletePosts: boolean; deletePhotos: boolean },
	) =>
		request<{ member: Member; deletedPosts: number; deletedPhotos: number }>(`/api/admin/members/${id}/reset`, {
			method: "POST",
			body: JSON.stringify(body),
		}),
	hardDelete: (type: string, id: string) => request<{ ok: boolean }>(`/api/admin/${type}/${id}`, { method: "DELETE" }),
	notifications: () => request<NotificationStatus>("/api/notifications"),
	saveNotificationPrefs: (body: Partial<NotificationPrefs>) =>
		request<{ preferences: NotificationPrefs }>("/api/notifications/preferences", { method: "PATCH", body: JSON.stringify(body) }),
	pushSubscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
		request<{ ok: boolean; subscribed: boolean }>("/api/notifications/subscribe", { method: "POST", body: JSON.stringify(body) }),
	pushUnsubscribe: (endpoint: string) =>
		request<{ ok: boolean; subscribed: boolean }>("/api/notifications/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
	pushTest: () => request<{ ok: boolean }>("/api/notifications/test", { method: "POST" }),
	upload: async (file: File) => {
		const form = new FormData();
		form.set("file", file);
		return request<{ key: string; url: string }>("/api/media", { method: "POST", body: form });
	},
};

export async function uploadMany(files: FileList | File[]): Promise<string[]> {
	const keys: string[] = [];
	for (const file of Array.from(files)) {
		const uploaded = await api.upload(file);
		keys.push(uploaded.key);
	}
	return keys;
}
