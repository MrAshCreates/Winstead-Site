import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useTheme } from "./context";
import { Icons } from "./icons";
import { Avatar } from "./ui";

const links = [
	{ to: "/", label: "Home", icon: Icons.home },
	{ to: "/life", label: "Life", icon: Icons.life },
	{ to: "/gallery", label: "Gallery", icon: Icons.gallery },
	{ to: "/recipes", label: "Recipes", icon: Icons.recipes },
	{ to: "/directory", label: "Directory", icon: Icons.directory },
	{ to: "/apps", label: "Apps", icon: Icons.apps },
	{ to: "/settings", label: "Settings", icon: Icons.settings },
];

export function Shell() {
	const { user, site } = useAuth();
	const { preferences } = useTheme();
	if (!user) {
		return (
			<div className="center">
				<div className="spinner" />
			</div>
		);
	}
	const nav = user.role === "admin" ? [...links, { to: "/admin", label: "Admin", icon: Icons.shield }] : links;

	return (
		<div className="shell">
			<aside className="sidebar">
				<NavLink to="/" className="brand">
					<div className="monogram">W</div>
					<div>
						<h1>{site?.family.name || "Winstead"}</h1>
						<p>{site?.family.tagline}</p>
					</div>
				</NavLink>
				<nav className="nav">
					{nav.map((item) => (
						<NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
							<item.icon />
							{item.label}
						</NavLink>
					))}
				</nav>
				<NavLink to="/settings" className="userchip glass">
					<Avatar person={{ ...user, avatarStyle: preferences.avatarStyle }} />
					<div>
						<strong>{user.nickname || user.fullName}</strong>
						<span>{user.role === "admin" ? "Admin" : "Family"}</span>
					</div>
				</NavLink>
			</aside>
			<main className="content">
				<Outlet />
			</main>
			<nav className="tabbar glass">
				<NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
					<Icons.home />
					Home
				</NavLink>
				<NavLink to="/life" className={({ isActive }) => (isActive ? "active" : "")}>
					<Icons.life />
					Life
				</NavLink>
				<NavLink to="/apps" className={({ isActive }) => (isActive ? "active" : "")}>
					<Icons.apps />
					Apps
				</NavLink>
				<NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
					<Icons.you />
					You
				</NavLink>
			</nav>
		</div>
	);
}
