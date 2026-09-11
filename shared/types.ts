export type Role = "admin" | "member";
export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme =
	| "heritage"
	| "pearl"
	| "garden"
	| "twilight"
	| "rosewood"
	| "ocean";
export type FontChoice =
	| "default"
	| "adhd"
	| "dyslexia"
	| "readable"
	| "rounded"
	| "serif";
export type AvatarStyle = "gold" | "ink" | "soft" | "ring" | "bloom" | "mono";
export type BackdropStyle = "orbs" | "linen" | "dots" | "diamonds" | "waves" | "grid" | "symbols" | "photo";
export type PostKind = "update" | "announcement";
export type ReminderAudience = "self" | "family";
export type ChangeAction = "create" | "update" | "delete";

export type Preferences = {
	mode: ThemeMode;
	scheme: ColorScheme;
	transparency: number;
	font: FontChoice;
	avatarStyle: AvatarStyle;
	backdrop: BackdropStyle;
	backdropKey: string | null;
};

export type SocialLink = {
	label: string;
	handle: string;
	url: string;
};

export type Member = {
	id: string;
	familyEmail: string;
	personalEmail: string;
	fullName: string;
	nickname: string;
	dateOfBirth: string;
	residence: string;
	phone: string;
	socials: SocialLink[];
	role: Role;
	onboarded: boolean;
	avatarUrl: string | null;
	avatarStyle: AvatarStyle;
	preferences: Preferences;
	createdAt: string;
	updatedAt: string;
};

export type SiteBanner = {
	title: string;
	body: string;
	active: boolean;
};

export type FamilyMeta = {
	name: string;
	tagline: string;
};

export type SiteSettings = {
	banner: SiteBanner;
	family: FamilyMeta;
};

export type MediaRef = {
	key: string;
	url: string;
};

export type ReactionSummary = {
	emoji: string;
	count: number;
	me: boolean;
};

export type Comment = {
	id: string;
	postId: string;
	author: Pick<Member, "id" | "fullName" | "nickname" | "avatarUrl" | "avatarStyle">;
	body: string;
	createdAt: string;
};

export type Post = {
	id: string;
	kind: PostKind;
	body: string;
	media: MediaRef[];
	author: Pick<Member, "id" | "fullName" | "nickname" | "avatarUrl" | "avatarStyle" | "role">;
	createdAt: string;
	updatedAt: string;
	commentCount: number;
	reactions: ReactionSummary[];
	comments?: Comment[];
};

export type Reminder = {
	id: string;
	authorId: string;
	authorName: string;
	title: string;
	body: string;
	dueAt: string | null;
	audience: ReminderAudience;
	completed: boolean;
	createdAt: string;
	mine: boolean;
};

export type Recipe = {
	id: string;
	title: string;
	description: string;
	ingredients: string[];
	steps: string[];
	notes: string;
	media: MediaRef[];
	author: Pick<Member, "id" | "fullName" | "nickname" | "avatarUrl" | "avatarStyle">;
	createdAt: string;
	updatedAt: string;
};

export type ExtraContact = {
	id: string;
	userId: string | null;
	firstName: string;
	lastName: string;
	displayName: string;
	phone: string;
	email: string;
	address: string;
	notes: string;
	avatarKey: string | null;
	avatarUrl: string | null;
	avatarStyle: AvatarStyle;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

export type GalleryItem = {
	id: string;
	title: string;
	caption: string;
	album: string;
	media: MediaRef;
	uploadedBy: Pick<Member, "id" | "fullName" | "nickname" | "avatarUrl" | "avatarStyle">;
	createdAt: string;
	updatedAt: string;
};

export type ChangeFieldDiff = {
	field: string;
	from: string;
	to: string;
};

export type ChangeLogEntry = {
	id: string;
	entityType: string;
	entityId: string;
	action: ChangeAction;
	actorName: string;
	createdAt: string;
	revertedAt: string | null;
	canRevert: boolean;
	needsCascade: boolean;
	laterCount: number;
	permanent: boolean;
	title: string;
	detail: string;
	blockedReason: string | null;
	windowEndsAt: string;
	remainingMs: number;
	diffs: ChangeFieldDiff[];
};

export const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type EmailMigration = {
	id: string;
	userId: string;
	oldEmail: string;
	newEmail: string;
	migratedAt: string;
};

export type MeResponse =
	| {
			status: "unauthenticated";
			reason: "access" | "dev";
			allowedDomain: string;
			accessTokenPresent?: boolean;
			accessPinned?: boolean;
	  }
	| {
			status: "needs_onboarding";
			familyEmail: string;
			site: SiteSettings;
	  }
	| {
			status: "ok";
			user: Member;
			site: SiteSettings;
	  };

export const GLASS_MIN = 15;
export const GLASS_MAX = 90;

export const DEFAULT_PREFERENCES: Preferences = {
	mode: "system",
	scheme: "heritage",
	transparency: 72,
	font: "default",
	avatarStyle: "gold",
	backdrop: "orbs",
	backdropKey: null,
};

export const AVATAR_STYLES: { id: AvatarStyle; label: string }[] = [
	{ id: "gold", label: "Gold" },
	{ id: "ink", label: "Ink" },
	{ id: "soft", label: "Soft" },
	{ id: "ring", label: "Ring" },
	{ id: "bloom", label: "Bloom" },
	{ id: "mono", label: "Mono" },
];

export const BACKDROP_STYLES: { id: BackdropStyle; label: string; note: string }[] = [
	{ id: "orbs", label: "Color orbs", note: "Soft glows" },
	{ id: "linen", label: "Linen", note: "Woven texture" },
	{ id: "dots", label: "Dots", note: "Quiet pattern" },
	{ id: "diamonds", label: "Diamonds", note: "Heritage lattice" },
	{ id: "waves", label: "Waves", note: "Gentle ripples" },
	{ id: "grid", label: "Grid", note: "Notebook lines" },
	{ id: "symbols", label: "Symbols", note: "Marks and stars" },
	{ id: "photo", label: "Photo", note: "Your own picture" },
];

export const COLOR_SCHEMES: { id: ColorScheme; label: string; note: string }[] = [
	{ id: "heritage", label: "Heritage", note: "Champagne gold and espresso" },
	{ id: "pearl", label: "Pearl", note: "Ivory and cool silver" },
	{ id: "garden", label: "Garden", note: "Sage and cream" },
	{ id: "twilight", label: "Twilight", note: "Indigo and amethyst" },
	{ id: "rosewood", label: "Rosewood", note: "Burgundy and blush" },
	{ id: "ocean", label: "Ocean", note: "Navy and sea glass" },
];

export const FONT_CHOICES: { id: FontChoice; label: string; note: string }[] = [
	{ id: "default", label: "Default", note: "System / Inter" },
	{ id: "adhd", label: "ADHD friendly", note: "Lexend" },
	{ id: "dyslexia", label: "Dyslexia friendly", note: "OpenDyslexic" },
	{ id: "readable", label: "Highly readable", note: "Atkinson Hyperlegible" },
	{ id: "rounded", label: "Rounded", note: "Nunito" },
	{ id: "serif", label: "Editorial serif", note: "Source Serif" },
];
