## Development

Requires `OMG_URL` in `.env` (see `.env.example`) pointing at the omg Streamable HTTP MCP endpoint.

```bash
npm run dev
```

## Content

Collections are defined in `src/content.config.ts` as OQX queries against the notes repo via `@omgbase/astro`. Do not mirror vault Markdown into `src/content`.
