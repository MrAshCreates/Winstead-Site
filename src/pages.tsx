import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post, SocialLink } from "../shared/types";
import { api, uploadMany } from "./api";
import { useAuth, useToast } from "./context";
import { Icons } from "./icons";
import { Avatar, Field, FileButton, Glass, displayName, greeting, onSubmit, when } from "./ui";

export function LoginPage() {
	const { me, error, devLogin } = useAuth();
	const [email, setEmail] = useState("asher@winstead.family");
	const [busy, setBusy] = useState(false);
	const domain = me && "allowedDomain" in me ? me.allowedDomain : "winstead.family";
	const isDev = me?.status === "unauthenticated" && me.reason === "dev";

	return (
		<div className="center">
			<Glass className="auth-card">
				<div className="monogram" style={{ margin: "0 auto 12px" }}>
					W
				</div>
				<h1>Winstead</h1>
				<p className="muted">A private home for the family.</p>
				{error ? <p className="muted">{error}</p> : null}
				{isDev ? (
					<form
						className="stack"
						style={{ marginTop: 22, textAlign: "left" }}
						onSubmit={onSubmit(async () => {
							setBusy(true);
							try {
								await devLogin(email);
							} finally {
								setBusy(false);
							}
						})}
					>
						<Field label="Family email" wide>
							<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={`you@${domain}`} />
						</Field>
						<button className="btn" type="submit" disabled={busy}>
							Continue
						</button>
						<p className="muted">Local only. Production uses Cloudflare Access one-time codes sent to *@{domain}.</p>
					</form>
				) : (
					<p className="muted" style={{ marginTop: 22 }}>
						This house is locked. Open it through the Cloudflare Access gate and a code will be sent to your @{domain} inbox.
					</p>
				)}
			</Glass>
		</div>
	);
}

export function OnboardingPage() {
	const { me, refresh } = useAuth();
	const toast = useToast();
	const familyEmail = me?.status === "needs_onboarding" ? me.familyEmail : "";
	const [fullName, setFullName] = useState("");
	const [nickname, setNickname] = useState("");
	const [dateOfBirth, setDateOfBirth] = useState("");
	const [residence, setResidence] = useState("");
	const [phone, setPhone] = useState("");
	const [personalEmail, setPersonalEmail] = useState("");
	const [socials, setSocials] = useState<SocialLink[]>([{ label: "Instagram", handle: "", url: "" }]);
	const [busy, setBusy] = useState(false);

	return (
		<div className="center">
			<Glass className="auth-card" style={{ textAlign: "left", width: "min(720px, 100%)" }}>
				<p className="pill">New family profile</p>
				<h1 style={{ fontSize: 40, marginTop: 12 }}>Welcome home.</h1>
				<p className="muted">
					You signed in as <strong>{familyEmail}</strong>. Tell the family who you are.
				</p>
				<form
					className="form-grid"
					style={{ marginTop: 22 }}
					onSubmit={onSubmit(async () => {
						setBusy(true);
						try {
							await api.onboard({
								fullName,
								nickname,
								dateOfBirth,
								residence,
								phone,
								personalEmail,
								socials: socials.filter((item) => item.url),
							});
							await refresh();
							toast("Your profile is ready.");
						} catch (err) {
							toast(err instanceof Error ? err.message : "Could not save profile");
						} finally {
							setBusy(false);
						}
					})}
				>
					<Field label="Full name">
						<input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
					</Field>
					<Field label="Nickname">
						<input value={nickname} onChange={(event) => setNickname(event.target.value)} required />
					</Field>
					<Field label="Date of birth">
						<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />
					</Field>
					<Field label="Current residence">
						<input value={residence} onChange={(event) => setResidence(event.target.value)} required />
					</Field>
					<Field label="Phone">
						<input value={phone} onChange={(event) => setPhone(event.target.value)} />
					</Field>
					<Field label="Personal email">
						<input type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} />
					</Field>
					<div className="wide stack">
						<span className="muted">Socials</span>
						{socials.map((item, index) => (
							<div className="form-grid" key={`social-${index}`}>
								<input
									placeholder="Label"
									value={item.label}
									onChange={(event) => {
										const next = [...socials];
										next[index] = { ...item, label: event.target.value };
										setSocials(next);
									}}
								/>
								<input
									placeholder="Handle"
									value={item.handle}
									onChange={(event) => {
										const next = [...socials];
										next[index] = { ...item, handle: event.target.value };
										setSocials(next);
									}}
								/>
								<input
									className="wide"
									placeholder="https://"
									value={item.url}
									onChange={(event) => {
										const next = [...socials];
										next[index] = { ...item, url: event.target.value };
										setSocials(next);
									}}
								/>
							</div>
						))}
						<button className="btn-ghost" type="button" onClick={() => setSocials([...socials, { label: "", handle: "", url: "" }])}>
							Add a link
						</button>
					</div>
					<button className="btn wide" type="submit" disabled={busy}>
						Enter the family home
					</button>
				</form>
			</Glass>
		</div>
	);
}

export function PostCard({
	post,
	onChange,
	showComments = false,
}: {
	post: Post;
	onChange?: () => void;
	showComments?: boolean;
}) {
	const { user } = useAuth();
	const toast = useToast();
	const [comment, setComment] = useState("");
	const canEdit = user?.role === "admin" || user?.id === post.author.id;

	return (
		<Glass className={`post${post.kind === "announcement" ? " announce" : ""}`}>
			<div className="post-head">
				<Avatar person={post.author} />
				<div style={{ flex: 1 }}>
					{post.kind === "announcement" ? (
						<div className="announce-badge">
							<Icons.megaphone size={14} />
							Family announcement
						</div>
					) : null}
					<b>{displayName(post.author)}</b>
					<span>{when(post.createdAt)}</span>
				</div>
				{canEdit ? (
					<button
						className="btn-ghost"
						type="button"
						onClick={async () => {
							if (!confirm("Remove this post?")) return;
							await api.deletePost(post.id);
							toast("Post removed");
							onChange?.();
						}}
					>
						Remove
					</button>
				) : null}
			</div>
			<p className={post.kind === "announcement" ? "post-body announce-copy" : undefined}>{post.body}</p>
			{post.media.length > 0 ? (
				<div className="media-grid">
					{post.media.map((item) => (
						<img key={item.key} src={item.url} alt="" />
					))}
				</div>
			) : null}
			<div className="actions">
				{["heart", "joy", "clap"].map((emoji) => {
					const current = post.reactions.find((item) => item.emoji === emoji);
					return (
						<button
							key={emoji}
							className={`chip ${current?.me ? "on" : ""}`}
							type="button"
							onClick={async () => {
								await api.react(post.id, emoji);
								onChange?.();
							}}
						>
							{emoji === "heart" ? "♥" : emoji === "joy" ? "☺" : "✧"} {current?.count || ""}
						</button>
					);
				})}
				<span className="muted">{post.commentCount} comments</span>
			</div>
			{showComments ? (
				<div className="stack">
					{(post.comments || []).map((item) => (
						<div className="comment" key={item.id}>
							<div className="row">
								<strong>{displayName(item.author)}</strong>
								{user?.id === item.author.id || user?.role === "admin" ? (
									<button
										className="btn-ghost"
										type="button"
										onClick={async () => {
											await api.deleteComment(item.id);
											onChange?.();
										}}
									>
										Remove
									</button>
								) : null}
							</div>
							<p>{item.body}</p>
						</div>
					))}
					<form
						className="row"
						onSubmit={onSubmit(async () => {
							if (!comment.trim()) return;
							await api.comment(post.id, comment);
							setComment("");
							onChange?.();
						})}
					>
						<input style={{ flex: 1 }} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a comment" />
						<button className="btn" type="submit">
							Send
						</button>
					</form>
				</div>
			) : null}
		</Glass>
	);
}

export function Composer({ onCreated }: { onCreated: () => void }) {
	const { user } = useAuth();
	const toast = useToast();
	const [body, setBody] = useState("");
	const [kind, setKind] = useState<"update" | "announcement">("update");
	const [files, setFiles] = useState<FileList | null>(null);
	const [busy, setBusy] = useState(false);

	return (
		<Glass className={`panel stack${kind === "announcement" ? " composer-announce" : ""}`}>
			{kind === "announcement" ? (
				<div className="announce-hint">
					<Icons.megaphone size={16} />
					This will go out as a family announcement
				</div>
			) : null}
			<textarea
				value={body}
				onChange={(event) => setBody(event.target.value)}
				placeholder={kind === "announcement" ? "What should the whole family hear?" : "Share a life update..."}
			/>
			<div className="row">
				<FileButton key={files?.length ? "chosen" : "empty"} label="Add photos" multiple files={files} onChange={setFiles} />
				{user?.role === "admin" ? (
					<button
						className={`chip announce-toggle${kind === "announcement" ? " on" : ""}`}
						type="button"
						aria-pressed={kind === "announcement"}
						onClick={() => setKind(kind === "announcement" ? "update" : "announcement")}
					>
						<Icons.megaphone size={16} />
						{kind === "announcement" ? "Announcement on" : "Announcement"}
					</button>
				) : null}
				<button
					className="btn"
					type="button"
					disabled={busy}
					onClick={async () => {
						if (!body.trim()) return;
						setBusy(true);
						try {
							const mediaKeys = files ? await uploadMany(files) : [];
							await api.createPost({ body, kind, mediaKeys });
							setBody("");
							setFiles(null);
							setKind("update");
							onCreated();
						} catch (err) {
							toast(err instanceof Error ? err.message : "Could not post");
						} finally {
							setBusy(false);
						}
					}}
				>
					{kind === "announcement" ? "Announce" : "Share"}
				</button>
			</div>
		</Glass>
	);
}

export function usePosts() {
	const [posts, setPosts] = useState<Post[]>([]);
	const load = async () => {
		const data = await api.posts();
		setPosts(data.posts);
	};
	useEffect(() => {
		void load();
	}, []);
	return { posts, load };
}

export function HomePage() {
	const { user, site } = useAuth();
	const { posts, load } = usePosts();
	if (!user) {
		return (
			<div className="center">
				<div className="spinner" />
			</div>
		);
	}
	return (
		<div className="stack">
			<div>
				<p className="muted">{site?.family.tagline}</p>
				<h1 className="page-title">{greeting(user.nickname || user.fullName.split(" ")[0])}</h1>
			</div>
			{site?.banner.active ? (
				<Glass className="banner">
					<div>
						<p className="pill">Family notice</p>
						<h2>{site.banner.title}</h2>
						<p>{site.banner.body}</p>
					</div>
				</Glass>
			) : null}
			<AppGrid />
			<div className="row">
				<h2>Latest from the family</h2>
				<Link className="btn-ghost" to="/life">
					View more
				</Link>
			</div>
			<Composer onCreated={() => void load()} />
			<div className="feed">
				{posts.slice(0, 4).map((post) => (
					<PostCard key={post.id} post={post} onChange={() => void load()} />
				))}
			</div>
		</div>
	);
}

export function AppGrid() {
	const tiles = [
		{ to: "/gallery", title: "Gallery", note: "Albums and snapshots", icon: Icons.gallery },
		{ to: "/directory", title: "Directory", note: "The family phone book", icon: Icons.directory },
		{ to: "/recipes", title: "Recipe book", note: "Rename, add, and cook", icon: Icons.recipes },
		{ to: "/life", title: "Life updates", note: "A quieter social feed", icon: Icons.life },
		{ to: "/coming-soon", title: "More coming soon", note: "New family apps", icon: Icons.soon },
	];
	return (
		<div className="apps">
			{tiles.map((tile) => (
				<Link key={tile.to} className="app-tile glass" to={tile.to}>
					<div className="app-icon">
						<tile.icon />
					</div>
					<h3>{tile.title}</h3>
					<p>{tile.note}</p>
				</Link>
			))}
		</div>
	);
}
