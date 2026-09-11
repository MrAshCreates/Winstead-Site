import { GLASS_MAX, GLASS_MIN, type Preferences } from "../shared/types";

export function mediaPath(key: string) {
	return `/api/media/${encodeURIComponent(key)}`;
}

export function applyGlassVars(transparency: number, root: HTMLElement = document.documentElement) {
	const t = Math.min(GLASS_MAX, Math.max(GLASS_MIN, transparency));
	const solid = (t - GLASS_MIN) / (GLASS_MAX - GLASS_MIN);
	const fluid = 1 - solid;
	root.style.setProperty("--glass-pct", `${26 + solid * 66}%`);
	root.style.setProperty("--glass-fill", `${26 + solid * 66}%`);
	root.style.setProperty("--glass-blur", `${12 + fluid * 22}px`);
	root.style.setProperty("--glass-sat", `${1.08 + fluid * 0.32}`);
	root.style.setProperty("--glass-shine", `${0.18 + fluid * 0.38}`);
	root.style.setProperty("--glass-radius", `${18 + fluid * 12}px`);
	root.style.setProperty("--orb-strength", `${0.35 + fluid * 0.5}`);
	root.style.setProperty("--read-boost", `${0.2 + solid * 0.55}`);
}

export function applyTheme(preferences: Preferences, root: HTMLElement = document.documentElement) {
	try {
		const dark =
			preferences.mode === "dark" ||
			(preferences.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
		root.dataset.mode = dark ? "dark" : "light";
		root.dataset.scheme = preferences.scheme;
		root.dataset.font = preferences.font;
		root.dataset.backdrop = preferences.backdrop;
		applyGlassVars(preferences.transparency, root);
		if (preferences.backdrop === "photo" && preferences.backdropKey) {
			root.style.setProperty("--backdrop-photo", `url("${mediaPath(preferences.backdropKey)}")`);
		} else {
			root.style.removeProperty("--backdrop-photo");
		}
	} catch {
		root.dataset.mode = "light";
		root.dataset.scheme = "heritage";
	}
}

export { GLASS_MIN, GLASS_MAX };
