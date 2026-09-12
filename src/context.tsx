import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { AVATAR_STYLES, BACKDROP_STYLES, DEFAULT_PREFERENCES, GLASS_MAX, GLASS_MIN, type MeResponse, type Member, type Preferences, type SiteSettings } from "../shared/types";
import { api } from "./api";
import { applyTheme } from "./theme";
import { registerPushWorker } from "./push";

type AuthValue = {
	status: "loading" | MeResponse["status"];
	me: MeResponse | null;
	user: Member | null;
	site: SiteSettings | null;
	error: string | null;
	refresh: () => Promise<void>;
	devLogin: (email: string) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const ThemeContext = createContext<{
	preferences: Preferences;
	setPreferences: (next: Partial<Preferences>) => Promise<void>;
} | null>(null);
const ToastContext = createContext<(message: string) => void>(() => undefined);

function clampPreferences(preferences: Preferences): Preferences {
	return {
		...preferences,
		transparency: Math.min(
			GLASS_MAX,
			Math.max(GLASS_MIN, Number(preferences.transparency) || DEFAULT_PREFERENCES.transparency),
		),
		avatarStyle: AVATAR_STYLES.some((item) => item.id === preferences.avatarStyle)
			? preferences.avatarStyle
			: DEFAULT_PREFERENCES.avatarStyle,
		backdrop: BACKDROP_STYLES.some((item) => item.id === preferences.backdrop)
			? preferences.backdrop
			: DEFAULT_PREFERENCES.backdrop,
		backdropKey: preferences.backdropKey || null,
	};
}

function applyPreferences(preferences: Preferences) {
	applyTheme(preferences);
	localStorage.setItem("winstead-prefs", JSON.stringify(preferences));
}

export function AppProviders({ children }: { children: ReactNode }) {
	const [me, setMe] = useState<MeResponse | null>(null);
	const [status, setStatus] = useState<AuthValue["status"]>("loading");
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [preferences, setPrefState] = useState<Preferences>(() => {
		try {
			return clampPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem("winstead-prefs") || "{}") });
		} catch {
			return DEFAULT_PREFERENCES;
		}
	});
	const saveTimer = useRef<number>(0);

	const refresh = useCallback(async () => {
		try {
			const data = await api.me();
			setMe(data);
			setStatus(data.status);
			setError(null);
			if (data.status === "ok") {
				const next = clampPreferences(data.user.preferences);
				setPrefState(next);
				applyPreferences(next);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not reach the family home");
			setStatus("unauthenticated");
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		applyPreferences(preferences);
		if (preferences.mode !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyPreferences(preferences);
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [preferences]);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(null), 2800);
		return () => window.clearTimeout(timer);
	}, [toast]);

	useEffect(() => {
		if (status !== "ok") return;
		void registerPushWorker();
	}, [status]);

	const setPreferences = useCallback(
		async (next: Partial<Preferences>) => {
			const merged = clampPreferences({ ...preferences, ...next });
			setPrefState(merged);
			applyPreferences(merged);
			if (me?.status !== "ok") return;
			window.clearTimeout(saveTimer.current);
			saveTimer.current = window.setTimeout(() => {
				void api.savePreferences(merged).then((saved) => {
					setPrefState((current) => ({ ...current, ...saved.preferences, ...merged }));
				});
			}, 280);
		},
		[me, preferences],
	);

	const authValue = useMemo<AuthValue>(
		() => ({
			status,
			me,
			user: me?.status === "ok" ? me.user : null,
			site: me && "site" in me ? me.site : null,
			error,
			refresh,
			devLogin: async (email: string) => {
				await api.devLogin(email);
				await refresh();
			},
			logout: async () => {
				await api.devLogout();
				await refresh();
			},
		}),
		[error, me, refresh, status],
	);

	return (
		<AuthContext.Provider value={authValue}>
			<ThemeContext.Provider value={{ preferences, setPreferences }}>
				<ToastContext.Provider value={setToast}>
					{children}
					{toast ? <div className="toast glass">{toast}</div> : null}
				</ToastContext.Provider>
			</ThemeContext.Provider>
		</AuthContext.Provider>
	);
}

const fallbackAuth: AuthValue = {
	status: "loading",
	me: null,
	user: null,
	site: null,
	error: null,
	refresh: async () => undefined,
	devLogin: async () => undefined,
	logout: async () => undefined,
};

const fallbackTheme = {
	preferences: DEFAULT_PREFERENCES,
	setPreferences: async () => undefined,
};

export function useAuth() {
	return useContext(AuthContext) ?? fallbackAuth;
}

export function useTheme() {
	return useContext(ThemeContext) ?? fallbackTheme;
}

export function useToast() {
	return useContext(ToastContext);
}
