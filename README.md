# Undercover Birthday Assignment Desk

A tiny Cloudflare Pages app for collecting party guests, assigning spy-theme roles with constraints, and revealing each role only through that guest's private link.

## Cloudflare setup

Deploy this as a Cloudflare Pages project, not with `wrangler deploy`.

Recommended Pages build settings:

```text
Root directory: leave blank/repository root
Build command: npm run build
Deploy command: npx wrangler pages deploy . --project-name spy-party
Build output directory: .
```

If Cloudflare is connected to a parent repository instead, set the root directory to
`undercover_identity`.

For a local Wrangler deploy, run:

```sh
npm run deploy
```

Create a KV namespace and bind it to the Pages project as:

```text
SPY_PARTY_KV
```

Add an environment variable:

```text
ADMIN_SECRET=choose-a-secret-password
```

If using Wrangler, replace the placeholder IDs in `wrangler.toml`.

## Pages

- `/` is the guest signup and reveal page.
- `/admin.html` runs the draw. It requires `ADMIN_SECRET` and does not display assignments.

Guests receive a reveal link at signup. They should save it. Before the draw, it shows a waiting message; after the draw, it reveals only their own dossier.

Late guests can still sign up after the draw. They receive an unused eligible role immediately, as long as there are suitable roles left in the pool.

The admin page can also discard the current draw, discard and redraw the existing roster, or discard the entire roster and all reveal links.

Roles are edited in `roles.csv`. The build step generates `functions/api/_roles.generated.js` from that CSV for Cloudflare Pages Functions.

## Notes on secrecy

The normal UI never shows the organizer the assignment list. Because this project owns the database and code, a project admin could technically inspect KV or change the code to peek. For maximum surprise, let a trusted non-player own the Cloudflare project or the `ADMIN_SECRET`.
