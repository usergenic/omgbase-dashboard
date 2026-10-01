import type { APIRoute } from "astro";
import { fetchHead } from "../../lib/head";

/** `{ head }`: the repo's commit seq. The live-feed script polls this. */
export const GET: APIRoute = async () => {
  try {
    const head = await fetchHead();
    return Response.json({ head }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "head_failed";
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
};
