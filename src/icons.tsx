import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 22, children, ...props }: IconProps & { children: ReactNode }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
			{children}
		</svg>
	);
}

export const Icons = {
	home: (p: IconProps) => (
		<Icon {...p}>
			<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
		</Icon>
	),
	life: (p: IconProps) => (
		<Icon {...p}>
			<rect x="3" y="4" width="18" height="16" rx="4" />
			<circle cx="8.5" cy="10" r="1.2" />
			<path d="m21 15-4.5-4.5L7 20" />
		</Icon>
	),
	apps: (p: IconProps) => (
		<Icon {...p}>
			<rect x="3" y="3" width="7" height="7" rx="2" />
			<rect x="14" y="3" width="7" height="7" rx="2" />
			<rect x="3" y="14" width="7" height="7" rx="2" />
			<rect x="14" y="14" width="7" height="7" rx="2" />
		</Icon>
	),
	you: (p: IconProps) => (
		<Icon {...p}>
			<circle cx="12" cy="8" r="3.2" />
			<path d="M5 19.5c1.4-3.2 3.7-4.8 7-4.8s5.6 1.6 7 4.8" />
		</Icon>
	),
	gallery: (p: IconProps) => (
		<Icon {...p}>
			<rect x="3" y="5" width="18" height="14" rx="3" />
			<circle cx="8.5" cy="10" r="1.3" />
			<path d="m21 16-5-5-8 8" />
		</Icon>
	),
	recipes: (p: IconProps) => (
		<Icon {...p}>
			<path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4z" />
			<path d="M8 8h8M8 12h6" />
		</Icon>
	),
	directory: (p: IconProps) => (
		<Icon {...p}>
			<rect x="5" y="3" width="14" height="18" rx="2" />
			<path d="M9 8h6M9 12h6M9 16h4" />
		</Icon>
	),
	bell: (p: IconProps) => (
		<Icon {...p}>
			<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9" />
			<path d="M10 19a2 2 0 0 0 4 0" />
		</Icon>
	),
	settings: (p: IconProps) => (
		<Icon {...p}>
			<circle cx="12" cy="12" r="3" />
			<path d="M12 3v2M12 19v2M4.9 6.5l1.6 1.2M17.5 16.3l1.6 1.2M3 12h2M19 12h2M4.9 17.5l1.6-1.2M17.5 7.7l1.6-1.2" />
		</Icon>
	),
	shield: (p: IconProps) => (
		<Icon {...p}>
			<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
		</Icon>
	),
	soon: (p: IconProps) => (
		<Icon {...p}>
			<circle cx="12" cy="12" r="8" />
			<path d="M12 8v5l3 2" />
		</Icon>
	),
	megaphone: (p: IconProps) => (
		<Icon {...p}>
			<path d="M4 10v4h3l6 4V6L7 10H4z" />
			<path d="M16.5 9.5a3.2 3.2 0 0 1 0 5" />
			<path d="M7 14.5 6 19h2.4l.9-4.5" />
		</Icon>
	),
	share: (p: IconProps) => (
		<Icon {...p} size={p.size ?? 18}>
			<circle cx="18" cy="5" r="2.4" />
			<circle cx="6" cy="12" r="2.4" />
			<circle cx="18" cy="19" r="2.4" />
			<path d="m8.2 13.2 7.6 4.2M15.8 6.6 8.2 10.8" />
		</Icon>
	),
	download: (p: IconProps) => (
		<Icon {...p} size={p.size ?? 18}>
			<path d="M12 4v11" />
			<path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
			<path d="M5 19h14" />
		</Icon>
	),
};
