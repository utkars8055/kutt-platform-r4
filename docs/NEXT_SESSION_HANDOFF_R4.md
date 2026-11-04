# Kutt URL Shortener — Next-Session Development & Deployment Handoff (R4)

Handoff date: 4 November 2026  
Current build: `2026.11.04-r4-one-command-installer`  
Source archive: `kutt-platform-r4-one-command.zip`

## 1. Read this first

The user wants a self-hosted URL shortener based on the uploaded Kutt source, with external social-preview assets and Monetag-supported interstitial monetisation. Do not rewrite Kutt or change its product model. The immediate deployment target is BotKeep/Pterodactyl, but the same project must also be deployable on ordinary Linux/macOS hosts and Docker environments.

The user explicitly wants a minimal deployment workflow: upload/extract the complete source once, then use one startup command. The delivered command for BotKeep/Pterodactyl is:

```sh
bash install.sh
```

The Docker-host command is:

```sh
bash install.sh --docker
```

The installer has been added to the source archive. It is not a remote URL: the ZIP must first be uploaded and extracted into the hosting server's application directory. On BotKeep, the startup command should remain `bash install.sh` so the app is installed on first start and relaunched in the foreground after each restart.

## 2. Repository/source identity

- Project: `thedevs-network/kutt`
- Kutt package version: `3.2.6`
- Source commit previously verified: `029da42b2459693681886665589fd9512d6b473c`
- License: MIT (preserve upstream licence and copyright notices)
- Runtime requirement: Node.js 24+
- Framework: Express 4
- Database access: Knex
- Default database: SQLite via `better-sqlite3`
- Optional production database: PostgreSQL or MySQL/MariaDB
- Optional Redis: caching/rate limiting
- Templates: Handlebars
- Static frontend: CSS/vanilla JavaScript/HTMX

The original source ZIP was `kutt-main.zip`. R3 was created by modifying that source. R4 adds the one-command installer and associated deployment work. Do not assume production files or a production DB are present in the archive.

## 3. Product invariants — never violate

1. `links.target` is the authoritative final destination.
2. Destination must be HTTP or HTTPS and never be replaced by an ad/affiliate URL.
3. Preview URLs are optional externally hosted image/video URLs. Kutt must not download, store, proxy, resize, convert, or host preview media.
4. Preview URL and destination URL remain separate throughout the app.
5. Human redirect waiting time defaults to 12 seconds; administrator can set 0–30 seconds.
6. At timer zero, enable Get Link. Do not automatically redirect.
7. Get Link navigates only to the saved original `links.target` after a user click.
8. Countdown is an advertising-loading opportunity only. It is not proof of ad viewing, ad click, video completion or impression.
9. If ads fail, are blocked, or unavailable, Get Link still becomes available at zero.
10. Recognised social crawlers receive server-rendered Open Graph/X metadata, not the human interstitial/ad page. Do not count crawler requests as human clicks.
11. Password-protected links retain their password gate.
12. Keep Kutt user/link/domain/authentication/schema features intact; use additive Knex migrations.

## 4. R4 changes

### One-command installer

New files:
- `install.sh`
- `BOTKEEP_ONE_COMMAND.md`
- `BOTKEEP_STARTUP_COMMAND.txt`
- `docs/NEXT_SESSION_HANDOFF_R4.md`
- `tests/installer.test.js`

`install.sh` supports:

**Native / BotKeep mode:**

```sh
bash install.sh
```

It:
- Checks for Node.js 24+.
- If Node is old/missing, attempts to install a private Node 24 binary under `.runtime/` on supported Linux/glibc x64/arm64 or macOS x64/arm64, downloading from the official Node distribution host and verifying the SHA-256 checksum.
- Explicitly stops on musl/Alpine if the preinstalled Node is too old; select a Node 24 runtime/egg in BotKeep in that case.
- Creates `.env` from `.example.env` only when `.env` is missing.
- Generates a random JWT secret if missing and saves it in `.env` with restrictive permissions.
- Writes host/site values to `.env` when configured through environment variables.
- Uses `SERVER_PORT` as `PORT` if `PORT` is not supplied.
- Uses `DEFAULT_DOMAIN`, `PUBLIC_DOMAIN`, or `.env`; if no public domain is configured, localhost remains and a warning is printed.
- Installs exact production dependencies using `npm ci --omit=dev` only if `package-lock.json`, Node version, or core module load state differs from the recorded install state.
- Creates database/custom folders.
- Runs `npm run migrate` on each start (Knex applies only pending migrations).
- Starts `node server/server.js --production` in the foreground so managed panels keep the process alive.
- Does not delete the existing `.env`, `.install-state`, database or custom data.

**Docker mode:**

```sh
bash install.sh --docker
```

It requires Docker Engine/Desktop and Docker Compose v2. It creates `.env` if missing, builds the Node 24 image and starts Compose. Docker Compose now loads `.env` into the container, overrides the internal app port to 3000, uses persistent named volumes for SQLite/custom assets, maps `${HOST_PORT:-3000}:3000`, restarts unless stopped, and has a health check for `/api/health`.

Do not run Docker mode in BotKeep unless BotKeep explicitly gives the server a Docker daemon. Native mode is the BotKeep path.

### Deployment documentation

- `README.md` includes one-command installation instructions.
- `BOTKEEP_ONE_COMMAND.md` explains BotKeep/Pterodactyl setup and known limitations.
- `docs/DEPLOYMENT_CHECKLIST.md` updated for installer flow.

### Version

`BUILD_VERSION.txt` and `server/env.js` default are now:

`2026.11.04-r4-one-command-installer`

Expected version endpoint:

`/api/health/version`

### R3 features retained

R4 includes all previous R3 code: URL validation, Redis invalidation fixes, preview schema/metadata, crawler split, 12-second waiting page, ad settings, sandboxed custom HTML, click limits/history/events, retention, UTM capture, and non-blocking ad-loader implementation.

## 5. BotKeep deployment: exact instructions

1. Upload `kutt-platform-r4-one-command.zip` into the BotKeep server's application directory.
2. Extract it so the files `install.sh`, `package.json`, `package-lock.json`, `.example.env`, and `server/` are directly in the server root.
3. Choose a Node.js 24 runtime/egg in the panel if possible. The installer has a private bootstrap path, but it depends on outbound network access and a supported glibc container.
4. Set the panel startup command to exactly:

   ```sh
   bash install.sh
   ```

5. Ensure the assigned port is available in the process environment as `SERVER_PORT` or `PORT`.
6. Set `DEFAULT_DOMAIN` to the actual public hostname (hostname only, no scheme) in BotKeep's environment settings or in `.env`. The installer cannot reliably infer a custom panel hostname from just the port. Leaving `localhost:3000` means generated short URLs will use localhost and is not correct for public use.
7. Ensure the application directory/data is persistent across restarts/redeployments. Keep `.env`, `db/`, `custom/`, `.install-state` and `.runtime/`.
8. Start the service. First-admin setup is at `/create-admin`; afterward sign in at `/login`. Main dashboard is `/`.
9. Verify `/api/health/version` returns `2026.11.04-r4-one-command-installer`.
10. Create a test short link and verify waiting countdown + Get Link go to the exact original target.

Important provider limitations:
- The hosting container may not provide compiler tools. `better-sqlite3` usually uses prebuilt binaries where available, but otherwise needs Python 3, `make` and a C/C++ compiler. The installer does not run privileged apt/apk commands.
- If BotKeep's server files are ephemeral, data can disappear on rebuild. Persistent storage is required.
- Node 24 is a hard project requirement due locked dependency engines.
- No Monetag publisher tags are bundled; formats should stay disabled until the admin enters real tags in `/advertising`.

## 6. Current tests/verification

Latest checks in R4:
- `node --test tests/*.test.js`: 15 passed, 0 failed.
- `node --check` across all JavaScript under `server/`, `static/scripts/`, and `tests/`: passed.
- `bash -n install.sh`: passed.
- `bash install.sh --help`: passed.
- Native installer orchestration smoke test using mocked Node/npm commands: passed. It verified `.env` creation, random JWT persistence, dependency command execution, migration command execution and foreground process handoff.
- Docker installer orchestration smoke test using a mocked Docker CLI: passed. It verified `.env`/JWT setup, Compose command invocation and final URL output.
- Docker Compose YAML parsed successfully with PyYAML; an actual `docker compose config`/build was unavailable because Docker is not installed here.

What is still NOT verified:
- No real `npm ci` completion in this development environment. The current runtime is Node 22.16.0 and DNS/network requests to nodejs.org/npm registry fail with `Could not resolve host` / `EAI_AGAIN`.
- No real Node 24 private-runtime download.
- No real `better-sqlite3` load from a clean installation.
- No real Kutt server process startup.
- No Knex migration executed against a real SQLite/PostgreSQL/MySQL test DB.
- Docker is not available in the development environment, so `docker compose up` and `docker compose config` were not executed.
- No browser, BotKeep, proxy, Redis, or live Monetag integration test.

Do not call R4 production-certified until these runtime/deployment checks pass on the actual target host.

## 7. Next-session task list

### Immediate deployment task

Help the user deploy R4 on BotKeep using the already supplied ZIP and one startup command. Do not ask them to rewrite the command: it is `bash install.sh`. If the panel fails, request its exact startup log and diagnose the actual error. Do not assume the cause.

Confirm:
- BotKeep's runtime is Node 24 (or the private bootstrap succeeded).
- npm install finished and `.install-state` exists.
- database migration completed.
- app listens on the assigned port.
- `DEFAULT_DOMAIN` is the public URL hostname (without scheme).
- `/api/health/version` returns the R4 marker.
- `/create-admin` works.
- dashboard login and existing Kutt features work.

### Then test new functionality

- New link destination remains the target.
- Human interstitial countdown default 12 seconds; zero enables Get Link without a delay.
- No automatic redirect at zero; user click required.
- Ad failures/ad blocker do not block Get Link.
- Password-protected links retain gate.
- Link click limit works under concurrent requests.
- Crawler GET/HEAD receives server-rendered metadata; crawler hits not counted as human visits.
- Test Telegram/WhatsApp/Facebook/X preview cache behaviour.
- Monetag one zone/format at a time, with mobile/desktop and ad-blocker testing.

### Remaining roadmap (not yet implemented)

- UTM builder UI and fuller UTM reporting.
- Tracking pixel integrations.
- Link-edit audit history.
- Abuse-report moderation queue.
- Admin retention controls UI.
- Expanded administrator analytics.
- Full detail-level database integration tests.
- Production backup/restore and monitoring guide.

Do not invent that these have shipped.

## 8. Files changed in R4

- `install.sh` — new one-command native/Docker installer.
- `docker-compose.yml` — passes `.env` to container; persistent volumes; configurable host port; restart policy; healthcheck.
- `README.md` — installation instructions.
- `BOTKEEP_ONE_COMMAND.md` — BotKeep-specific directions.
- `BOTKEEP_STARTUP_COMMAND.txt` — exact startup command.
- `.gitignore` — ignores `.runtime/` and `.install-state`.
- `tests/installer.test.js` — installer checks.
- `server/env.js` — default build marker R4.
- `BUILD_VERSION.txt` — R4 marker.
- `docs/DEPLOYMENT_CHECKLIST.md` — installer-aware deployment guide.
- `docs/NEXT_SESSION_HANDOFF_R4.md` — this handoff.

The previous R3 feature implementation remains in place.

## 9. Never lose these decisions

The platform is a URL shortener, not a media host. Preview files stay external. Monetag is the selected ad provider. Vignette is the recommended initial format but no publisher zone should be enabled without actual account-provided code. The 12-second timer is a delay to let advertising initialize, not an ad verification mechanism. Get Link unlocks at zero and navigates only when clicked. Final destination integrity is mandatory.
