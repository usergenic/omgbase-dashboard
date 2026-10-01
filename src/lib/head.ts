import { createRemoteTransport, type RemoteTransport } from "@omgbase/astro";
import { loadOmgConfig } from "./omg";

let transport: RemoteTransport | null = null;

/**
 * The repo's current commit sequence — the same number the Astro loader polls
 * via `changes_since`. One long-lived transport (it reconnects on a lost
 * session), so the home page's poll is one tiny MCP call per tick.
 */
export async function fetchHead(): Promise<number> {
  if (!transport) {
    const { url, repo, token } = loadOmgConfig("poll the change feed");
    transport = createRemoteTransport({ url, repo, ...(token ? { token } : {}) });
  }
  const page = await transport.changesSince({ cursor: Number.MAX_SAFE_INTEGER });
  return page.head;
}
