import type { FormEvent, HTMLAttributes, ReactNode } from "react";
import type { AvatarStyle, Member } from "../shared/types";

export function initialsFor(person: Pick<Member, "fullName" | "nickname">) {
	const parts = (person.fullName || "").trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
	const nick = (person.nickname || "").trim();
	if (nick) return nick.slice(0, nick.length > 1 ? 2 : 1).toUpperCase();
	return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

export function Avatar({
	person,
	size = "sm",
	forceInitials = false,
}: {
	person: Pick<Member, "fullName" | "nickname" | "avatarUrl"> & { avatarStyle?: AvatarStyle };
	size?: "sm" | "lg";
	forceInitials?: boolean;
}) {
	const style = person.avatarStyle || "gold";
	if (person.avatarUrl && !forceInitials) {
		return (
			<div className={`avatar ${size === "lg" ? "lg" : ""} photo`} aria-hidden="true">
				<img src={person.avatarUrl} alt="" />
			</div>
		);
	}
	return (
		<div className={`avatar ${size === "lg" ? "lg" : ""} initials initials-${style}`} aria-hidden="true">
			{initialsFor(person)}
		</div>
	);
}

export function Glass({
	children,
	className = "",
	...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={`glass ${className}`} {...props}>
			{children}
		</div>
	);
}

export function Field({
	label,
	children,
	wide,
}: {
	label: string;
	children: ReactNode;
	wide?: boolean;
}) {
	return (
		<label className={`field ${wide ? "wide" : ""}`}>
			<span>{label}</span>
			{children}
		</label>
	);
}

export function Empty({ title, body }: { title: string; body: string }) {
	return (
		<Glass className="empty panel">
			<h3>{title}</h3>
			<p>{body}</p>
		</Glass>
	);
}

export function Modal({
	title,
	children,
	onClose,
}: {
	title: string;
	children: ReactNode;
	onClose: () => void;
}) {
	return (
		<div className="modal-back" onClick={onClose} role="presentation">
			<Glass className="modal" onClick={(event) => event.stopPropagation()}>
				<div className="row" style={{ marginBottom: 16 }}>
					<h2 style={{ margin: 0 }}>{title}</h2>
					<button className="btn-ghost" type="button" onClick={onClose}>
						Close
					</button>
				</div>
				{children}
			</Glass>
		</div>
	);
}

export function FileButton({
	label,
	accept = "image/*",
	multiple = false,
	onChange,
	files,
}: {
	label: string;
	accept?: string;
	multiple?: boolean;
	onChange: (files: FileList | null) => void;
	files?: FileList | null;
}) {
	const count = files?.length ?? 0;
	return (
		<label className="file-btn">
			<input
				type="file"
				accept={accept}
				multiple={multiple}
				onChange={(event) => onChange(event.target.files)}
			/>
			<span>{count > 0 ? `${count} photo${count === 1 ? "" : "s"} selected` : label}</span>
		</label>
	);
}

export function LineList({
	value,
	onChange,
	placeholder,
}: {
	value: string[];
	onChange: (next: string[]) => void;
	placeholder: string;
}) {
	return (
		<div className="stack">
			{value.map((item, index) => (
				<input
					key={`${index}-${placeholder}`}
					value={item}
					placeholder={placeholder}
					onChange={(event) => {
						const next = [...value];
						next[index] = event.target.value;
						onChange(next);
					}}
				/>
			))}
			<button className="btn-ghost" type="button" onClick={() => onChange([...value, ""])}>
				Add another
			</button>
		</div>
	);
}

export function when(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function greeting(name: string) {
	const hour = new Date().getHours();
	const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
	return `${hello}, ${name}`;
}

export function onSubmit(handler: () => Promise<void>) {
	return async (event: FormEvent) => {
		event.preventDefault();
		await handler();
	};
}

export function displayName(person: Pick<Member, "fullName" | "nickname">) {
	return person.nickname || person.fullName;
}

export type LabeledLine = {
	title: string;
	value: string;
	href?: string;
};

export function ContactLines({ lines }: { lines: LabeledLine[] }) {
	const visible = lines.filter((line) => line.value.trim());
	if (!visible.length) return <p className="muted">No details yet.</p>;
	return (
		<div className="contact-lines">
			{visible.map((line) => (
				<div className="contact-line" key={line.title}>
					<span className="contact-line-title">{line.title}</span>
					{line.href ? (
						<a
							href={line.href}
							{...(line.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
						>
							{line.value}
						</a>
					) : (
						<span>{line.value}</span>
					)}
				</div>
			))}
		</div>
	);
}

export function cardText(name: string, lines: LabeledLine[]) {
	return [name, ...lines.filter((line) => line.value.trim()).map((line) => `${line.title}: ${line.value}`)].join("\n");
}

export async function shareCard(name: string, lines: LabeledLine[]) {
	const text = cardText(name, lines);
	if (navigator.share) {
		await navigator.share({ title: name, text });
		return "shared" as const;
	}
	await navigator.clipboard.writeText(text);
	return "copied" as const;
}
