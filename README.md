<p align="center"><a href="https://kutt.to" title="kutt.to"><img src="https://raw.githubusercontent.com/thedevs-network/kutt/9d1c873897c3f5b9a1bd0c74dc5d23f2ed01f2ec/static/images/logo-github.png" alt="Kutt.to"></a></p>

# Kutt.to

**Kutt** is a modern URL shortener with support for custom domains. Create and edit links, view statistics, manage users, and more.

[https://kutt.to](https://kutt.to)

> [!WARNING]
> **[kutt.it](https://kutt.it) is NOT OWNED BY US.** It could be a phishing site. We had the domain but it has been deactivated by the Italian TLD registrar due to the lack of identification documents, and now it's owned by someone else.


>  Please use [kutt.to](https://kutt.to), all the previous and the future links work with this domain as well.


[![docker-build-release](https://github.com/thedevs-network/kutt/actions/workflows/docker-build-release.yaml/badge.svg)](https://github.com/thedevs-network/kutt/actions/workflows/docker-build-release.yaml)
[![Uptime Status](https://uptime.betterstack.com/status-badges/v2/monitor/1ogaa.svg)](https://status.kutt.to)
[![Contributions](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](https://github.com/thedevs-network/kutt/#contributing)
[![GitHub license](https://img.shields.io/github/license/thedevs-network/kutt.svg)](https://github.com/thedevs-network/kutt/blob/develop/LICENSE)

## Table of contents

- [Key features](#key-features)
- [Donations and sponsors](#donations-and-sponsors)
- [Setup](#setup)
- [Docker](#docker)
- [API](#api)
- [Configuration](#configuration)
- [Themes and customizations](#themes-and-customizations)
- [Browser extensions](#browser-extensions)
- [Videos](#videos)
- [Integrations](#integrations)
- [Contributing](#contributing)

## Key features

- Created with self-host in mind:
  - Zero configuration needed
  - Easy setup with no build step
  - Supporting various databases (SQLite, Postgres, MySQL)
  - Ability to disable registration and anonymous links
  - OpenID Connect (OIDC) login
- Custom domain support
- Set custom URLs, password, description, and expiration time for links
- View, edit, delete and manage your links
- Private statistics for shortened URLs
- Admin page to manage users and links
- Customizability and themes
- RESTful API

## Donations and sponsors

Support the development of Kutt by making a donation or becoming an sponsor.

[Donate or sponsor →](https://btcpay.kutt.to/apps/L9Gc7PrnLykeRHkhsH2jHivBeEh/crowdfund)

## Setup

The only prerequisite is [Node.js](https://nodejs.org/) (version 24 or above). The default database is SQLite. You can optionally install Postgres or MySQL/MariaDB for the database or Redis for the cache. 

When you first start the app, you're prompted to create an admin account.

1. Clone this repository or [download the latest zip](https://github.com/thedevs-network/kutt/releases)
2. Install dependencies: `npm install`
3. Initialize database: `npm run migrate`
5. Start the app for development `npm run dev` or production `npm start`

## Docker

Make sure Docker is installed, then you can start the app from the root directory:

```sh
docker compose up
```

Various docker-compose configurations are available. Use `docker compose -f <file_name> up` to start the one you want:

- [`docker-compose.yml`](./docker-compose.yml): Default Kutt setup. Uses SQLite for the database.
- [`docker-compose.sqlite-redis.yml`](./docker-compose.sqlite-redis.yml): Starts Kutt with SQLite and Redis.
  - Required environment variable: `REDIS_ENABLED`
- [`docker-compose.postgres.yml`](./docker-compose.postgres.yml): Starts Kutt with Postgres and Redis.
  - Required environment variables: `REDIS_ENABLED`, `DB_PASSWORD`, `DB_NAME`, `DB_USER`
- [`docker-compose.mariadb.yml`](./docker-compose.mariadb.yml): Starts Kutt with MariaDB and Redis.
  - Required environment variables: `REDIS_ENABLED`, `DB_PASSWORD`, `DB_NAME`, `DB_USER`, `DB_PORT`

Official Kutt Docker image is available on [Docker Hub](https://hub.docker.com/r/kutt/kutt).

## One-command installation (R4)

The project now includes an idempotent installer/launcher. Extract the project ZIP into its own application directory, then run one command from that directory:

```sh
bash install.sh
```

The script checks for Node.js 24+, bootstraps a private Node 24 runtime on supported Linux/glibc and macOS hosts when the installed Node is too old, creates a protected `.env` with a random JWT secret if needed, installs exact production dependencies with `npm ci`, prepares the SQLite data directory, runs pending Knex migrations, and starts Kutt in the foreground. It skips dependency installation on restarts when the lockfile and Node version have not changed. It never overwrites an existing `.env` or database.

### BotKeep / Pterodactyl

1. Upload and extract the complete project ZIP into the server root (the directory containing `install.sh`, `package.json` and `package-lock.json`).
2. Select a Node.js 24 runtime/egg in the hosting panel if available. Set the startup command to exactly `bash install.sh`.
3. Ensure the panel's assigned port is exposed as `SERVER_PORT` or `PORT`. The script uses it automatically.
4. Start/restart the server. The script installs dependencies when required, migrates the database, and keeps the application running in the foreground.
5. Open `/create-admin` on the public hostname for the first administrator account.

The script can download Node 24 itself on supported Linux/glibc containers, but a managed host may restrict outbound downloads or use Alpine/musl. Selecting the provider's Node 24 runtime is the reliable BotKeep option. The app requires writable persistent storage for `.env`, `.install-state`, `.runtime` (when bootstrapped), `db/` and `custom/`. Do not enable an ephemeral filesystem if you need links and accounts to survive restarts/redeployments.

### Docker deployment (Linux, macOS or Windows with Docker Desktop)

With Docker Engine/Desktop and the Compose v2 plugin installed, the entire deployment is:

```sh
bash install.sh --docker
```

This creates `.env` if needed, builds the Node 24 image, runs migrations in the container startup command, and starts the service with persistent database/custom volumes and a health check. The host port defaults to `3000`; set `HOST_PORT` before running the command to change it.

The same `install.sh` is used for both modes. `--docker` is not available inside BotKeep unless the provider explicitly supplies a Docker daemon; use the native startup command there. The shell installer supports Linux and macOS. On Windows, use Docker Desktop with WSL or run it from a Bash environment.

The script is safe to run again after a restart or source update: it does not delete existing user data, and migration execution is handled by Knex's migration tracking. Back up the database before upgrading.

## Extended redirect, preview and advertising features

This build retains Kutt's existing shortener features and adds an optional human waiting page, external social-preview metadata, click limits and administrator-managed advertising placements.

- Human browser visits receive a waiting page. The default countdown is 12 seconds; at zero, **Get Link** becomes enabled and navigation happens only after the visitor clicks it. A zero-second setting disables the wait. The timer does not verify ad views or clicks.
- The canonical destination remains the original `links.target` value. Monetag Direct Links and preview assets are separate and never replace the destination.
- External preview image/video URLs, title, description, image alt text and video MIME type are used to render Open Graph and X/Twitter metadata in the initial HTML response for recognised social crawlers. Preview assets are not downloaded, proxied or hosted by Kutt.
- Password-protected links retain their password gate. Once unlocked in a browser, they continue through the waiting page.
- Per-link click limits and detailed click history are available. The click-history page is `/link/<link-uuid>/history`; the JSON endpoint is `/api/links/<link-uuid>/click-history`.
- Administrators can configure the countdown and advertising formats at `/advertising`. The preview page is `/advertising-preview`. Available formats are Vignette, OnClick/Popunder, In-Page Push, Banner, Direct Link and sandboxed Custom HTML.
- No advertising format is active until an administrator supplies a valid publisher tag or sponsored destination. Vignette is the recommended primary format; it is not pre-enabled without your own Monetag zone code. Tags are activated dynamically after the countdown initializes so slow external scripts do not block the timer.
- Social crawler requests are separated from human visits. HEAD requests do not consume click limits or count as visits. Crawler preview pages do not show advertising.

### First startup for this build

Use Node.js 24 or newer. The Docker image includes a temporary Alpine build toolchain for `better-sqlite3` and removes it after dependency installation. Install dependencies with `npm ci`, copy `.example.env` to `.env`, set a strong unique `JWT_SECRET` and the correct public `DEFAULT_DOMAIN`, then run `npm run migrate` before `npm start`. Back up an existing production database before applying migrations. The new migration is additive and does not recreate Kutt's existing tables.

Set `TRUST_PROXY=true` only when the app is behind a trusted reverse proxy that overwrites forwarded headers. It defaults to `false`; keep it that way for a direct deployment. For multi-instance production, use PostgreSQL and Redis with an appropriate trusted proxy and shared rate-limit store.

## API

[View API documentation →](https://docs.kutt.to)

## Configuration

The app is configured via environment variables. You can pass environment variables directly or create a `.env` file. View [`.example.env`](./.example.env) file for the list of configurations.

All variables are optional except `JWT_SECRET` which is required on production. 

You can use files for each of the variables by appending `_FILE` to the name of the variable. Example: `JWT_SECRET_FILE=/path/to/secret_file`.

| Variable | Description | Default | Example |
| -------- | ----------- | ------- | ------- |
| `JWT_SECRET` | This is used to sign authentication tokens. Use a **long** **random** string. | - | - |
| `PORT` |  The port to start the app on | `3000` | `8888` |
| `SITE_NAME` |  Name of the website | `Kutt` | `Your Site` |
| `DEFAULT_DOMAIN` |  The domain address that this app runs on | `localhost:3000` | `yoursite.com` |
| `LINK_LENGTH` | The length of of shortened address | `6` | `5` |
| `LINK_CUSTOM_ALPHABET` | Alphabet used to generate custom addresses. Default value omits o, O, 0, i, I, l, 1, and j to avoid confusion when reading the URL. | (abcd..789) | `abcABC^&*()@` |
| `DISALLOW_REGISTRATION` | Disable registration. Note that if `MAIL_ENABLED` is set to false, then the registration would still be disabled since it relies on emails to sign up users. | `true` | `false` |
| `DISALLOW_LOGIN_FORM` | Disable login with email and password. Only makes sense if OIDC is enabled. | `false` | `true` |
| `DISALLOW_ANONYMOUS_LINKS` | Disable anonymous link creation | `true` | `false` |
| `TRUST_PROXY` | Trust forwarded client IP headers only when running behind a trusted reverse proxy that overwrites them. Defaults to false for direct deployments. | `false` | `true` |
| `DB_CLIENT` |  Which database client to use. Supported clients: `pg` or `pg-native` for Postgres, `mysql2` for MySQL or MariaDB, `sqlite3` and `better-sqlite3` for SQLite. NOTE: `pg-native` and `sqlite3` are not installed by default, use `npm` to install them before use. | `better-sqlite3` | `pg` |
| `DB_FILENAME` |  File path for the SQLite database. Only if you use SQLite. | `db/data` | `/var/lib/data` |
| `DB_HOST` | Database connection host. Only if you use Postgres or MySQL. | `localhost` | `your-db-host.com` |
| `DB_PORT` | Database port. Only if you use Postgres or MySQL. | `5432` (Postgres) | `3306` (MySQL) |
| `DB_NAME` | Database name. Only if you use Postgres or MySQL. | `kutt` | `mydb` |
| `DB_USER` | Database user. Only if you use Postgres or MySQL. | `postgres` | `myuser` |
| `DB_PASSWORD` | Database password. Only if you use Postgres or MySQL. | - | `mypassword` |
| `DB_SSL` | Whether use SSL for the database connection. Only if you use Postgres or MySQL. | `false` | `true` |
| `DB_POOL_MIN` | Minimum number of database connection pools. Only if you use Postgres or MySQL. | `0` | `2` |
| `DB_POOL_MAX` | Maximum number of database connection pools. Only if you use Postgres or MySQL. | `10` | `5` |
| `REDIS_ENABLED` | Whether to use Redis for cache | `false` | `true` |
| `REDIS_HOST` | Redis connection host | `127.0.0.1` | `your-redis-host.com` |
| `REDIS_PORT` | Redis port | `6379` | `6379` |
| `REDIS_PASSWORD` | Redis password | - | `mypassword` |
| `REDIS_DB` | Redis database number, between 0 and 15. | `0` | `1` |
| `SERVER_IP_ADDRESS` | The IP address shown to the user on the setting's page. It's only for display purposes and has no other use. | - | `1.2.3.4` |
| `SERVER_CNAME_ADDRESS` | The subdomain shown to the user on the setting's page. It's only for display purposes and has no other use. | - | `custom.yoursite.com` |
| `CUSTOM_DOMAIN_USE_HTTPS` | Use https for links with custom domain. It's on you to generate SSL certificates for those domains manually—at least on this version for now. | `false` | `true` |
| `ENABLE_RATE_LIMIT` | Enable rate limits for authentication, link creation/editing, protected-link verification, diagnostic events and short-link resolution. Redis is used when enabled; otherwise memory is used per process. | `true` | `false` |
| `REDIRECT_COUNTDOWN_SECONDS` | Default human interstitial countdown in seconds. Zero disables the wait. | `12` | `10` |
| `REDIRECT_COUNTDOWN_MAX_SECONDS` | Maximum administrator-selectable countdown duration (hard ceiling: 30 seconds). | `30` | `20` |
| `CLICK_EVENT_RETENTION_DAYS` | Retention period for detailed link click events. Zero disables automatic cleanup. | `180` | `90` |
| `AD_EVENT_RETENTION_DAYS` | Retention period for advertising diagnostics. Zero disables automatic cleanup. | `30` | `14` |
| `MAIL_ENABLED` | Enable emails, which are used for signup, verifying or changing email address, resetting password, and sending reports. If is disabled, all these functionalities will be disabled too. | `false` | `true` | 
| `MAIL_HOST` | Email server host | - | `your-mail-server.com` |
| `MAIL_PORT` | Email server port | `587` | `465` (SSL) | 
| `MAIL_USER` | Email server user | - | `myuser` | 
| `MAIL_PASSWORD` | Email server password for the user | - | `mypassword` | 
| `MAIL_FROM` | Email address to send the user from | - | `example@yoursite.com` | 
| `MAIL_SECURE` | Whether use SSL for the email server connection | `false` | `true` | 
| `OIDC_ENABLED` | Enable OpenID Connect | `false` | `true` | 
| `OIDC_ISSUER` | OIDC issuer URL | - | `https://example.com/some/path` | 
| `OIDC_POMPT` | OIDC prompt | - | `login` | 
| `OIDC_CLIENT_ID` | OIDC client id | - | `example-app` | 
| `OIDC_CLIENT_SECRET` | OIDC client secret | - | `some-secret` | 
| `OIDC_SCOPE` | OIDC Scope | `openid profile email` | `openid email` | 
| `OIDC_EMAIL_CLAIM` | Name of the field to get user's email from | `email` | `userEmail` | 
| `OIDC_BUTTON_TEXT` | OIDC login button text | `Log in with OIDC` | `Log in via Example` | 
| `REPORT_EMAIL` | The email address that will receive submitted reports | - | `example@yoursite.com` | 
| `CONTACT_EMAIL` | The support email address to show on the app | - | `example@yoursite.com` | 

## Themes and customizations

You can add styles, change images, or render custom HTML. Place your content inside the [`/custom`](./custom) folder according to below instructions.

#### How it works:

The structure of the custom folder is like this:

```
custom/
├─ css/
│  ├─ custom1.css
│  ├─ custom2.css
│  ├─ ...
├─ images/
│  ├─ logo.png
│  ├─ favicon.ico
│  ├─ ...
├─ views/
│  ├─ partials/
│  │  ├─ footer.hbs
│  ├─ 404.hbs
│  ├─ ...
```

- **css**: Put your CSS style files here. ([View example →](https://github.com/thedevs-network/kutt-customizations/tree/main/themes/crimson/css))
  - You can put as many style files as you want: `custom1.css`, `custom2.css`, etc.
  - If you name your style file `styles.css`, it will replace Kutt's original `styles.css` file.
  - Each file will be accessible by `<your-site.com>/css/<file>.css`
- **images**: Put your images here. ([View example →](https://github.com/thedevs-network/kutt-customizations/tree/main/themes/crimson/images))
  - Name them just like the files inside the [`/static/images/`](./static/images) folder to replace Kutt's original images.
  - Each image will be accessible by `<your-site.com>/images/<image>.<image-format>`
- **views**: Custom HTML templates to render. ([View example →](https://github.com/thedevs-network/kutt-customizations/tree/main/themes/crimson/views))
  - It should follow the same file naming and folder structure as [`/server/views`](./server/views)
  - Although we try to keep the original file names unchanged, be aware that new changes on Kutt might break your custom views.
 
#### Example theme: Crimson

This is an example and official theme. Crimson includes custom styles, images, and views.

[Get Crimson theme →](https://github.com/thedevs-network/kutt-customizations/tree/main/themes/crimson)

[View list of themes and customizations →](https://github.com/thedevs-network/kutt-customizations)


| Homepage | Admin page | Login/signup |
| -------- | ---------- | ------------ |
| ![crimson-homepage](https://github.com/user-attachments/assets/b74fab78-5e80-4f57-8425-f0cc73e9c68d) | ![crimson-admin](https://github.com/user-attachments/assets/a75d2430-8074-4ce4-93ec-d8bdfd75d917) | ![crimson-login-signup ](https://github.com/user-attachments/assets/b915eb77-3d66-4407-8e5d-b556f80ff453)

#### Usage with Docker:

If you're building the image locally, then the `/custom` folder should already be included in your app.

If you're pulling the official image, make sure `/kutt/custom` volume is mounted or you have access to it. [View Docker compose example →](https://github.com/thedevs-network/kutt/blob/main/docker-compose.yml#L7)

Then, move your files to that volume. You can do it with this Docker command:

```sh
docker cp <path-to-custom-folder> <kutt-container-name>:/kutt
```

For example:

```sh
docker cp custom kutt-server-1:/kutt
```

Make sure to restart the kutt server container after copying files or making changes.

## Browser extensions

Download Kutt's extension for web browsers via below links.

- [Chrome](https://chrome.google.com/webstore/detail/kutt/pklakpjfiegjacoppcodencchehlfnpd)
- [Firefox](https://addons.mozilla.org/en-US/firefox/addon/kutt/)

## Videos

**Official videos**

- [Next.js to htmx – A Real World Example](https://www.youtube.com/watch?v=8RL4NvYZDT4)

## Integrations

- **ShareX** – You can use Kutt as your default URL shortener in [ShareX](https://getsharex.com/). If you host your custom instance of Kutt, refer to [ShareX wiki](https://github.com/thedevs-network/kutt/wiki/ShareX) on how to setup.
- **Alfred workflow** – Download Kutt's official workflow for [Alfred](https://www.alfredapp.com/) app from [alfred-kutt](https://github.com/thedevs-network/alfred-kutt) repository.
- **iOS shortcut** – [Kutt shortcut](https://www.icloud.com/shortcuts/a829856aea2c420e97c53437e68b752b) for your apple device which works from the iOS sharing context menu or on standalone mode. A courtesy of [@caneeeeee](https://github.com/caneeeeee).

**Third-party packages**


| Language        | Link                                                                              | Description                                          |
| --------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| C# (.NET)       | [KuttSharp](https://github.com/0xaryan/KuttSharp)                                 | .NET package for Kutt.to url shortener               |
| C# (.NET)       | [Kutt.NET](https://github.com/AlphaNecron/Kutt.NET)                               | C# API Wrapper for Kutt                              |
| Python          | [kutt-cli](https://github.com/RealAmirali/kutt-cli)                               | Command-line client for Kutt written in Python       |
| Ruby            | [kutt.rb](https://github.com/RealAmirali/kutt.rb)                                 | Kutt library written in Ruby                         |
| Rust            | [urlshortener](https://github.com/vityafx/urlshortener-rs)                        | URL shortener library written in Rust                |
| Rust            | [kutt-rs](https://github.com/robatipoor/kutt-rs)                                  | Command line tool written in Rust                    |
| Node.js         | [node-kutt](https://github.com/ardalanamini/node-kutt)                            | Node.js client for Kutt.to url shortener             |
| JavaScript      | [kutt-vscode](https://github.com/mehrad77/kutt-vscode)                            | Visual Studio Code extension for Kutt                |
| Java            | [kutt-desktop](https://github.com/cipher812/kutt-desktop)                         | A Cross platform Java desktop application for Kutt   |
| Go              | [kutt-go](https://github.com/raahii/kutt-go)                                      | Go client for Kutt.to url shortener                  |
| BASH            | [GitHub Gist](https://gist.github.com/hashworks/6d6e4eae8984a5018f7692a796d570b4) | Simple BASH function to access the API               |
| BASH            | [url-shortener](https://git.tim-peters.org/Tim/url-shortener)                     | Simple BASH script with GUI                          |
| Kubernetes/Helm | [ArtifactHub](https://artifacthub.io/packages/helm/christianhuth/kutt)            | A Helm Chart to install Kutt on a Kubernetes cluster |

## Contributing

Pull requests are welcome. Open a discussion for feedback, requesting features, or discussing ideas.

Special thanks to [Thomas](https://github.com/trgwii) and [Muthu](https://github.com/MKRhere). Logo design by [Muthu](https://github.com/MKRhere).

