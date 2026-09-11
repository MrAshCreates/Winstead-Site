import { createRemoteJWKSet, jwtVerify } from "jose";

const DEV_COOKIE = "winstead_dev_email";
const ONE_HOUR = 60 * 60;

export type AccessIdentity = {
	email: string;
	source: "access" | "dev";
};

export function isDev(env: Env): boolean {
	return env.ENVIRONMENT === "development";
}

export function allowedDomain(env: Env): string {
	return (env.ALLOWED_EMAIL_DOMAIN || "winstead.family").toLowerCase();
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isFamilyEmail(email: string, env: Env): boolean {
	const domain = allowedDomain(env);
	const normalized = normalizeEmail(email);
	return normalized.endsWith(`@${domain}`) && normalized.split("@")[0].length > 0;
}

export function bootstrapAdminEmail(env: Env): string {
	return normalizeEmail(env.BOOTSTRAP_ADMIN_EMAIL || "asher@winstead.family");
}

export function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get("Cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const [rawKey, ...rest] = part.trim().split("=");
		if (rawKey === name) return decodeURIComponent(rest.join("="));
	}
	return null;
}

export function devEmailCookie(email: string, secure: boolean): string {
	const flags = [
		`${DEV_COOKIE}=${encodeURIComponent(email)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${ONE_HOUR}`,
	];
	if (secure) flags.push("Secure");
	return flags.join("; ");
}

export function clearDevEmailCookie(secure: boolean): string {
	const flags = [
		`${DEV_COOKIE}=`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		"Max-Age=0",
	];
	if (secure) flags.push("Secure");
	return flags.join("; ");
}

async function verifyAccessJwt(request: Request, env: Env): Promise<string | null> {
	const token = request.headers.get("cf-access-jwt-assertion");
	if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;

	const issuer = env.TEAM_DOMAIN.startsWith("https://")
		? env.TEAM_DOMAIN
		: `https://${env.TEAM_DOMAIN}`;
	const JWKS = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
	const { payload } = await jwtVerify(token, JWKS, {
		issuer,
		audience: env.POLICY_AUD,
	});
	const email = typeof payload.email === "string" ? payload.email : null;
	return email ? normalizeEmail(email) : null;
}

export async function resolveIdentity(
	request: Request,
	env: Env,
): Promise<AccessIdentity | null> {
	try {
		const jwtEmail = await verifyAccessJwt(request, env);
		if (jwtEmail && isFamilyEmail(jwtEmail, env)) {
			return { email: jwtEmail, source: "access" };
		}
	} catch (error) {
		console.error("access jwt failed", error);
		if (!isDev(env)) return null;
	}

	if (!isDev(env)) return null;

	const headerEmail = request.headers.get("X-Winstead-Dev-Email");
	const cookieEmail = readCookie(request, DEV_COOKIE);
	const email = normalizeEmail(headerEmail || cookieEmail || "");
	if (!email || !isFamilyEmail(email, env)) return null;
	return { email, source: "dev" };
}
