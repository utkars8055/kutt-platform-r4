# Kutt URL Shortener — Build Handoff

Build marker: `2026.11.04-r4-one-command-installer`  
Base: uploaded upstream Kutt `3.2.6`, commit `029da42b2459693681886665589fd9512d6b473c`  
License: MIT (upstream license and copyright notices retained)

## Source and deployment assumptions

This build is based on the user's uploaded `kutt-main.zip`. The archive did not contain `.git`, a production `.env`, a deployed database, or custom deployment overrides. Do not assume the archive exactly matches any running deployment. Back up production database and files before deploying. Never replace a production database with a development database.

Runtime: Node.js 24+. The locked `geoip-lite@2.0.2` package declares Node >=24. The editing environment has Node 22.16.0, below the required runtime. Two `npm ci` attempts did not complete: the first ended with registry DNS `EAI_AGAIN`, and the resumed attempt timed out. `node_modules` is incomplete and is not part of the deliverable. Docker base image is `node:24-alpine`.

Stack: Express 4, Knex, Handlebars/HTMX. Existing SQLite, PostgreSQL and MySQL dependencies are retained. Run `npm run migrate` before starting the app.

## Implemented in source

### Preserved Kutt capabilities

- Existing account registration/login, admin role, REST API and user administration.
- Existing link creation, edit/delete, custom aliases and custom domains.
- Existing password protection, expiration, QR code generation, and aggregated analytics.
- Existing domain, host and link moderation.

### Security and correctness layer

- Strict HTTP/HTTPS-only validation for new destinations and external preview URLs. Rejects dangerous schemes, malformed URLs, embedded credentials and localhost hostnames.
- Runtime validation of stored targets at resolution, so legacy entries with unsupported schemes are not redirected after upgrade.
- Redis link cache invalidation on every link update, including destination, password, alias/domain and moderation fields.
- Correct HTTP `Referer` header spelling for referrer analytics.
- Rate limiting defaults to enabled. Added limits for link creation/editing, protected-link password attempts and short-link resolution. The short-link limit is 6,000 GET requests/IP/minute across all aliases; crawler User-Agents do not bypass this rate limit.
- `TRUST_PROXY` defaults to `false`; explicitly set it to `true` only behind a trusted reverse proxy that overwrites forwarded headers.

### Social previews

- New external image and video preview URLs, preview title, description, image alt text and video MIME type.
- Preview metadata is stored separately in `link_previews`; canonical destination remains `links.target`.
- Server-rendered Open Graph and X/Twitter metadata is returned as initial HTML for recognised social crawlers.
- Recognised crawler requests do not see the human interstitial or ads. Password-protected links never disclose preview metadata.
- Per-link social preview enable/disable setting is available in create/edit forms.
- Preview tester page: `/preview/<link-uuid>`.
- No image/video download, host, proxy, resize, stream or media-player implementation.

### Human redirect/interstitial

- Browser HTML short-link requests show a responsive waiting page.
- Default countdown is 12 seconds; administrator can set 0–30 seconds and define a maximum up to the hard ceiling of 30 seconds.
- At zero, Get Link becomes enabled. Only a user click navigates with `window.location.assign()` to the saved `links.target`; there is no automatic redirect.
- An explicit JavaScript-disabled fallback link is present; the fallback bypasses the waiting period rather than leaving the visitor stuck.
- Ad availability, ad blockers, script failures, and popup restrictions do not control countdown completion.
- HEAD requests do not consume click limits or create visit events. Non-HTML/API requests retain Kutt's direct redirect semantics.
- Existing password-protected browser links retain their password gate, then return to the short URL so the interstitial is displayed after successful authorization.
- Per-link optional click limits are atomically enforced in `link_settings`.

### Advertising and administration

- Admin page: `/advertising`.
- Admin API: `GET/PUT /api/settings/ads`.
- Waiting-page preview: `/advertising-preview`.
- Formats: Vignette Banner, OnClick/Popunder, In-Page Push, Banner, Direct Link and Custom HTML.
- Vignette is the recommended primary format, but it is not pre-enabled without a publisher's actual zone tag.
- Per-format enable/disable, code/zone, placement and label/destination settings.
- Code placements can be in head/top/middle/bottom; same exact code and duplicate enabled zone IDs are rejected to reduce accidental duplicate installation. Ad tags are held in inert HTML templates, then activated dynamically only after the countdown has initialized, so a blocking third-party script cannot stall the timer/page parser.
- Direct Link appears as an independent sponsored element and is never the Get Link destination.
- Custom HTML is displayed in an iframe sandbox without `allow-same-origin` or top-navigation permissions.
- Admin-provided provider scripts for Monetag are inserted into the interstitial page as trusted third-party code; configure only official/trusted provider tags.
- Ad diagnostic endpoint accepts only `page_loaded`, `script_load_error` and `popup_blocked`; the page reports placement presence (`page_loaded`) and external script load failures (`script_load_error`). It does not record impressions or completed views, and the timer does not create ad events.

### Analytics and UTM

- Detailed human/crawler event records are stored separately from Kutt's existing hourly aggregates. New detailed records do not store raw visitor IP addresses.
- Incoming `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` query parameters on the short URL are captured. They are not appended to or used to mutate `links.target`.
- Click-history page: `/link/<link-uuid>/history`.
- Click-history API: `GET /api/links/<link-uuid>/click-history?limit=100&offset=0`.
- Existing aggregate Kutt statistics remain intact.

## New important files

- `BUILD_VERSION.txt`
- `server/utils/http-url.js`
- `server/utils/crawler.js`
- `server/utils/redirect-config.js`
- `server/migrations/202611040001_platform_features.js`
- `server/queries/preview.queries.js`
- `server/queries/link-settings.queries.js`
- `server/queries/event.queries.js`
- `server/services/platform-settings.js`
- `server/routes/settings.routes.js`
- `server/views/interstitial.hbs`
- `server/views/social_preview.hbs`
- `server/views/preview_test.hbs`
- `server/views/link_click_history.hbs`
- `server/views/link_limit.hbs`
- `server/views/link_invalid.hbs`
- `server/views/advertising.hbs`
- `static/scripts/click-history.js`
- `tests/template-invariants.test.js`
- `static/css/redirect.css`
- `static/scripts/ads-admin.js`
- `static/scripts/click-history.js`
- `tests/url-validation.test.js`
- `tests/redirect-config.test.js`

## Database migration

Migration `202611040001_platform_features.js` is additive. It creates:

- `link_previews`
- `link_settings`
- `platform_settings`
- `ad_placements`
- `link_click_events`
- `ad_events`

Existing Kutt `users`, `links`, `domains`, `visits`, and other tables are not recreated. New link preview URLs are independent external URL values. Do not manually run `down` on a live installation because it removes these new feature tables and their data.

## Tests and verification actually performed

- `node --check` passed for every JavaScript file under `server`, `static/scripts` and `tests` using Node 22.16.0.
- `node --test tests/*.test.js`: 12 tests passed, 0 failed. Tests cover HTTP/HTTPS acceptance, rejection of unsupported schemes/credentials/localhost/oversized URLs, countdown defaults and bounds, social crawler recognition, and redirect/preview template invariants.
- Repository source files and migration definitions were inspected.
- Full `npm ci` was not possible because package tarball downloads failed with `EAI_AGAIN`; `express`, `knex`, `hbs` and the other application dependencies were therefore not installed.
- The app was not started. Migration up/down was not executed. No browser, Redis, PostgreSQL, MySQL, Telegram, WhatsApp, Facebook or X integration test was run.
- The build is not yet certified as production-ready. Syntax and focused unit tests do not replace integration tests.

## Required next steps before production

1. Use Node.js 24+, then run `npm ci` in an environment with npm registry access.
2. Run `npm test`.
3. Test `npm run migrate` against a new SQLite database and then a copy of the existing production database. Test PostgreSQL if that is the chosen production database. Verify foreign-key cascade and rollback behaviour on test copies.
4. Start the application and create a new admin account in a test environment.
5. Test browser redirects at 0, 5, 8, 10, 12, 15, 20, 25 and 30 seconds; verify zero enables Get Link immediately; ensure the destination is reached only after a user click.
6. Verify old links with an unsupported stored scheme are blocked safely.
7. Test password-protected links and click-limit concurrency.
8. Test Redis cache invalidation after changing target, password, alias, expiry, ban status and domain; test multiple application instances.
9. Configure real Monetag tags in `/advertising`. Keep every format disabled until its actual publisher code is supplied. Test one format at a time on desktop/mobile with and without ad blockers.
10. Verify no duplicated scripts, popunder loops, hidden Get Link button or blocked destination when ads fail. Confirm there are no ad impression/completed-view records generated by countdown completion.
11. Test crawler GET and HEAD responses for Telegram, WhatsApp, Facebook, X, Discord, Slack and LinkedIn using platform debugging tools. Verify the initial HTML contains metadata and is not the human waiting page.
12. Set `TRUST_PROXY` correctly; enable Redis for shared rate limits on multi-instance deployments; configure database backups and event-retention policy.
13. Confirm real custom-domain TLS provisioning; the upstream Kutt version still relies on manual certificate provisioning for custom domains.

## Known remaining gaps

- Installation, database migrations and browser integration have not been run in this environment: npm dependency installation timed out and the available runtime is Node 22 rather than the required Node 24.
- The deployment must provide actual Monetag account zone tags; zone IDs alone do not generate working provider code.
- Only one placement per advertising format is supported at present.
- The detailed click-history page is paginated (50 rows per page) and supports navigation through the full retained history.
- No UTM builder UI, tracking-pixel integration, link-edit audit history, event-retention UI, abuse-report queue, or advanced admin analytics dashboard has been added yet.
- Click records are stored per request. `CLICK_EVENT_RETENTION_DAYS` defaults to 180 and `AD_EVENT_RETENTION_DAYS` defaults to 30; bounded batches of up to 10,000 old records per table are pruned hourly. High-volume deployments should monitor database growth and may need partitioning.
- Custom Monetag tags execute as trusted third-party scripts on the interstitial. Custom administrator HTML is isolated in a sandboxed iframe. Only use trusted official provider tags.
- Crawler recognition relies on user-agent strings and should be maintained; user-agent identity is not cryptographic proof of crawler ownership.
- Social networks cache previews independently; metadata edits do not guarantee immediate re-scraping.

## Product invariants — never change

1. `links.target` is the authoritative final destination.
2. Preview image and video URLs remain independent external URLs; do not host or proxy media.
3. The countdown is an ad-loading opportunity, not ad verification.
4. At zero, enable Get Link; do not auto-redirect.
5. The main Get Link action navigates only to the original destination supplied by the link owner.
6. Ad inventory, blockers or provider failure must never prevent continuing.
7. Social crawlers receive server-rendered metadata without the human ad interstitial.
8. Password protection, link ownership, expiration, custom domains and existing Kutt functionality must remain intact.


### Resume review additions (R2)

- Click-limit enforcement reads the current link setting directly from the database and uses one conditional `UPDATE` (`click_count < click_limit`) so concurrent requests cannot all consume the last allowed click.
- Redirect rate limiting no longer exempts arbitrary bot-like User-Agent values. Social crawler recognition remains User-Agent-based and must not be treated as cryptographic identity.
- `TRUST_PROXY` now defaults to `false`. Configure it explicitly for the actual trusted reverse-proxy topology.
- Social preview template includes service name plus Open Graph image/video metadata. X/Twitter metadata is supplied, but inline video playback is not promised.
- Click-history UI now paginates through all retained entries (50 per page).
- Detailed click and ad diagnostic event cleanup is configurable and bounded to a maximum batch of 10,000 rows per table per hourly run.
- Third-party ad tags are emitted inside inert `<template>` elements and dynamically activated only after the timer is initialized; external scripts are non-parser-blocking and load failures are recorded as diagnostics only.
- Open Graph `secure_url` fields are emitted only when the corresponding supplied asset URL actually uses HTTPS.
- Additional template tests assert that the button starts disabled, the timer is independent of ad status, destination navigation is click-triggered, ad code cannot block parser startup, and crawler metadata is rendered without client-side scripts.

### Current verification

- `node --test tests/*.test.js`: 12 tests passed, 0 failed (Node 22.16.0; tests use Node built-ins and pure local modules).
- `node --check` passes for all JavaScript files under `server`, `static/scripts` and `tests`.
- `npm ci --no-audit --no-fund` was attempted again during resume but timed out. `node_modules` is incomplete; `npm ls` reports invalid/extraneous packages and direct `require()` of `express`, `knex`, `hbs`, `isbot` and `better-sqlite3` fails.
- No application server start, migration execution, SQL integration test, Redis test, browser test or real Monetag test has been run.


### Final packaging update (R3)

- Build marker updated to `2026.11.04-r4-one-command-installer`.
- Advertising settings reject non-string safety messages, trim stored zone IDs/destinations/labels, and the public diagnostic endpoint requires a canonical UUID-shaped link reference.
- Ad tag markup is inert during HTML parsing. The inline timer initializes first; the browser then creates active script elements dynamically, so slow external tags do not block the main document parser or countdown initialization. External script load errors are diagnostic-only.
- Open Graph `og:image:secure_url` and `og:video:secure_url` are included only when the supplied URL uses HTTPS.
- Final unit suite: 12 passing tests. Full dependency installation and application/database/browser integration remain unverified for the reasons recorded above.
