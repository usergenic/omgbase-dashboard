import type { APIRoute } from "astro";
import { completeTasks } from "../../../lib/tasks";

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const { blocks, checked } = body as {
    blocks?: unknown;
    checked?: unknown;
  };

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return Response.json({ error: "blocks_required" }, { status: 400 });
  }
  if (!blocks.every((b) => typeof b === "string" && b.length > 0)) {
    return Response.json({ error: "invalid_blocks" }, { status: 400 });
  }
  if (typeof checked !== "boolean") {
    return Response.json({ error: "checked_required" }, { status: 400 });
  }

  try {
    await completeTasks(blocks, checked);
    return Response.json({ ok: true, blocks, checked });
  } catch (err) {
    const message = err instanceof Error ? err.message : "tasks_complete_failed";
    return Response.json({ error: message }, { status: 502 });
  }
};
