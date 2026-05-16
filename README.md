# Undercover Birthday Assignment Desk

A tiny Cloudflare Pages app for collecting party guests, assigning spy-theme roles with constraints, and revealing each role only through that guest's private link.

## Cloudflare setup

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

## Notes on secrecy

The normal UI never shows the organizer the assignment list. Because this project owns the database and code, a project admin could technically inspect KV or change the code to peek. For maximum surprise, let a trusted non-player own the Cloudflare project or the `ADMIN_SECRET`.
