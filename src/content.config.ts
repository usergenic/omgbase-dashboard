import { defineCollection, z } from "astro:content";
import { omgLoader } from "@omgbase/astro";
import { loadOmgConfig } from "./lib/omg";
import { queries } from "./lib/queries";

const shared = {
  ...loadOmgConfig("load content collections"),
  href: ({ slug }: { slug: string }) => `/note/${slug}/`,
} as const;

const noteSchema = z
  .object({
    title: z.union([z.string(), z.null()]).optional(),
    status: z.union([z.string(), z.null()]).optional(),
    layer: z.union([z.string(), z.null()]).optional(),
    type: z.union([z.string(), z.null()]).optional(),
    tracking: z.union([z.boolean(), z.null()]).optional(),
    priority: z.union([z.number(), z.null()]).optional(),
    path: z.string(),
    docId: z.string(),
    contentHash: z.string().nullable(),
    slug: z.string(),
    updatedAt: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

const recent = defineCollection({
  loader: omgLoader({
    ...shared,
    query: queries.recent.query,
    limit: queries.recent.limit,
  }),
  schema: noteSchema,
});

const projects = defineCollection({
  loader: omgLoader({
    ...shared,
    query: queries.projects.query,
    limit: queries.projects.limit,
  }),
  schema: noteSchema,
});

const tracking = defineCollection({
  loader: omgLoader({
    ...shared,
    query: queries.tracking.query,
    limit: queries.tracking.limit,
  }),
  schema: noteSchema,
});

const activity = defineCollection({
  loader: omgLoader({
    ...shared,
    query: queries.activity.query,
    limit: queries.activity.limit,
    // Activity is assignment fodder; no inter-doc href rewrite needed.
    href: false,
  }),
  schema: noteSchema,
});

/** Docs that own open tasks — ensures `/note/…` pages exist for the Tasks panel. */
const taskDocs = defineCollection({
  loader: omgLoader({
    ...shared,
    query: queries.taskDocs.query,
    limit: queries.taskDocs.limit,
  }),
  schema: noteSchema,
});

export const collections = { recent, projects, tracking, activity, taskDocs };
