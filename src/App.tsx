import { Component, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders, useAuth } from "./context";
import {
	AdminPage,
	AppsPage,
	ComingSoonPage,
	DirectoryPage,
	GalleryPage,
	LifePage,
	RecipesPage,
	SettingsPage,
} from "./family";
import { HomePage, LoginPage, OnboardingPage } from "./pages";
import { Shell } from "./shell";

class BootError extends Component<{ children: ReactNode }, { message: string | null }> {
	state = { message: null as string | null };
	static getDerivedStateFromError(error: Error) {
		return { message: error.message || "The house could not open." };
	}
	componentDidMount() {
		import.meta.hot?.on("vite:afterUpdate", () => {
			this.setState((current) => (current.message ? { message: null } : current));
		});
	}
	render() {
		if (this.state.message) {
			return (
				<div
					style={{
						minHeight: "100dvh",
						display: "grid",
						placeItems: "center",
						padding: 24,
						background: "#f3eee6",
						color: "#1a1612",
						fontFamily: "Inter, system-ui, sans-serif",
					}}
				>
					<div
						style={{
							width: "min(460px, 100%)",
							padding: 32,
							borderRadius: 24,
							background: "#fff8ee",
							border: "1px solid rgba(26, 22, 18, 0.08)",
							textAlign: "center",
						}}
					>
						<h1 style={{ margin: "8px 0 6px" }}>Something broke</h1>
						<p style={{ color: "#6a5f53" }}>{this.state.message}</p>
						<button
							className="btn"
							type="button"
							onClick={() => window.location.reload()}
							style={{
								border: 0,
								borderRadius: 999,
								padding: "10px 16px",
								background: "#1a1612",
								color: "#f3eee6",
								cursor: "pointer",
							}}
						>
							Reload
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

function Gate() {
	const { status } = useAuth();
	if (status === "loading") {
		return (
			<div
				style={{
					minHeight: "100dvh",
					display: "grid",
					placeItems: "center",
					padding: 24,
					background: "#f3eee6",
					color: "#1a1612",
					textAlign: "center",
				}}
			>
				<div>
					<div style={{ fontSize: 28, fontWeight: 700 }}>Winstead</div>
					<p style={{ color: "#6a5f53", margin: "8px 0 0" }}>Opening the house…</p>
				</div>
			</div>
		);
	}
	if (status === "unauthenticated") return <LoginPage />;
	if (status === "needs_onboarding") return <OnboardingPage />;
	return (
		<Routes>
			<Route element={<Shell />}>
				<Route path="/" element={<HomePage />} />
				<Route path="/life" element={<LifePage />} />
				<Route path="/life/:id" element={<LifePage />} />
				<Route path="/gallery" element={<GalleryPage />} />
				<Route path="/recipes" element={<RecipesPage />} />
				<Route path="/recipes/:id" element={<RecipesPage />} />
				<Route path="/directory" element={<DirectoryPage />} />
				<Route path="/directory/contact/:id" element={<DirectoryPage />} />
				<Route path="/directory/:id" element={<DirectoryPage />} />
				<Route path="/apps" element={<AppsPage />} />
				<Route path="/settings" element={<SettingsPage />} />
				<Route path="/admin" element={<AdminPage />} />
				<Route path="/coming-soon" element={<ComingSoonPage />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Route>
		</Routes>
	);
}

export default function App() {
	return (
		<BootError>
		<AppProviders>
			<div className="app">
				<div className="scene" aria-hidden="true" />
				<BrowserRouter>
					<Gate />
				</BrowserRouter>
			</div>
		</AppProviders>
		</BootError>
	);
}
