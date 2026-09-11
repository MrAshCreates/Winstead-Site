# Winstead Family

A private family home at [winstead.family](https://winstead.family): Cloudflare Access for `*@winstead.family`, a Worker API, D1 for data, R2 for photos, and a React app with an iOS-like glass interface.

## What you get

- Cloudflare Access email codes (one hour) for any `@winstead.family` inbox
- First visit creates a profile; returning visits sign you in automatically
- `asher@winstead.family` is the first admin
- Home, life updates, gallery, recipe book, directory, reminders, appearance settings
- Admins can edit the house copy, promote people, migrate login emails, hard-delete content, and revert changes for 24 hours
- Everyone can add recipes, directory entries, and gallery photos; people manage their own posts

## Local development

```bash
cp .dev.vars.example .dev.vars
npm install
npm run db:migrate:local
npm run dev
```

Open the app, sign in with a `@winstead.family` address (try `asher@winstead.family` for admin), then complete the profile.

## GitHub + Cloudflare

1. Create a GitHub repository and push this project.
2. In Cloudflare, open **Workers & Pages** → **Create** → connect the GitHub repo (Workers with assets, not the older Pages-only flow).
3. Create storage, then put the IDs into `wrangler.jsonc`:

```bash
npx wrangler d1 create winstead-family
npx wrangler r2 bucket create winstead-family-media
```

Replace the placeholder `database_id` in `wrangler.jsonc` with the real D1 id. Keep the R2 bucket name `winstead-family-media`.

4. After the first deploy:

```bash
npx wrangler d1 migrations apply winstead-family --remote
```

5. Attach the custom domain `winstead.family` to the Worker.

Build / deploy commands for Cloudflare Git:

- **Build:** `npm ci && npm run build`
- **Deploy:** `npx wrangler deploy --keep-vars`

Set Access keys in the Worker **Settings → Variables** (do not put them in `wrangler.jsonc`, or Git deploys will blank them):

| Name | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `POLICY_AUD` | Access application AUD |
| `ALLOWED_EMAIL_DOMAIN` | `winstead.family` |
| `BOOTSTRAP_ADMIN_EMAIL` | `asher@winstead.family` |

The Worker verifies the Access JWT (`Cf-Access-Jwt-Assertion` or the `CF_Authorization` cookie) on every `/api/*` request. Do not trust the email header alone.

## Cloudflare Access (email code, 1 hour)

Protect `winstead.family` with a Zero Trust self-hosted Access application (hostname-based Access is the right choice for a Worker with static assets).

1. Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Domain: `winstead.family` (and `www` if you use it)
3. Session duration: **1 hour**
4. Identity: **One-time PIN** (email code)
5. Policy include rule: **Emails ending in** `winstead.family`
6. Copy the application **AUD tag** and your team domain (`https://<team>.cloudflareaccess.com`)
7. Put those on the Worker as `POLICY_AUD` and `TEAM_DOMAIN` (dashboard variables, not `wrangler.jsonc`)
8. In the Git integration, set the deploy command to `npx wrangler deploy --keep-vars` so later deploys don’t wipe them

## Roles

- **Member:** own profile, own posts, comments, reminders; collaborative edits on recipes, gallery captions, and extra phone-book contacts
- **Admin:** all of the above, plus site banner, roles, email migration, any delete, and 24-hour revert

## Appearance

Each person can choose light / dark / system, color schemes, glass transparency, and fonts (default, ADHD-friendly Lexend, dyslexia-friendly OpenDyslexic, Atkinson Hyperlegible, rounded, serif).
