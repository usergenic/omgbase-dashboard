import { connectHttpEngine } from "@omgbase/sync";
import { loadEnv } from "vite";

export type DiffExcerpt = {
  from: string;
  to: string;
  excerpt: string;
  truncated: boolean;
};

const DEFAULT_MAX_LINES = 16;
const CONCURRENCY = 6;

function loadOmgConfig(): { url: string; repo: string; token?: string } {
  const env = {
    ...loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""),
    ...process.env,
  };
  const url = env.OMG_URL;
  if (!url) {
    throw new Error("OMG_URL is required to fetch diffs");
  }
  return {
    url,
    repo: env.OMG_REPO ?? "notes",
    ...(env.OMG_TOKEN ? { token: env.OMG_TOKEN } : {}),
  };
}

/** Trim a unified diff to a short preview for the recent list. */
export function excerptUnifiedDiff(
  diff: string,
  maxLines = DEFAULT_MAX_LINES,
): { excerpt: string; truncated: boolean } {
  const allLines = collapseDuplicateSignedLines(diff).replace(/\s+$/, "").split("\n");
  if (allLines.length <= maxLines) {
    return { excerpt: allLines.join("\n"), truncated: false };
  }
  return {
    excerpt: [...allLines.slice(0, maxLines), "…"].join("\n"),
    truncated: true,
  };
}

/**
 * `diff_unified` sometimes repeats the same +/- line across multiple hunks
 * (seen on long journal docs). Keep the first occurrence and drop hunks that
 * no longer contain any unique signed change.
 */
export function collapseDuplicateSignedLines(diff: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let hunk: string[] = [];
  let hunkHasUnique = false;

  const flush = () => {
    if (hunk.length === 0) return;
    if (hunkHasUnique) out.push(...hunk);
    hunk = [];
    hunkHasUnique = false;
  };

  for (const line of diff.replace(/\s+$/, "").split("\n")) {
    if (line.startsWith("@@")) {
      flush();
      hunk = [line];
      continue;
    }

    const signed =
      line.startsWith("+") || (line.startsWith("-") && !line.startsWith("---"));
    if (signed) {
      if (seen.has(line)) continue;
      seen.add(line);
      hunkHasUnique = true;
      hunk.push(line);
      continue;
    }

    hunk.push(line);
  }
  flush();
  return out.join("\n");
}

type DiffToolResult = {
  doc?: string;
  path?: string;
  from?: string;
  to?: string;
  diff?: string;
};

/**
 * Fetch previous→current unified diffs for docs (MCP `diff_unified`).
 * Returns a map keyed by doc id; missing entries had no prior revision or failed.
 */
export async function fetchDiffExcerpts(
  docIds: string[],
  opts?: { maxLines?: number; concurrency?: number },
): Promise<Map<string, DiffExcerpt>> {
  const maxLines = opts?.maxLines ?? DEFAULT_MAX_LINES;
  const concurrency = opts?.concurrency ?? CONCURRENCY;
  const { url, repo, token } = loadOmgConfig();
  const client = await connectHttpEngine({
    url,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });

  const out = new Map<string, DiffExcerpt>();

  try {
    let i = 0;
    async function worker() {
      while (i < docIds.length) {
        const idx = i++;
        const doc = docIds[idx]!;
        try {
          const result = await client.callTool<DiffToolResult>("diff_unified", {
            doc,
            repo,
          });
          const raw = typeof result.diff === "string" ? result.diff.trim() : "";
          if (!raw) continue;
          const { excerpt, truncated } = excerptUnifiedDiff(raw, maxLines);
          out.set(doc, {
            from: typeof result.from === "string" ? result.from : "",
            to: typeof result.to === "string" ? result.to : "",
            excerpt,
            truncated,
          });
        } catch {
          // First revision or tool error — skip quietly.
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(docIds.length, 1)) }, () =>
        worker(),
      ),
    );
  } finally {
    await client.close();
  }

  return out;
}
