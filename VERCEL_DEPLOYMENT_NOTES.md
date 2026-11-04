# Vercel deployment adaptation

This package preserves the regular Node server for BotKeep/VPS and adds a Vercel serverless Express entry point at `api/index.js`.

- Vercel uses Neon PostgreSQL (`POSTGRES_URL`, with `DATABASE_URL` fallback).
- Local/BotKeep deployments retain the existing SQLite default unless `DB_CLIENT` is set.
- Vercel Functions do not start the in-process cron timers. Scheduled cleanup still needs a Vercel Cron endpoint or a separate always-on worker before relying on automatic cleanup.
- Configure `JWT_SECRET` to a long random secret before opening registrations.
- Configure `DEFAULT_DOMAIN` to the actual production host.
- Mail, OIDC, Redis, custom domains, and ad providers require their own credentials/settings.

The deployment build command should run `npm run migrate` against the Neon database. Do not run migrations from every serverless request.
