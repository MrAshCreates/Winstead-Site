self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
	let data = { title: "Winstead", body: "Something new at the house.", url: "/", tag: "winstead" };
	try {
		if (event.data) data = { ...data, ...event.data.json() };
	} catch {
		try {
			if (event.data) data = { ...data, body: event.data.text() };
		} catch {
			/* keep default */
		}
	}
	event.waitUntil(
		self.registration.showNotification(data.title || "Winstead", {
			body: data.body || "Something new at the house.",
			data: { url: data.url || "/" },
			tag: data.tag || "winstead",
			renotify: true,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of windows) {
				if ("focus" in client) {
					await client.focus();
					if ("navigate" in client) {
						try {
							await client.navigate(target);
						} catch {
							/* iOS may ignore navigate */
						}
					}
					return;
				}
			}
			await self.clients.openWindow(target);
		})(),
	);
});
