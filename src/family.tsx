import { useEffect, useMemo, useState } from "react";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";
import type { ChangeLogEntry, ExtraContact, GalleryItem, Member, Recipe, Reminder, Role } from "../shared/types";
import { COLOR_SCHEMES, FONT_CHOICES, AVATAR_STYLES, BACKDROP_STYLES, type AvatarStyle } from "../shared/types";
import { api, uploadMany } from "./api";
import { useAuth, useTheme, useToast } from "./context";
import { AppGrid, Composer, PostCard, usePosts } from "./pages";
import { Icons } from "./icons";
import { GLASS_MAX, GLASS_MIN, mediaPath } from "./theme";
import {
	Avatar,
	ContactLines,
	Empty,
	Field,
	FileButton,
	Glass,
	LineList,
	Modal,
	displayName,
	onSubmit,
	shareCard,
	when,
	type LabeledLine,
} from "./ui";

function photoFileName(item: GalleryItem) {
	const fromKey = item.media.key.split("/").pop() || "photo.jpg";
	const ext = fromKey.includes(".") ? fromKey.slice(fromKey.lastIndexOf(".")) : ".jpg";
	const base = (item.title || item.album || "winstead-photo").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "photo";
	return `${base}${ext}`;
}

async function photoFile(item: GalleryItem) {
	const response = await fetch(item.media.url, { credentials: "include" });
	if (!response.ok) throw new Error("Could not open that photo");
	const blob = await response.blob();
	return new File([blob], photoFileName(item), { type: blob.type || "image/jpeg" });
}

export function AppsPage() {
	return (
		<div className="stack">
			<h1 className="page-title">Family apps</h1>
			<p className="page-sub">Rooms in the house. More will open over time.</p>
			<AppGrid />
		</div>
	);
}

export function ComingSoonPage() {
	return (
		<div className="stack">
			<h1 className="page-title">More coming soon</h1>
			<Glass className="panel">
				<p>Calendar, shared lists, and travel notes are next. If you want a room in the house, tell an admin.</p>
			</Glass>
		</div>
	);
}

export function LifePage() {
	const { posts, load } = usePosts();
	const [reminders, setReminders] = useState<Reminder[]>([]);
	const [title, setTitle] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [audience, setAudience] = useState<"self" | "family">("self");
	const toast = useToast();

	const refresh = async () => {
		await load();
		setReminders((await api.reminders()).reminders);
	};

	useEffect(() => {
		void refresh();
	}, []);

	return (
		<div className="split">
			<div className="stack">
				<h1 className="page-title">Life</h1>
				<p className="page-sub">Announcements, snapshots, and the quieter family feed.</p>
				<Composer onCreated={() => void refresh()} />
				<div className="feed">
					{posts.map((post) => (
						<PostCard key={post.id} post={post} showComments onChange={() => void refresh()} />
					))}
					{posts.length === 0 ? <Empty title="No updates yet" body="Share a photo, a note, or a quiet announcement." /> : null}
				</div>
			</div>
			<div className="stack">
				<Glass className="panel stack">
					<h3>Reminders</h3>
					<form
						className="stack"
						onSubmit={onSubmit(async () => {
							if (!title.trim()) return;
							await api.createReminder({ title, dueAt, audience });
							setTitle("");
							void refresh();
							toast("Reminder saved");
						})}
					>
						<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
						<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
						<div className="actions">
							<button className={`chip ${audience === "self" ? "on" : ""}`} type="button" onClick={() => setAudience("self")}>
								Just me
							</button>
							<button className={`chip ${audience === "family" ? "on" : ""}`} type="button" onClick={() => setAudience("family")}>
								Family
							</button>
						</div>
						<button className="btn" type="submit">
							Add reminder
						</button>
					</form>
					{reminders.map((item) => (
						<div className="row" key={item.id}>
							<div>
								<strong style={{ textDecoration: item.completed ? "line-through" : "none" }}>{item.title}</strong>
								<div className="muted">
									{item.audience === "family" ? "Family" : "Personal"} · {item.authorName}
									{item.dueAt ? ` · ${when(item.dueAt)}` : ""}
								</div>
							</div>
							<button className="chip" type="button" onClick={() => void api.updateReminder(item.id, { completed: !item.completed }).then(refresh)}>
								{item.completed ? "Undo" : "Done"}
							</button>
						</div>
					))}
				</Glass>
			</div>
		</div>
	);
}

export function GalleryPage() {
	const toast = useToast();
	const { user } = useAuth();
	const [items, setItems] = useState<GalleryItem[]>([]);
	const [title, setTitle] = useState("");
	const [caption, setCaption] = useState("");
	const [album, setAlbum] = useState("Family");
	const [open, setOpen] = useState<GalleryItem | null>(null);
	const albums = useMemo(() => Array.from(new Set(["Family", ...items.map((item) => item.album)])), [items]);

	const load = async () => setItems((await api.gallery()).items);
	useEffect(() => {
		void load();
	}, []);

	useEffect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(null);
		};
		window.addEventListener("keydown", onKey);
		return () => {
			document.body.style.overflow = previous;
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="stack">
			<h1 className="page-title">Gallery</h1>
			<p className="page-sub">Everyone can add photos. You can tidy your own; admins can remove any.</p>
			<Glass className="panel stack">
				<div className="form-grid">
					<Field label="Title">
						<input value={title} onChange={(event) => setTitle(event.target.value)} />
					</Field>
					<Field label="Album">
						<input value={album} onChange={(event) => setAlbum(event.target.value)} />
					</Field>
					<Field label="Caption" wide>
						<input value={caption} onChange={(event) => setCaption(event.target.value)} />
					</Field>
				</div>
				<FileButton
					label="Add a photo"
					onChange={async (picked) => {
						const file = picked?.[0];
						if (!file) return;
						const [mediaKey] = await uploadMany([file]);
						await api.addGallery({ title, caption, album, mediaKey });
						setTitle("");
						setCaption("");
						toast("Photo added");
						void load();
					}}
				/>
			</Glass>
			<div className="actions">
				{albums.map((name) => (
					<button key={name} className="chip" type="button" onClick={() => void api.gallery(name).then((data) => setItems(data.items))}>
						{name}
					</button>
				))}
				<button className="chip" type="button" onClick={() => void load()}>
					All
				</button>
			</div>
			<div className="photos">
				{items.map((item) => (
					<figure className="glass photo-tile" key={item.id}>
						<button
							className="photo-open"
							type="button"
							onClick={() => setOpen(item)}
							aria-label={`Open ${item.title || "photo"}`}
						>
							<img src={item.media.url} alt={item.title || item.album} />
						</button>
						<figcaption>
							<div className="row">
								<span>{item.title || item.album}</span>
								{user?.id === item.uploadedBy.id || user?.role === "admin" ? (
									<button
										className="btn-ghost"
										type="button"
										onClick={async (event) => {
											event.stopPropagation();
											await api.deleteGallery(item.id);
											if (open?.id === item.id) setOpen(null);
											void load();
										}}
									>
										Remove
									</button>
								) : null}
							</div>
						</figcaption>
					</figure>
				))}
			</div>
			{open ? (
				<PhotoViewer
					item={open}
					onClose={() => setOpen(null)}
					onShared={() => toast("Shared")}
					onCopied={() => toast("Link copied")}
					onDownloaded={() => toast("Saved to downloads")}
					onError={(message) => toast(message)}
				/>
			) : null}
		</div>
	);
}

function PhotoViewer({
	item,
	onClose,
	onShared,
	onCopied,
	onDownloaded,
	onError,
}: {
	item: GalleryItem;
	onClose: () => void;
	onShared: () => void;
	onCopied: () => void;
	onDownloaded: () => void;
	onError: (message: string) => void;
}) {
	const [busy, setBusy] = useState<"share" | "download" | null>(null);

	const share = async () => {
		setBusy("share");
		try {
			const file = await photoFile(item);
			if (navigator.canShare?.({ files: [file] })) {
				await navigator.share({
					title: item.title || "Family photo",
					text: item.caption || undefined,
					files: [file],
				});
				onShared();
				return;
			}
			const url = new URL(item.media.url, window.location.origin).href;
			if (navigator.share) {
				await navigator.share({ title: item.title || "Family photo", text: item.caption || undefined, url });
				onShared();
				return;
			}
			await navigator.clipboard.writeText(url);
			onCopied();
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			onError(error instanceof Error ? error.message : "Could not share that photo");
		} finally {
			setBusy(null);
		}
	};

	const download = async () => {
		setBusy("download");
		try {
			const file = await photoFile(item);
			const href = URL.createObjectURL(file);
			const link = document.createElement("a");
			link.href = href;
			link.download = file.name;
			document.body.append(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(href);
			onDownloaded();
		} catch (error) {
			onError(error instanceof Error ? error.message : "Could not download that photo");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="lightbox-back" onClick={onClose} role="presentation">
			<Glass className="lightbox" onClick={(event) => event.stopPropagation()}>
				<div className="row">
					<div>
						<h2 style={{ margin: 0 }}>{item.title || item.album}</h2>
						<p className="muted" style={{ margin: "4px 0 0" }}>
							{item.album}
							{item.uploadedBy ? ` · ${displayName(item.uploadedBy)}` : ""}
							{item.createdAt ? ` · ${when(item.createdAt)}` : ""}
						</p>
					</div>
					<button className="btn-ghost" type="button" onClick={onClose}>
						Close
					</button>
				</div>
				<img className="lightbox-photo" src={item.media.url} alt={item.title || item.album} />
				{item.caption ? <p style={{ margin: 0 }}>{item.caption}</p> : null}
				<div className="actions">
					<button className="chip" type="button" disabled={busy !== null} onClick={() => void share()}>
						<Icons.share />
						{busy === "share" ? "Sharing…" : "Share"}
					</button>
					<button className="chip" type="button" disabled={busy !== null} onClick={() => void download()}>
						<Icons.download />
						{busy === "download" ? "Saving…" : "Download"}
					</button>
				</div>
			</Glass>
		</div>
	);
}

export function RecipesPage() {
	const { user } = useAuth();
	const toast = useToast();
	const { id } = useParams();
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [editing, setEditing] = useState<Partial<Recipe> & { ingredients: string[]; steps: string[] } | null>(null);
	const selected = recipes.find((recipe) => recipe.id === id) || recipes[0];

	const load = async () => setRecipes((await api.recipes()).recipes);
	useEffect(() => {
		void load();
	}, []);

	return (
		<div className="split">
			<div className="stack">
				<div className="row">
					<h1 className="page-title">Recipe book</h1>
					<button className="btn" type="button" onClick={() => setEditing({ title: "", description: "", ingredients: [""], steps: [""], notes: "" })}>
						New recipe
					</button>
				</div>
				<p className="page-sub">Anyone can rename a recipe or add to it. Only the author or an admin can delete one.</p>
				{recipes.map((recipe) => (
					<Link className="person glass" key={recipe.id} to={`/recipes/${recipe.id}`}>
						<Avatar person={recipe.author} />
						<div>
							<strong>{recipe.title}</strong>
							<div className="muted">
								{recipe.ingredients.length} ingredients · {displayName(recipe.author)}
							</div>
						</div>
					</Link>
				))}
				{recipes.length === 0 ? <Empty title="The kitchen is quiet" body="Add the first family recipe." /> : null}
			</div>
			{selected ? (
				<Glass className="panel stack">
					<div className="row">
						<h2 style={{ margin: 0 }}>{selected.title}</h2>
						<button className="btn-ghost" type="button" onClick={() => setEditing(selected)}>
							Edit
						</button>
					</div>
					<p className="muted">{selected.description}</p>
					<h3>Ingredients</h3>
					<ul>
						{selected.ingredients.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
					<h3>Steps</h3>
					<ol>
						{selected.steps.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ol>
					{selected.notes ? <p>{selected.notes}</p> : null}
					{user?.id === selected.author.id || user?.role === "admin" ? (
						<button
							className="btn-danger"
							type="button"
							onClick={async () => {
								await api.deleteRecipe(selected.id);
								toast("Recipe removed");
								void load();
							}}
						>
							Delete recipe
						</button>
					) : null}
				</Glass>
			) : null}
			{editing ? (
				<Modal title={editing.id ? "Update recipe" : "New recipe"} onClose={() => setEditing(null)}>
					<form
						className="stack"
						onSubmit={onSubmit(async () => {
							const payload = {
								title: editing.title,
								description: editing.description,
								ingredients: editing.ingredients,
								steps: editing.steps,
								notes: editing.notes,
							};
							if (editing.id) await api.updateRecipe(editing.id, payload);
							else await api.createRecipe(payload);
							setEditing(null);
							void load();
						})}
					>
						<Field label="Name" wide>
							<input value={editing.title || ""} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
						</Field>
						<Field label="Description" wide>
							<textarea value={editing.description || ""} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
						</Field>
						<Field label="Ingredients" wide>
							<LineList value={editing.ingredients} onChange={(ingredients) => setEditing({ ...editing, ingredients })} placeholder="2 cups flour" />
						</Field>
						<Field label="Steps" wide>
							<LineList value={editing.steps} onChange={(steps) => setEditing({ ...editing, steps })} placeholder="Preheat the oven" />
						</Field>
						<button className="btn" type="submit">
							Save
						</button>
					</form>
				</Modal>
			) : null}
		</div>
	);
}

export function DirectoryPage() {
	const { user } = useAuth();
	const toast = useToast();
	const navigate = useNavigate();
	const { id } = useParams();
	const bookMatch = useMatch("/directory/contact/:id");
	const [members, setMembers] = useState<Member[]>([]);
	const [contacts, setContacts] = useState<ExtraContact[]>([]);
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState<ContactDraft | null>(null);
	const [photoBusy, setPhotoBusy] = useState(false);

	const load = async () => {
		const data = await api.directory();
		setMembers(data.members);
		setContacts(data.contacts);
	};
	useEffect(() => {
		void load();
	}, []);

	const selectedMember = bookMatch ? undefined : members.find((member) => member.id === id);
	const selectedContact = bookMatch ? contacts.find((contact) => contact.id === id) : undefined;
	const filteredMembers = members.filter((member) =>
		`${member.fullName} ${member.nickname} ${member.phone} ${member.familyEmail}`.toLowerCase().includes(query.toLowerCase()),
	);
	const filteredContacts = contacts.filter((contact) =>
		`${contact.displayName} ${contact.phone} ${contact.email} ${contact.address}`.toLowerCase().includes(query.toLowerCase()),
	);

	const share = async (name: string, lines: LabeledLine[]) => {
		try {
			const result = await shareCard(name, lines);
			toast(result === "copied" ? "Copied to clipboard" : "Shared");
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") return;
			toast(err instanceof Error ? err.message : "Could not share");
		}
	};

	return (
		<div className="split">
			<div className="stack">
				<div className="row">
					<h1 className="page-title">Directory</h1>
					<button className="btn" type="button" onClick={() => setDraft(emptyDraft())}>
						Add contact
					</button>
				</div>
				<p className="page-sub">Family first, then the phone book.</p>
				<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search family and numbers" />
				<h3>Family</h3>
				<div className="directory">
					{filteredMembers.map((member) => (
						<Link
							className={`person glass${selectedMember?.id === member.id ? " on" : ""}`}
							key={member.id}
							to={`/directory/${member.id}`}
						>
							<Avatar person={member} />
							<div>
								<strong>{member.fullName}</strong>
								<div className="muted">{member.phone || member.familyEmail}</div>
							</div>
						</Link>
					))}
				</div>
				<h3>Phone book</h3>
				<div className="directory">
					{filteredContacts.length === 0 ? (
						<p className="muted">No extra numbers yet.</p>
					) : (
						filteredContacts.map((contact) => (
							<Link
								className={`person glass${selectedContact?.id === contact.id ? " on" : ""}`}
								key={contact.id}
								to={`/directory/contact/${contact.id}`}
							>
								<Avatar person={contactPerson(contact)} />
								<div>
									<strong>{contact.displayName}</strong>
									<div className="muted">{contact.phone || contact.email}</div>
								</div>
							</Link>
						))
					)}
				</div>
			</div>
			{selectedMember ? (
				<Glass className="panel stack">
					<Avatar person={selectedMember} size="lg" />
					<h2 style={{ margin: 0 }}>{selectedMember.fullName}</h2>
					<ContactLines lines={memberLines(selectedMember)} />
					<button className="btn" type="button" onClick={() => void share(selectedMember.fullName, memberLines(selectedMember))}>
						<Icons.share />
						Share
					</button>
				</Glass>
			) : null}
			{selectedContact ? (
				<Glass className="panel stack">
					<Avatar person={contactPerson(selectedContact)} size="lg" />
					<h2 style={{ margin: 0 }}>{selectedContact.displayName}</h2>
					<ContactLines lines={bookLines(selectedContact)} />
					<div className="actions">
						<button className="btn" type="button" onClick={() => void share(selectedContact.displayName, bookLines(selectedContact))}>
							<Icons.share />
							Share
						</button>
						{user && (user.id === selectedContact.createdBy || user.role === "admin") ? (
							<>
								<button className="btn-ghost" type="button" onClick={() => setDraft(draftFromContact(selectedContact))}>
									Edit
								</button>
								<button
									className="btn-ghost"
									type="button"
									onClick={async () => {
										if (!confirm(`Remove ${selectedContact.displayName} from the phone book?`)) return;
										await api.deleteContact(selectedContact.id);
										navigate("/directory");
										toast("Contact removed");
										void load();
									}}
								>
									Delete
								</button>
							</>
						) : null}
					</div>
				</Glass>
			) : null}
			{!selectedMember && !selectedContact ? (
				<Glass className="panel">
					<p className="muted">Choose someone from the family or the phone book.</p>
				</Glass>
			) : null}
			{draft ? (
				<Modal title={draft.id ? "Edit contact" : "Add contact"} onClose={() => setDraft(null)}>
					<form
						className="stack"
						onSubmit={onSubmit(async () => {
							if (!draft.firstName.trim() || !draft.lastName.trim()) {
								toast("First and last name are required");
								return;
							}
							if (!draft.phone.trim() && !draft.email.trim()) {
								toast("Add a phone number or an email");
								return;
							}
							const payload = {
								firstName: draft.firstName.trim(),
								lastName: draft.lastName.trim(),
								phone: draft.phone.trim(),
								email: draft.email.trim(),
								address: draft.address.trim(),
								notes: draft.notes.trim(),
								avatarKey: draft.avatarKey,
								avatarStyle: draft.avatarStyle,
							};
							if (draft.id) {
								await api.updateContact(draft.id, payload);
								setDraft(null);
							} else {
								const created = await api.createContact(payload);
								setDraft(null);
								navigate(`/directory/contact/${created.contact.id}`);
							}
							toast("Directory updated");
							void load();
						})}
					>
						<div className="row" style={{ justifyContent: "center" }}>
							<Avatar
								person={{
									fullName: `${draft.firstName} ${draft.lastName}`.trim() || "New contact",
									nickname: "",
									avatarUrl: draft.avatarUrl,
									avatarStyle: draft.avatarStyle,
								}}
								size="lg"
							/>
						</div>
						<div className="actions">
							<FileButton
								label={draft.avatarUrl ? "Replace photo" : "Upload photo"}
								onChange={async (picked) => {
									const file = picked?.[0];
									if (!file) return;
									setPhotoBusy(true);
									try {
										const [avatarKey] = await uploadMany([file]);
										setDraft({ ...draft, avatarKey, avatarUrl: mediaPath(avatarKey) });
									} catch (err) {
										toast(err instanceof Error ? err.message : "Could not upload photo");
									} finally {
										setPhotoBusy(false);
									}
								}}
							/>
							<button
								className={`chip ${draft.avatarUrl ? "" : "on"}`}
								type="button"
								disabled={photoBusy || !draft.avatarUrl}
								onClick={() => setDraft({ ...draft, avatarKey: null, avatarUrl: null })}
							>
								Use initials
							</button>
							{draft.avatarUrl ? (
								<button
									className="btn-ghost"
									type="button"
									disabled={photoBusy}
									onClick={() => setDraft({ ...draft, avatarKey: null, avatarUrl: null })}
								>
									Clear photo
								</button>
							) : null}
						</div>
						<p className="muted" style={{ margin: "4px 0 0" }}>
							Initials style
						</p>
						<div className="avatar-styles">
							{AVATAR_STYLES.map((style) => (
								<button
									key={style.id}
									className={`avatar-style ${draft.avatarStyle === style.id ? "on" : ""}`}
									type="button"
									onClick={() => setDraft({ ...draft, avatarStyle: style.id })}
								>
									<Avatar
										person={{
											fullName: `${draft.firstName} ${draft.lastName}`.trim() || "NC",
											nickname: "",
											avatarUrl: null,
											avatarStyle: style.id,
										}}
										forceInitials
									/>
									<span>{style.label}</span>
								</button>
							))}
						</div>
						<div className="form-grid">
							<Field label="First name">
								<input
									required
									value={draft.firstName}
									onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
								/>
							</Field>
							<Field label="Last name">
								<input
									required
									value={draft.lastName}
									onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
								/>
							</Field>
							<Field label="Phone">
								<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
							</Field>
							<Field label="Email">
								<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
							</Field>
							<Field label="Address" wide>
								<input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
							</Field>
							<Field label="Notes" wide>
								<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
							</Field>
						</div>
						<p className="muted">First and last name are required, plus a phone number or email.</p>
						<button className="btn" type="submit" disabled={photoBusy}>
							Save
						</button>
					</form>
				</Modal>
			) : null}
		</div>
	);
}

type ContactDraft = {
	id?: string;
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	address: string;
	notes: string;
	avatarKey: string | null;
	avatarUrl: string | null;
	avatarStyle: AvatarStyle;
};

function emptyDraft(): ContactDraft {
	return {
		firstName: "",
		lastName: "",
		phone: "",
		email: "",
		address: "",
		notes: "",
		avatarKey: null,
		avatarUrl: null,
		avatarStyle: "gold",
	};
}

function draftFromContact(contact: ExtraContact): ContactDraft {
	return {
		id: contact.id,
		firstName: contact.firstName,
		lastName: contact.lastName,
		phone: contact.phone,
		email: contact.email,
		address: contact.address,
		notes: contact.notes,
		avatarKey: contact.avatarKey,
		avatarUrl: contact.avatarUrl,
		avatarStyle: contact.avatarStyle,
	};
}

function contactPerson(contact: ExtraContact) {
	return {
		fullName: contact.displayName,
		nickname: "",
		avatarUrl: contact.avatarUrl,
		avatarStyle: contact.avatarStyle,
	};
}

function prettyDate(iso: string) {
	if (!iso) return "";
	const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function memberLines(member: Member): LabeledLine[] {
	return [
		{ title: "Nickname", value: member.nickname },
		{ title: "Role", value: member.role === "admin" ? "Admin" : "Family" },
		{ title: "Family email", value: member.familyEmail, href: `mailto:${member.familyEmail}` },
		{ title: "Personal email", value: member.personalEmail, href: member.personalEmail ? `mailto:${member.personalEmail}` : undefined },
		{ title: "Phone", value: member.phone, href: member.phone ? `tel:${member.phone}` : undefined },
		{ title: "Address", value: member.residence },
		{ title: "Birthday", value: prettyDate(member.dateOfBirth) },
		...member.socials
			.filter((item) => item.url || item.handle)
			.map((item) => ({
				title: item.label || "Social",
				value: item.handle ? `${item.handle}${item.url ? ` · ${item.url}` : ""}` : item.url,
				href: item.url || undefined,
			})),
	];
}

function bookLines(contact: ExtraContact): LabeledLine[] {
	return [
		{ title: "Phone", value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : undefined },
		{ title: "Email", value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
		{ title: "Address", value: contact.address },
		{ title: "Notes", value: contact.notes },
	];
}

export function SettingsPage() {
	const { user, refresh, logout } = useAuth();
	const { preferences, setPreferences } = useTheme();
	const toast = useToast();
	const [profile, setProfile] = useState(user);
	const [photoMenu, setPhotoMenu] = useState(false);
	const [photoBusy, setPhotoBusy] = useState(false);
	useEffect(() => setProfile(user), [user]);
	if (!user || !profile) {
		return (
			<div className="center">
				<div className="spinner" />
			</div>
		);
	}

	const face = { ...profile, avatarStyle: preferences.avatarStyle };

	const setAvatarKey = async (avatarKey: string | null) => {
		setPhotoBusy(true);
		try {
			await api.updateMe({ avatarKey });
			await refresh();
			toast(avatarKey ? "Photo updated" : "Using initials");
		} catch (err) {
			toast(err instanceof Error ? err.message : "Could not update photo");
		} finally {
			setPhotoBusy(false);
		}
	};

	return (
		<>
		<div className="split">
			<div className="stack">
				<h1 className="page-title">You</h1>
				<Glass className="panel stack">
					<div className="row">
						<Avatar person={face} size="lg" />
						<button className="btn-ghost" type="button" onClick={() => setPhotoMenu(true)}>
							Change photo
						</button>
					</div>
					<div className="form-grid">
						<Field label="Full name">
							<input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} />
						</Field>
						<Field label="Nickname">
							<input value={profile.nickname} onChange={(event) => setProfile({ ...profile, nickname: event.target.value })} />
						</Field>
						<Field label="Birthday">
							<input type="date" value={profile.dateOfBirth} onChange={(event) => setProfile({ ...profile, dateOfBirth: event.target.value })} />
						</Field>
						<Field label="Residence">
							<input value={profile.residence} onChange={(event) => setProfile({ ...profile, residence: event.target.value })} />
						</Field>
						<Field label="Phone">
							<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
						</Field>
						<Field label="Personal email">
							<input value={profile.personalEmail} onChange={(event) => setProfile({ ...profile, personalEmail: event.target.value })} />
						</Field>
					</div>
					<p className="muted">Family login: {user.familyEmail}</p>
					<button
						className="btn"
						type="button"
						onClick={async () => {
							await api.updateMe(profile);
							await refresh();
							toast("Profile saved");
						}}
					>
						Save profile
					</button>
					<button
						className="btn-ghost"
						type="button"
						onClick={() => void logout()}
					>
						Sign out of local preview
					</button>
				</Glass>
			</div>
			<Glass className="panel stack">
				<h3>Look and feel</h3>
				<div className="actions">
					{(["system", "light", "dark"] as const).map((mode) => (
						<button key={mode} className={`chip ${preferences.mode === mode ? "on" : ""}`} type="button" onClick={() => void setPreferences({ mode })}>
							{mode}
						</button>
					))}
				</div>
				<div className="field glass-meter">
					<label htmlFor="glass-transparency">Transparency {preferences.transparency}%</label>
					<input
						id="glass-transparency"
						className="range"
						type="range"
						min={GLASS_MIN}
						max={GLASS_MAX}
						value={preferences.transparency}
						onChange={(event) => void setPreferences({ transparency: Number(event.target.value) })}
					/>
					<div className="ends">
						<span>Bubbly glass</span>
						<span>Solid frost</span>
					</div>
					<small className="muted">Lower washes color through every panel. Higher frosts the house solid.</small>
				</div>
				<p className="muted" style={{ margin: "8px 0 0" }}>Background</p>
				<div className="swatches">
					{BACKDROP_STYLES.map((style) => (
						<button
							key={style.id}
							className={`swatch ${preferences.backdrop === style.id ? "on" : ""}`}
							type="button"
							onClick={() => void setPreferences({ backdrop: style.id })}
						>
							<span className={`scene-chip ${style.id}`} aria-hidden="true" />
							<strong>{style.label}</strong>
							<div className="muted">{style.note}</div>
						</button>
					))}
				</div>
				{preferences.backdrop === "photo" ? (
					<div className="actions">
						<FileButton
							label={preferences.backdropKey ? "Replace background photo" : "Upload background photo"}
							onChange={async (picked) => {
								const file = picked?.[0];
								if (!file) return;
								try {
									const [backdropKey] = await uploadMany([file]);
									await setPreferences({ backdrop: "photo", backdropKey });
									toast("Background photo set");
								} catch (err) {
									toast(err instanceof Error ? err.message : "Could not upload background");
								}
							}}
						/>
						{preferences.backdropKey ? (
							<button
								className="btn-ghost"
								type="button"
								onClick={() => void setPreferences({ backdrop: "orbs", backdropKey: null })}
							>
								Remove background photo
							</button>
						) : null}
					</div>
				) : null}
				<p className="muted" style={{ margin: "8px 0 0" }}>Color</p>
				<div className="swatches">
					{COLOR_SCHEMES.map((scheme) => (
						<button key={scheme.id} className={`swatch ${preferences.scheme === scheme.id ? "on" : ""}`} type="button" onClick={() => void setPreferences({ scheme: scheme.id })}>
							<strong>{scheme.label}</strong>
							<div className="muted">{scheme.note}</div>
						</button>
					))}
				</div>
				<p className="muted" style={{ margin: "8px 0 0" }}>Type</p>
				<div className="stack">
					{FONT_CHOICES.map((font) => (
						<button key={font.id} className={`swatch ${preferences.font === font.id ? "on" : ""}`} type="button" onClick={() => void setPreferences({ font: font.id })}>
							<strong>{font.label}</strong>
							<div className="muted">{font.note}</div>
						</button>
					))}
				</div>
			</Glass>
		</div>
			{photoMenu ? (
				<Modal title="Profile photo" onClose={() => setPhotoMenu(false)}>
					<div className="stack">
						<div className="row" style={{ justifyContent: "center" }}>
							<Avatar person={face} size="lg" />
						</div>
						<p className="muted" style={{ textAlign: "center", margin: 0 }}>
							{profile.avatarUrl ? "Using an uploaded photo." : "Using initials until you add a photo."}
						</p>
						<div className="actions">
							<FileButton
								label={profile.avatarUrl ? "Replace photo" : "Upload photo"}
								onChange={async (picked) => {
									const file = picked?.[0];
									if (!file) return;
									setPhotoBusy(true);
									try {
										const [avatarKey] = await uploadMany([file]);
										await api.updateMe({ avatarKey });
										await refresh();
										toast("Photo updated");
									} catch (err) {
										toast(err instanceof Error ? err.message : "Could not update photo");
									} finally {
										setPhotoBusy(false);
									}
								}}
							/>
							<button
								className={`chip ${profile.avatarUrl ? "" : "on"}`}
								type="button"
								disabled={photoBusy || !profile.avatarUrl}
								onClick={() => void setAvatarKey(null)}
							>
								Use initials
							</button>
							{profile.avatarUrl ? (
								<button className="btn-ghost" type="button" disabled={photoBusy} onClick={() => void setAvatarKey(null)}>
									Clear photo
								</button>
							) : null}
						</div>
						<p className="muted" style={{ margin: "4px 0 0" }}>
							Initials style
						</p>
						<div className="avatar-styles">
							{AVATAR_STYLES.map((style) => (
								<button
									key={style.id}
									className={`avatar-style ${preferences.avatarStyle === style.id ? "on" : ""}`}
									type="button"
									onClick={() => void setPreferences({ avatarStyle: style.id })}
								>
									<Avatar person={{ ...face, avatarStyle: style.id }} forceInitials />
									<span>{style.label}</span>
								</button>
							))}
						</div>
					</div>
				</Modal>
			) : null}
		</>
	);
}

type RevertFilter = "open" | "all" | "reverted";

function remainingMsOf(change: ChangeLogEntry, now: number) {
	const end = Date.parse(change.windowEndsAt);
	if (Number.isFinite(end)) return Math.max(0, end - now);
	return Math.max(0, change.remainingMs);
}

function formatRemaining(ms: number) {
	if (ms <= 0) return "Window closed";
	const totalMins = Math.max(1, Math.round(ms / 60000));
	const hours = Math.floor(totalMins / 60);
	const minutes = totalMins % 60;
	if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m left`;
	if (hours > 0) return `${hours}h left`;
	if (totalMins === 1) return "About a minute left";
	return `${totalMins}m left`;
}

function entityLabel(type: string) {
	return (
		{
			post: "Post",
			comment: "Comment",
			recipe: "Recipe",
			contact: "Phone book",
			gallery: "Photo",
			reminder: "Reminder",
			user: "Profile",
			site: "House copy",
			"member-reset": "Account",
		}[type] || type.replace(/-/g, " ")
	);
}

function actionLabel(action: ChangeLogEntry["action"]) {
	return { create: "Added", update: "Edited", delete: "Removed" }[action];
}

function revertConsequence(change: ChangeLogEntry) {
	if (change.entityType === "site") {
		return "House name, tagline, and banner will go back to how they were just before this edit.";
	}
	if (change.entityType === "user") {
		return "This person's profile will go back to the previous version.";
	}
	if (change.action === "create") {
		if (change.entityType === "post" || change.entityType === "comment") {
			return "This will hide the item from the family, as if it had been removed.";
		}
		return "This will delete the item that was added.";
	}
	if (change.action === "delete") {
		if (change.entityType === "post" || change.entityType === "comment") {
			return "The item will be restored for the family to see again.";
		}
		return "The item will be put back.";
	}
	return "The previous version of this item will be restored.";
}

function laterFor(all: ChangeLogEntry[], change: ChangeLogEntry) {
	return all
		.filter(
			(item) =>
				item.entityType === change.entityType &&
				item.entityId === change.entityId &&
				!item.revertedAt &&
				item.createdAt > change.createdAt,
		)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function RevertWindow({ changes, onChanged }: { changes: ChangeLogEntry[]; onChanged: () => Promise<void> }) {
	const toast = useToast();
	const [filter, setFilter] = useState<RevertFilter>("open");
	const [pending, setPending] = useState<ChangeLogEntry | null>(null);
	const [busy, setBusy] = useState(false);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 15000);
		return () => window.clearInterval(timer);
	}, []);

	const list = Array.isArray(changes) ? changes : [];
	const filtered = useMemo(() => {
		return list.filter((change) => {
			const remaining = remainingMsOf(change, now);
			if (filter === "reverted") return Boolean(change.revertedAt);
			if (filter === "open") return !change.revertedAt && remaining > 0;
			return true;
		});
	}, [list, filter, now]);

	const openCount = list.filter((change) => !change.revertedAt && remainingMsOf(change, now) > 0).length;
	const revertedCount = list.filter((change) => change.revertedAt).length;
	const later = pending ? laterFor(list, pending) : [];
	const cascade = Boolean(pending && (pending.needsCascade || later.length > 0));
	const pendingRemaining = pending ? remainingMsOf(pending, now) : 0;

	return (
		<Glass className="panel stack">
			<h3>Revert window</h3>
			<p className="muted">
				You can undo a change for 24 hours after it happens. Newer edits on the same item are stacked, so you can revert the latest one or jump back to an earlier point. Clearing an account stays permanent.
			</p>
			<div className="actions">
				<button className={`chip ${filter === "open" ? "on" : ""}`} type="button" onClick={() => setFilter("open")}>
					Open window · {openCount}
				</button>
				<button className={`chip ${filter === "all" ? "on" : ""}`} type="button" onClick={() => setFilter("all")}>
					All · {list.length}
				</button>
				<button className={`chip ${filter === "reverted" ? "on" : ""}`} type="button" onClick={() => setFilter("reverted")}>
					Reverted · {revertedCount}
				</button>
			</div>
			{filtered.length === 0 ? (
				<p className="muted">
					{filter === "reverted"
						? "Nothing has been reverted yet."
						: filter === "open"
							? "Nothing is sitting in the 24-hour window."
							: "No changes have been recorded yet."}
				</p>
			) : (
				<div className="revert-list">
					{filtered.map((change) => {
						const remaining = remainingMsOf(change, now);
						const closed = remaining <= 0 || Boolean(change.revertedAt);
						const diffs = change.diffs ?? [];
						return (
							<article
								className={`revert-card${change.revertedAt ? " is-reverted" : ""}${!change.canRevert && !change.revertedAt ? " is-blocked" : ""}`}
								key={change.id}
							>
								<div className="row revert-card-head">
									<div>
										<div className="revert-kicker">
											{actionLabel(change.action)} · {entityLabel(change.entityType)}
											{change.permanent ? " · Permanent" : ""}
											{change.revertedAt ? " · Reverted" : ""}
										</div>
										<strong>{change.title || `${change.action} ${change.entityType}`}</strong>
										{change.detail ? <div className="muted revert-detail">{change.detail}</div> : null}
									</div>
									<span className={`revert-time${closed ? " is-closed" : ""}`}>{formatRemaining(remaining)}</span>
								</div>
								<div className="muted">
									{change.actorName} · {when(change.createdAt)}
									{change.laterCount > 0 && !change.revertedAt ? ` · ${change.laterCount} later change${change.laterCount === 1 ? "" : "s"} on this item` : ""}
								</div>
								{diffs.length > 0 ? (
									<details className="revert-details">
										<summary>What changed</summary>
										<dl className="revert-diffs">
											{diffs.map((diff) => (
												<div className="revert-diff" key={`${change.id}-${diff.field}`}>
													<dt>{diff.field}</dt>
													<dd>
														{diff.from && diff.from !== "—" && diff.from !== "Removed" ? <span className="revert-from">{diff.from}</span> : null}
														<span>{diff.to}</span>
													</dd>
												</div>
											))}
										</dl>
									</details>
								) : null}
								{change.canRevert && remaining > 0 ? (
									<div className="actions">
										<button className="btn-ghost" type="button" onClick={() => setPending(change)}>
											{change.needsCascade ? `Revert to here · ${change.laterCount}` : "Revert"}
										</button>
									</div>
								) : change.blockedReason && !change.revertedAt ? (
									<p className="muted revert-blocked">{change.blockedReason}</p>
								) : null}
							</article>
						);
					})}
				</div>
			)}
			{pending ? (
				<Modal title={cascade ? "Revert to this point?" : "Undo this change?"} onClose={() => (busy ? undefined : setPending(null))}>
					<p>
						<strong>{pending.title}</strong>
					</p>
					{pending.detail ? <p className="muted">{pending.detail}</p> : null}
					<p>{revertConsequence(pending)}</p>
					{cascade ? (
						<div className="stack">
							<p>
								{later.length === 1
									? "One newer change sits on top of this. We’ll undo that first, then this one."
									: `${later.length} newer changes sit on top of this. We’ll undo those first (newest to oldest), then this one.`}
							</p>
							<ul className="revert-later">
								{later.map((item) => (
									<li key={item.id}>
										{item.title}
										<span className="muted"> · {when(item.createdAt)}</span>
									</li>
								))}
							</ul>
						</div>
					) : null}
					{pendingRemaining <= 0 ? <p className="muted">The 24-hour window has closed.</p> : null}
					<div className="actions">
						<button className="btn-ghost" type="button" disabled={busy} onClick={() => setPending(null)}>
							Keep it
						</button>
						<button
							className="btn"
							type="button"
							disabled={busy || pendingRemaining <= 0}
							onClick={async () => {
								setBusy(true);
								try {
									await api.revert(pending.id, cascade ? { cascade: true } : {});
									setPending(null);
									toast(cascade ? "Reverted to that point" : "Change reverted");
									await onChanged();
								} catch (error) {
									toast(error instanceof Error ? error.message : "Could not revert that change");
								} finally {
									setBusy(false);
								}
							}}
						>
							{busy ? "Reverting…" : cascade ? "Revert to here" : "Revert"}
						</button>
					</div>
				</Modal>
			) : null}
		</Glass>
	);
}

export function AdminPage() {
	const { user, site, refresh } = useAuth();
	const toast = useToast();
	const [members, setMembers] = useState<Member[]>([]);
	const [changes, setChanges] = useState<Awaited<ReturnType<typeof api.changes>>["changes"]>([]);
	const [banner, setBanner] = useState(site?.banner);
	const [family, setFamily] = useState(site?.family);
	const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
	const [clearing, setClearing] = useState<Member | null>(null);
	const [clearOpts, setClearOpts] = useState({ resetProfile: true, deletePosts: true, deletePhotos: true });
	const [clearBusy, setClearBusy] = useState(false);

	const load = async () => {
		try {
			const [{ members }, { changes: nextChanges }] = await Promise.all([api.adminMembers(), api.changes()]);
			setMembers(members);
			setChanges(Array.isArray(nextChanges) ? nextChanges : []);
		} catch (error) {
			toast(error instanceof Error ? error.message : "Could not load admin");
		}
	};

	useEffect(() => {
		if (user?.role === "admin") void load();
	}, [user]);

	if (user?.role !== "admin") {
		return <Empty title="Admins only" body="Ask a family admin if you need this room." />;
	}

	return (
		<div className="stack">
			<h1 className="page-title">Admin</h1>
			<p className="page-sub">Permissions, house copy, email moves, a 24-hour revert window, and clearing someone’s posts or photos.</p>
			<div className="split">
				<Glass className="panel stack">
					<h3>House copy</h3>
					<Field label="Family name" wide>
						<input value={family?.name || ""} onChange={(event) => setFamily({ name: event.target.value, tagline: family?.tagline || "" })} />
					</Field>
					<Field label="Tagline" wide>
						<input value={family?.tagline || ""} onChange={(event) => setFamily({ name: family?.name || "Winstead", tagline: event.target.value })} />
					</Field>
					<Field label="Banner title" wide>
						<input value={banner?.title || ""} onChange={(event) => setBanner({ title: event.target.value, body: banner?.body || "", active: Boolean(banner?.active) })} />
					</Field>
					<Field label="Banner body" wide>
						<textarea value={banner?.body || ""} onChange={(event) => setBanner({ title: banner?.title || "", body: event.target.value, active: Boolean(banner?.active) })} />
					</Field>
					<button className={`chip ${banner?.active ? "on" : ""}`} type="button" onClick={() => setBanner({ ...(banner || { title: "", body: "" }), active: !banner?.active })}>
						{banner?.active ? "Banner on" : "Banner off"}
					</button>
					<button
						className="btn"
						type="button"
						onClick={async () => {
							await api.saveSite({ banner, family });
							await refresh();
							toast("Site updated");
						}}
					>
						Save house
					</button>
				</Glass>
				<Glass className="panel stack">
					<h3>People</h3>
					{members.map((member) => (
						<div className="stack" key={member.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
							<div className="row">
								<div>
									<strong>{displayName(member) || member.familyEmail}</strong>
									<div className="muted">{member.familyEmail}</div>
									{member.onboarded ? null : <span className="pill">Needs profile</span>}
								</div>
								<button
									className="chip"
									type="button"
									onClick={async () => {
										const role: Role = member.role === "admin" ? "member" : "admin";
										await api.setRole(member.id, role);
										toast(`${displayName(member) || member.familyEmail} is now ${role}`);
										void load();
									}}
								>
									{member.role === "admin" ? "Remove admin" : "Make admin"}
								</button>
							</div>
							<div className="row">
								<input
									value={emailDrafts[member.id] ?? member.familyEmail}
									onChange={(event) => setEmailDrafts({ ...emailDrafts, [member.id]: event.target.value })}
								/>
								<button
									className="btn-ghost"
									type="button"
									onClick={async () => {
										await api.migrateEmail(member.id, emailDrafts[member.id] || member.familyEmail);
										toast("Login email moved");
										void load();
									}}
								>
									Migrate
								</button>
							</div>
							<button
								className="btn-danger"
								type="button"
								onClick={() => {
									setClearOpts({ resetProfile: true, deletePosts: true, deletePhotos: true });
									setClearing(member);
								}}
							>
								Clear account
							</button>
						</div>
					))}
				</Glass>
			</div>
			<RevertWindow
				changes={changes}
				onChanged={async () => {
					await load();
					await refresh();
					try {
						const next = await api.site();
						setBanner(next.banner);
						setFamily(next.family);
					} catch {
						/* house copy refresh is best-effort */
					}
				}}
			/>
			{clearing ? (
				<Modal title={`Clear ${displayName(clearing) || clearing.familyEmail}`} onClose={() => (clearBusy ? undefined : setClearing(null))}>
					<p className="muted">Choose what to wipe. Their family email stays, so they can sign in again. This cannot be undone.</p>
					<div className="actions">
						<button
							className={`chip ${clearOpts.resetProfile ? "on" : ""}`}
							type="button"
							onClick={() => setClearOpts((current) => ({ ...current, resetProfile: !current.resetProfile }))}
						>
							Reset profile
						</button>
						<button
							className={`chip ${clearOpts.deletePosts ? "on" : ""}`}
							type="button"
							onClick={() => setClearOpts((current) => ({ ...current, deletePosts: !current.deletePosts }))}
						>
							Delete all posts
						</button>
						<button
							className={`chip ${clearOpts.deletePhotos ? "on" : ""}`}
							type="button"
							onClick={() => setClearOpts((current) => ({ ...current, deletePhotos: !current.deletePhotos }))}
						>
							Delete all photos
						</button>
					</div>
					<p className="muted">
						{clearOpts.resetProfile ? "They will have to fill in onboarding again. " : ""}
						{clearOpts.deletePosts ? "Life posts and photos attached to them go away. " : ""}
						{clearOpts.deletePhotos ? "Gallery photos they uploaded go away." : ""}
					</p>
					<div className="actions">
						<button className="btn-ghost" type="button" disabled={clearBusy} onClick={() => setClearing(null)}>
							Cancel
						</button>
						<button
							className="btn-danger"
							type="button"
							disabled={clearBusy || (!clearOpts.resetProfile && !clearOpts.deletePosts && !clearOpts.deletePhotos)}
							onClick={async () => {
								const label = displayName(clearing) || clearing.familyEmail;
								const parts = [
									clearOpts.resetProfile ? "reset their profile" : "",
									clearOpts.deletePosts ? "delete all their posts" : "",
									clearOpts.deletePhotos ? "delete all their photos" : "",
								].filter(Boolean);
								if (!confirm(`Permanently ${parts.join(" and ")} for ${label}?`)) return;
								setClearBusy(true);
								try {
									const result = await api.resetMember(clearing.id, clearOpts);
									const summary = [
										result.deletedPosts ? `${result.deletedPosts} post${result.deletedPosts === 1 ? "" : "s"}` : "",
										result.deletedPhotos ? `${result.deletedPhotos} photo${result.deletedPhotos === 1 ? "" : "s"}` : "",
										clearOpts.resetProfile ? "profile reset" : "",
									].filter(Boolean);
									toast(summary.length ? `Cleared ${summary.join(", ")}` : "Account cleared");
									setClearing(null);
									await load();
									if (clearing.id === user?.id && clearOpts.resetProfile) await refresh();
								} catch (error) {
									toast(error instanceof Error ? error.message : "Could not clear that account");
								} finally {
									setClearBusy(false);
								}
							}}
						>
							{clearBusy ? "Clearing…" : "Clear selected"}
						</button>
					</div>
				</Modal>
			) : null}
		</div>
	);
}
