import { connectHttpEngine } from "@omgbase/sync";
import { loadOmgConfig } from "./omg";
import { docTasksQuery, projectNamespacePrefix, queries } from "./queries";
import type { TaskBlock } from "./note-tasks";

export type TaskItem = {
  id: string;
  text: string;
  checked: boolean;
  /** Immediate enclosing section, when distinct from the doc title. */
  section?: string;
};

export type TaskDocGroup = {
  path: string;
  title: string;
  slug: string;
  updatedAt?: string;
  /** Outbound doc links from this note (for project backlink assignment). */
  outs?: string[];
  /** Frontmatter `project` path, when present. */
  project?: string;
  tasks: TaskItem[];
};

export type TaskBucket = {
  groups: TaskDocGroup[];
  total: number;
};

export type TasksResult = {
  open: TaskBucket;
  completed: TaskBucket;
  truncated: boolean;
};

function pathToSlug(path: string): string {
  return path.replace(/\.md$/i, "");
}

/** Strip a leading slash so `/projects/x.md` and `projects/x.md` match. */
export function normalizeVaultPath(path: string): string {
  return path.replace(/^\//, "");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function headingNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (item && typeof item === "object") {
      const name = (item as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) names.push(name);
    } else if (typeof item === "string" && item.length > 0) {
      names.push(item);
    }
  }
  return names;
}

function pathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const item of value) {
    if (item && typeof item === "object") {
      const path =
        (item as { $path?: unknown; path?: unknown }).$path ??
        (item as { path?: unknown }).path;
      if (typeof path === "string") paths.push(normalizeVaultPath(path));
    } else if (typeof item === "string") {
      paths.push(normalizeVaultPath(item));
    }
  }
  return paths;
}

/** Prefer the innermost section that isn't just the document title. */
export function sectionForTask(
  headings: string[],
  title: string,
): string | undefined {
  for (let i = headings.length - 1; i >= 0; i--) {
    const name = headings[i]!;
    if (name !== title) return name;
  }
  return undefined;
}

type TaskHit = {
  id?: unknown;
  path?: unknown;
  $path?: unknown;
  text?: unknown;
  checked?: unknown;
  $ordinal?: unknown;
  title?: unknown;
  updated?: unknown;
  headings?: unknown;
};

type MetaHit = {
  path?: unknown;
  $path?: unknown;
  project?: unknown;
  outs?: unknown;
};

function groupHits(hits: TaskHit[]): TaskBucket {
  const byPath = new Map<string, TaskDocGroup>();

  for (const hit of hits) {
    const path = asString(hit.path) ?? asString(hit.$path);
    const text = asString(hit.text);
    const id = asString(hit.id);
    if (!path || !text || !id) continue;

    const title =
      asString(hit.title) ?? path.replace(/\.md$/i, "").split("/").pop()!;
    const updatedAt = asString(hit.updated);
    let group = byPath.get(path);
    if (!group) {
      group = {
        path,
        title,
        slug: pathToSlug(path),
        updatedAt,
        tasks: [],
      };
      byPath.set(path, group);
    } else if (updatedAt && (!group.updatedAt || updatedAt > group.updatedAt)) {
      group.updatedAt = updatedAt;
    }

    const section = sectionForTask(headingNames(hit.headings), group.title);
    group.tasks.push({
      id,
      text,
      checked: asBool(hit.checked),
      ...(section ? { section } : {}),
    });
  }

  const groups = [...byPath.values()].sort((a, b) => {
    const ua = a.updatedAt ?? "";
    const ub = b.updatedAt ?? "";
    if (ua !== ub) return ub.localeCompare(ua);
    return a.path.localeCompare(b.path);
  });

  return {
    groups,
    total: hits.length,
  };
}

function applyMeta(groups: TaskDocGroup[], metaHits: MetaHit[]): void {
  const byPath = new Map<string, { outs: string[]; project?: string }>();
  for (const hit of metaHits) {
    const path = asString(hit.path) ?? asString(hit.$path);
    if (!path) continue;
    const project = asString(hit.project);
    byPath.set(path, {
      outs: pathList(hit.outs),
      ...(project ? { project: normalizeVaultPath(project) } : {}),
    });
  }
  for (const group of groups) {
    const meta = byPath.get(group.path);
    if (!meta) continue;
    group.outs = meta.outs;
    if (meta.project) group.project = meta.project;
  }
}

/**
 * Whether a task-owning doc belongs to a project hub: the hub itself, under
 * `projects/<slug>/`, frontmatter `project:`, or an outbound link to the hub.
 */
export function docBelongsToProject(
  group: Pick<TaskDocGroup, "path" | "outs" | "project">,
  hubPath: string,
): boolean {
  const hub = normalizeVaultPath(hubPath);
  if (group.path === hub) return true;
  if (group.path.startsWith(projectNamespacePrefix(hub))) return true;
  if (group.project && normalizeVaultPath(group.project) === hub) return true;
  if (group.outs?.some((o) => normalizeVaultPath(o) === hub)) return true;
  return false;
}

/**
 * Open-task doc groups assigned to a project hub (newest source docs first).
 */
export function tasksForProject(
  hubPath: string,
  openGroups: TaskDocGroup[],
): TaskDocGroup[] {
  return openGroups.filter((g) => docBelongsToProject(g, hubPath));
}

/**
 * Fetch all GFM task blocks via MCP `query`, split into open / completed
 * buckets, each grouped by owning document (newest docs first).
 */
export async function fetchTasks(): Promise<TasksResult> {
  const { url, repo, token } = loadOmgConfig("fetch tasks");
  const client = await connectHttpEngine({
    url,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });

  try {
    const [result, meta] = await Promise.all([
      client.callTool<{
        hits?: TaskHit[];
        truncated?: boolean;
      }>("query", {
        query: queries.tasks.query,
        limit: queries.tasks.limit,
        repo,
      }),
      client.callTool<{
        hits?: MetaHit[];
      }>("query", {
        query: queries.taskDocMeta.query,
        limit: queries.taskDocMeta.limit,
        repo,
      }),
    ]);

    const hits = result.hits ?? [];
    const openHits: TaskHit[] = [];
    const completedHits: TaskHit[] = [];
    for (const hit of hits) {
      if (asBool(hit.checked)) completedHits.push(hit);
      else openHits.push(hit);
    }

    const open = groupHits(openHits);
    const completed = groupHits(completedHits);
    applyMeta(open.groups, meta.hits ?? []);
    applyMeta(completed.groups, meta.hits ?? []);

    return {
      open,
      completed,
      truncated: Boolean(result.truncated),
    };
  } finally {
    await client.close();
  }
}

/** Task blocks owned by one doc, in the order the server returns them. */
export async function fetchDocTasks(path: string): Promise<TaskBlock[]> {
  const { url, repo, token } = loadOmgConfig("fetch tasks");
  const client = await connectHttpEngine({
    url,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  try {
    const result = await client.callTool<{ hits?: TaskHit[] }>("query", {
      query: docTasksQuery.query(normalizeVaultPath(path)),
      limit: docTasksQuery.limit,
      repo,
    });
    const blocks: TaskBlock[] = [];
    for (const hit of result.hits ?? []) {
      const id = asString(hit.id);
      const text = asString(hit.text);
      if (!id || text === undefined) continue;
      blocks.push({ id, text, checked: asBool(hit.checked) });
    }
    return blocks;
  } finally {
    await client.close();
  }
}

/** Check or uncheck task blocks via MCP `tasks_complete`. */
export async function completeTasks(
  blocks: string[],
  checked = true,
): Promise<void> {
  if (blocks.length === 0) return;
  const { url, repo, token } = loadOmgConfig("fetch tasks");
  const client = await connectHttpEngine({
    url,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  try {
    await client.callTool("tasks_complete", { blocks, checked, repo });
  } finally {
    await client.close();
  }
}

/** Collapse consecutive same-section tasks for nested rendering. */
export function sectionRuns(
  tasks: TaskItem[],
): Array<{ section?: string; tasks: TaskItem[] }> {
  const runs: Array<{ section?: string; tasks: TaskItem[] }> = [];
  for (const task of tasks) {
    const last = runs[runs.length - 1];
    if (last && last.section === task.section) {
      last.tasks.push(task);
    } else {
      runs.push({ section: task.section, tasks: [task] });
    }
  }
  return runs;
}
