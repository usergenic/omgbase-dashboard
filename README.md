# Notes dashboard

Local Astro site that queries an omgbase repo over Streamable HTTP MCP via [`@omgbase/astro`](https://github.com/omgbase/astro). It is a live helper, not a static site: `output: "server"`, and every panel and note is an Astro **live collection** fetched from omg on each request.

## Setup

```bash
cp .env.example .env
# set OMG_URL to your omg MCP endpoint
npm install
npm run dev
```

`OMG_URL` is required. It should be the same Streamable HTTP MCP URL you use with Cursor’s omg-ph integration (or `omg … --server <url>`).

Optional: `OMG_REPO` (default `notes`; also the header brand), `OMG_TOKEN` (bearer).

## What it shows

| Collection / panel | OQX |
| --- | --- |
| Recent | docs ordered by `$updated_at` (excludes `scratch/`) |
| Projects | `type == "/terms/types/project.md"`, grouped by `status` |
| Tracking | `tracking == true` |
| Tasks | `from blocks where type == "task"`, open + completed (collapsed) trees, docs newest-first; clickable checkboxes write back via `tasks_complete`. Open tasks also nest under each **Projects** card when the owning note is the hub, under `projects/<slug>/`, has `project:` frontmatter, or links to the hub. |

The home page keeps itself current: a small script polls `/api/head` (the repo's commit seq, one tiny MCP call) every 3 s and, when it moves, refetches each panel as an HTML partial (`/partials/<panel>`) and swaps it in inside a same-document View Transition — items that moved glide to their new place, new items slide in at the top, removed ones fade. Expanded `<details>` stay expanded across swaps. Without the View Transitions API (or under `prefers-reduced-motion`) the swap is instant.

`/note/<slug>/` renders any document in the repo (slug = path without `.md`), fetched and rendered at request time; links omg resolved to other documents point at their `/note/…/` pages, GFM checkboxes write back via `tasks_complete`. Reload a page to see the vault's latest state; there is no build step to invalidate.
