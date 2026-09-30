# Notes dashboard

Local Astro site that queries your omgbase **notes** repo over Streamable HTTP MCP via [`@omgbase/astro`](https://github.com/omgbase/astro).

## Setup

```bash
cp .env.example .env
# set OMG_URL to your omg MCP endpoint
npm install
npm run dev
```

`OMG_URL` is required. It should be the same Streamable HTTP MCP URL you use with Cursor’s omg-ph integration (or `omg … --server <url>`).

Optional: `OMG_REPO` (default `notes`), `OMG_TOKEN` (bearer).

## What it shows

| Collection / panel | OQX |
| --- | --- |
| Recent | docs ordered by `$updated_at` (excludes `scratch/`) |
| Projects | `type == "/terms/types/project.md"`, grouped by `status` |
| Tracking | `tracking == true` |
| Tasks | `from blocks where type == "task"`, open + completed (collapsed) trees, docs newest-first; clickable checkboxes write back via `tasks_complete`. Open tasks also nest under each **Projects** card when the owning note is the hub, under `projects/<slug>/`, has `project:` frontmatter, or links to the hub. |
| Task docs | docs that own tasks (so `/note/…` detail links resolve) |

Detail pages render Markdown for any note loaded into those collections. In `astro dev`, the remote loader polls `changes_since` so edits show up without a restart.
