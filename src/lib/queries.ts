/** Shared OQX definitions — used by content loaders and the dashboard UI. */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO cutoff frozen when this module loads (build / content sync). */
export const ACTIVITY_CUTOFF = new Date(Date.now() - MS_PER_DAY).toISOString();

export const ACTIVITY_LIMIT_PER_PROJECT = 10;

export const queries = {
  recent: {
    query: `select $path, $title, $updated_at from docs where !$path.startsWith("scratch/") order by $updated_at desc`,
    limit: 40,
  },
  projects: {
    query: `select $path, $title, $updated_at, status, priority from docs where type == "/terms/types/project.md"`,
    limit: 200,
  },
  tracking: {
    query: `select $path, $title, $updated_at from docs where tracking == true order by $updated_at desc`,
    limit: 50,
  },
  /**
   * Last 24h of edits with outbound link targets. The dashboard assigns these
   * to project cards via hub backlinks + `projects/<slug>/` namespace.
   */
  activity: {
    query: `select $path, $title, $updated_at, outs: doc.out collect { select $path } from docs where $updated_at > "${ACTIVITY_CUTOFF}" && !$path.startsWith("scratch/") order by $updated_at desc`,
    limit: 300,
  },
  /**
   * Docs that own at least one GFM task — so detail pages exist for the
   * Tasks panel links.
   */
  taskDocs: {
    query: `select $path, $title, $updated_at from docs where !$path.startsWith("scratch/") && blocks exists { where type == "task" } order by $updated_at desc`,
    limit: 200,
  },
  /**
   * Docs that own tasks — membership signals for assigning tasks to project
   * cards (namespace / `project` frontmatter / outbound links).
   */
  taskDocMeta: {
    query: `select $path, project, outs: doc.out collect { select $path } from docs where !$path.startsWith("scratch/") && blocks exists { where type == "task" }`,
    limit: 300,
  },
  /**
   * All task blocks (`- [ ]` / `- [x]`). Fetched at request time — see
   * `fetchTasks` in `lib/tasks.ts`.
   */
  tasks: {
    query: `select $path, text, checked, $ordinal, title: doc.$title, updated: doc.$updated_at, headings: section collect { select name } from blocks where type == "task" && !$path.startsWith("scratch/") order by doc.$updated_at desc, $path asc, $ordinal asc`,
    limit: 2000,
  },
} as const;

/**
 * Task blocks owned by a single doc — pairs `/note/…` body checkboxes with
 * block ids for write-back. See `bindTaskCheckboxes` in `lib/note-tasks.ts`.
 * Kept outside `queries` because it is parameterized.
 */
export const docTasksQuery = {
  query: (path: string) =>
    `select $path, text, checked from blocks where type == "task" && $path == ${JSON.stringify(path)}`,
  limit: 500,
} as const;

export type QueryKey = keyof typeof queries;

export function formatQuerySource(key: QueryKey): string {
  const { query, limit } = queries[key];
  return `${query}\nlimit ${limit}`;
}

/** Combined query label for the Projects panel (hubs + activity + tasks). */
export function formatProjectsPanelQuery(): string {
  return [
    "# projects",
    formatQuerySource("projects"),
    "",
    "# activity (last 24h; assigned via hub backlinks + projects/<slug>/)",
    formatQuerySource("activity"),
    "",
    "# tasks assigned via hub path ∪ projects/<slug>/ ∪ project: fm ∪ doc.out→hub",
    formatQuerySource("tasks"),
    formatQuerySource("taskDocMeta"),
  ].join("\n");
}

/** Combined query label for the Tasks panel (blocks + docs that own them). */
export function formatTasksPanelQuery(): string {
  return [
    "# task blocks (open + completed)",
    formatQuerySource("tasks"),
    "",
    "# docs with tasks (detail pages)",
    formatQuerySource("taskDocs"),
  ].join("\n");
}

/** Hub `projects/oqx.md` → namespace prefix `projects/oqx/`. */
export function projectNamespacePrefix(hubPath: string): string {
  return hubPath.replace(/\.md$/i, "/") ;
}
