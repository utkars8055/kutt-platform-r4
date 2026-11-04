# BotKeep / Pterodactyl — one-command Kutt deployment

This build includes an idempotent startup installer. BotKeep should run the server process in the foreground, so the same installer is used as the panel startup command.

## One-time panel setup

1. Upload `kutt-platform-r4-one-command.zip` to the server's application directory and extract it there. The root directory must contain `install.sh`, `package.json`, `package-lock.json`, `.example.env` and `server/`.
2. Select a **Node.js 24** runtime/egg in BotKeep if it is offered. The installer can bootstrap Node 24 itself on supported Linux/glibc hosts if it has outbound network access. It cannot change the underlying managed container image or install Alpine system packages without provider support.
3. Set the panel startup command to exactly:

   ```sh
   bash install.sh
   ```

4. Ensure the allocated panel port is exposed as `SERVER_PORT` or `PORT`. The installer maps `SERVER_PORT` to Kutt's `PORT` automatically.
5. Ensure the application directory is persistent across restarts and redeployments. Kutt needs persistent write access to `.env`, `.install-state`, `db/`, `custom/`, and `.runtime/` if its private Node 24 bootstrap is used.
6. Start the server.

## What happens automatically

- Checks Node.js 24+. If too old and supported, downloads the latest Node 24 binary from the official Node.js distribution site and verifies its SHA-256 checksum.
- Creates `.env` from `.example.env` if absent.
- Generates a unique random `JWT_SECRET` if one is missing. The generated secret is stored in `.env` with restrictive file permissions.
- Sets the site name and default host if needed. In an interactive shell, it asks once for the public hostname; in a panel/non-interactive start, it uses `DEFAULT_DOMAIN`, `PUBLIC_DOMAIN`, or the `.env` value.
- Runs `npm ci --omit=dev` only when the lockfile or Node version has changed.
- Creates SQLite/custom directories, runs pending Knex migrations, and starts the web server in the foreground.
- On later panel restarts, it reuses installed dependencies and the existing database. It does not delete the database or overwrite `.env`.

## First login

Open the public BotKeep hostname and visit `/create-admin`. Create the first administrator account there. Once that account exists, use `/login` and then the dashboard at `/`.

The installer cannot know a custom public hostname assigned by a hosting panel unless the panel exposes it as an environment variable or you set `DEFAULT_DOMAIN` in `.env`. Set `DEFAULT_DOMAIN` to the hostname only, without `https://`, so generated short links use the right host. If left at `localhost:3000`, the app may run but generated short links will point to localhost.

## BotKeep limitations to know

- BotKeep/Pterodactyl is a managed container, not a Docker host. Do **not** use `bash install.sh --docker` there unless the provider explicitly supplies a Docker daemon. Use the native command above.
- If the container is Alpine/musl and Node is older than 24, the private bootstrap intentionally stops and asks for a Node 24 egg/runtime. The official Linux binaries used by this script are for glibc.
- `better-sqlite3` may need a native build toolchain if a compatible prebuilt binary is unavailable. If npm reports a compilation failure, the container needs Python 3, `make`, and a C/C++ compiler, or you need a provider Node egg/runtime that supports the package. The installer does not attempt privileged `apt`/`apk` operations.
- If BotKeep's file system is ephemeral, the database and `.env` may be lost on rebuild. Persistent storage is required for a real service.
- Monetag ads remain disabled until the administrator enters actual provider tags at `/advertising`.

## Useful checks

- Health: `/api/health`
- Version: `/api/health/version` (should report `2026.11.04-r4-one-command-installer`)
- Advertising settings: `/advertising`
- Waiting page preview: `/advertising-preview`

Do not remove `.env` or `db/`. Back them up before replacing the source ZIP or changing database configuration.
