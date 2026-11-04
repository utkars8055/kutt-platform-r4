# Deployment checklist — Kutt platform build

## Requirements

- Node.js 24 or newer.
- npm access to install the lockfile dependencies.
- SQLite for a simple single-instance deployment, or PostgreSQL for production/multi-instance use.
- Redis recommended for shared cache and rate limiting when running multiple instances.

## First deployment

### Recommended one-command path

- BotKeep/Pterodactyl: extract the ZIP into the server root, select Node.js 24 if available, set startup command to `bash install.sh`, and start the server. See `BOTKEEP_ONE_COMMAND.md`.
- Docker host: run `bash install.sh --docker`. Requires Docker Engine/Desktop and Docker Compose v2.
- The native installer creates `.env` and a random `JWT_SECRET` if missing, installs the exact locked production dependencies, prepares the database directory, runs migrations, and starts the server in the foreground. It is idempotent on restarts and does not delete the database.
- Set `DEFAULT_DOMAIN` to the actual public hostname (hostname only, without scheme). If `localhost:3000` remains, generated short links will point to localhost.
- The installer uses the hosting panel's `SERVER_PORT` or `PORT` when supplied. Keep the app directory and database on persistent storage.

### Manual fallback

1. Use Node.js 24 or newer and copy `.example.env` to `.env`.
2. Set a unique, high-entropy `JWT_SECRET` and the public `DEFAULT_DOMAIN`.
3. Select and configure the database. Back up any existing database before upgrade.
4. `TRUST_PROXY` defaults to `false`. Set it to `true` only behind a trusted reverse proxy that overwrites forwarding headers.
5. Run `npm ci --omit=dev`, then `npm run migrate`, then `npm start`.
6. Create the first administrator account at `/create-admin`.
7. Open `/advertising` as an administrator and configure the real Monetag tag code. Keep formats disabled until correct publisher tags are available.

The Docker Compose installer uses the provided Node 24 Dockerfile, passes `.env` into the container, runs `npm run migrate` before starting the server, and creates persistent volumes for SQLite and custom assets.

## Upgrade of an existing Kutt database

1. Stop the existing application or put it into maintenance mode.
2. Back up the application directory and the complete database.
3. Deploy the source files without copying a development database over production.
4. Configure the same production database and a secure JWT secret.
5. Run `npm ci` and then `npm run migrate`.
6. Start the application and verify `/api/health/version` reports build `2026.11.04-r4-one-command-installer`.
7. Check existing login, link creation, editing, password-protected links, expiration, custom domains, QR codes and stats.
8. Test the new interstitial, previews, click limits and ads on a small test link before public traffic.

Do not run migration rollback against a live site; it drops the new feature tables and data. Keep regular backups.

## Advertising configuration

- Vignette is the selected recommended format, but it is not pre-enabled because no publisher zone code is supplied with the source.
- Paste the official provider tag exactly once in the corresponding format.
- Configure its placement as head/top/middle/bottom where offered.
- Enable one format at a time and test desktop and mobile.
- Direct Link is a separate sponsored link and never the destination of Get Link.
- Custom HTML runs in a sandboxed iframe; do not grant it more permissions without a separate security review.

## User-visible routes

- `/` — shortener dashboard.
- `/advertising` — administrator advertising/countdown settings.
- `/advertising-preview` — test waiting-page layout.
- `/preview/<link-uuid>` — per-link social preview tester.
- `/link/<link-uuid>/history` — recent detailed click history.
- `/api/health/version` — build/version information.


## Non-blocking advertising behaviour

Ad tags are held in inert templates while the document loads. The countdown starts before third-party tags are dynamically activated. This prevents ordinary external script loading from blocking the HTML parser or countdown initialization. Some legacy ad tags that depend on `document.write()` may not work correctly when dynamically inserted; test the exact Monetag zone code in `/advertising-preview` and prefer the current official asynchronous tag format.
