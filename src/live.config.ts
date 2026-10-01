import { defineLiveCollection } from "astro:content";
import { omgLiveLoader, type OmgLiveLoaderOptions } from "@omgbase/astro";
import { nomicShikiLanguage } from "@simplebrains/nomic-syntax";
import { loadOmgConfig } from "./lib/omg";
import { queries, type QueryKey } from "./lib/queries";

/**
 * Live collections: every page asks omg at request time, nothing is baked at
 * build. The dashboard is a live helper over the vault, not a static site.
 */
const omg = loadOmgConfig("define live collections");

const shared = {
  url: omg.url,
  repo: omg.repo,
  ...(omg.token ? { token: omg.token } : {}),
  href: ({ slug }: { slug: string }) => `/note/${slug}/`,
  markdown: { shikiConfig: { langs: [nomicShikiLanguage] } },
} satisfies Partial<OmgLiveLoaderOptions>;

/** A lean, request-time slice of docs for a home-page panel. */
function panel(key: QueryKey) {
  return defineLiveCollection({
    loader: omgLiveLoader({
      ...shared,
      query: queries[key].query,
      limit: queries[key].limit,
    }),
  });
}

export const collections = {
  recent: panel("recent"),
  projects: panel("projects"),
  tracking: panel("tracking"),
  activity: panel("activity"),
  /** Any document in the repo, addressed by slug on `/note/<slug>/`. */
  notes: defineLiveCollection({
    loader: omgLiveLoader({
      ...shared,
      query: queries.notes.query,
      limit: queries.notes.limit,
    }),
  }),
};
