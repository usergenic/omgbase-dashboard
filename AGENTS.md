## Development

Requires `OMG_URL` in `.env` (see `.env.example`) pointing at the omg Streamable HTTP MCP endpoint.

```bash
npm run dev
```

## Content

The site is `output: "server"`; every page renders at request time. Collections are Astro **live** collections defined in `src/live.config.ts` as OQX queries against the omg repo via `@omgbase/astro`'s `omgLiveLoader` (the queries themselves live in `src/lib/queries.ts`). `/note/<slug>/` resolves any document in the repo. Do not mirror vault Markdown into `src/content` and do not reintroduce build-time collections.
