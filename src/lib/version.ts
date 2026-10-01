import { connectHttpEngine } from "@omgbase/sync";
import { loadOmgConfig } from "./omg";

/** The MCP `version` tool's answer (see omgbase spec/surface §4). */
export type OmgVersion = {
  engine?: string;
  version?: string;
  components?: Record<string, string>;
  specs?: Record<string, string>;
  schema?: number | string;
  mcp?: { protocol?: string; sdk?: string };
  runtime?: string;
  commit?: string | null;
  built?: string | null;
};

const TTL_MS = 60_000;
let cached: { at: number; value: OmgVersion | null } | null = null;

/**
 * Which omg engine the dashboard is talking to. Cached briefly so the header
 * does not cost an MCP round trip on every page; `null` when unreachable.
 */
export async function fetchVersion(): Promise<OmgVersion | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value: OmgVersion | null = null;
  try {
    const { url, token } = loadOmgConfig("read the server version");
    const client = await connectHttpEngine({
      url,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    try {
      value = (await client.callTool<OmgVersion>("version", {})) ?? null;
    } finally {
      await client.close();
    }
  } catch {
    value = null;
  }
  cached = { at: Date.now(), value };
  return value;
}
