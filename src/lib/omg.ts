import { loadEnv } from "vite";

export type OmgConfig = { url: string; repo: string; token?: string };

const DEFAULT_REPO = "notes";

/**
 * Resolve the omg connection from `.env` / process env. Shared by the content
 * loaders, the live task/diff fetchers, and the layout (which brands itself
 * with the repo slug).
 */
export function loadOmgConfig(purpose = "connect to omg"): OmgConfig {
  const env = {
    ...loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""),
    ...process.env,
  };
  const url = env.OMG_URL;
  if (!url) {
    throw new Error(
      `OMG_URL is required to ${purpose}. Set it to your omg Streamable HTTP MCP endpoint (same as \`omg … --server <url>\`).`,
    );
  }
  return {
    url,
    repo: env.OMG_REPO ?? DEFAULT_REPO,
    ...(env.OMG_TOKEN ? { token: env.OMG_TOKEN } : {}),
  };
}

/** The omg repo slug this dashboard is pointed at (e.g. `notes`, `worknotes`). */
export function omgRepoName(): string {
  return loadOmgConfig().repo;
}
