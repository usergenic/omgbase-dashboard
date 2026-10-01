import { getLiveCollection } from "astro:content";
import { fetchDiffExcerpts, type DiffExcerpt } from "./diffs";
import {
  noteTitle,
  noteUpdatedAt,
  projectPriorityRank,
  projectStatusRank,
  type NoteData,
} from "./notes";
import { fetchTasks, type TaskDocGroup, type TasksResult } from "./tasks";

export type LiveNote = { id: string; data: NoteData };

type LiveResult = {
  entries?: Array<{ id: string; data: Record<string, unknown> }>;
  error?: Error;
};

const EMPTY_TASKS: TasksResult = {
  open: { groups: [], total: 0 },
  completed: { groups: [], total: 0 },
  truncated: false,
};

function entriesOf(res: LiveResult): LiveNote[] {
  return (res.entries ?? []).map((e) => ({ id: e.id, data: e.data as NoteData }));
}

const byUpdatedDesc = (a: LiveNote, b: LiveNote) =>
  String(noteUpdatedAt(b.data) ?? "").localeCompare(String(noteUpdatedAt(a.data) ?? ""));

export type RecentFeedData = {
  recent: LiveNote[];
  diffs: Map<string, DiffExcerpt>;
  lastChange?: string;
  error?: Error;
};

export async function loadRecent(): Promise<RecentFeedData> {
  const res = (await getLiveCollection("recent")) as LiveResult;
  if (res.error) return { recent: [], diffs: new Map(), error: res.error };
  const recent = entriesOf(res).sort(byUpdatedDesc);
  const diffs = await fetchDiffExcerpts(recent.map((e) => e.id)).catch(() => new Map());
  const lastChange = recent.reduce<string | undefined>((best, entry) => {
    const at = noteUpdatedAt(entry.data);
    if (!at) return best;
    return !best || at > best ? at : best;
  }, undefined);
  return { recent, diffs, lastChange };
}

export type ProjectsFeedData = {
  byStatus: Map<string, LiveNote[]>;
  activityDocs: NoteData[];
  openTaskGroups: TaskDocGroup[];
  error?: Error;
};

export async function loadProjects(tasks?: TasksResult): Promise<ProjectsFeedData> {
  const [projectsRes, activityRes, taskResult] = await Promise.all([
    getLiveCollection("projects") as Promise<LiveResult>,
    getLiveCollection("activity") as Promise<LiveResult>,
    tasks ? Promise.resolve(tasks) : fetchTasks().catch(() => EMPTY_TASKS),
  ]);
  const error = projectsRes.error ?? activityRes.error;
  if (error) return { byStatus: new Map(), activityDocs: [], openTaskGroups: [], error };

  const projects = entriesOf(projectsRes).sort((a, b) => {
    const ra = projectStatusRank(a.data.status);
    const rb = projectStatusRank(b.data.status);
    if (ra !== rb) return ra - rb;
    const pa = projectPriorityRank(a.data.priority);
    const pb = projectPriorityRank(b.data.priority);
    if (pa !== pb) return pa - pb;
    return noteTitle(a.data).localeCompare(noteTitle(b.data));
  });
  const byStatus = new Map<string, LiveNote[]>();
  for (const project of projects) {
    const key = project.data.status ?? "unspecified";
    const bucket = byStatus.get(key) ?? [];
    bucket.push(project);
    byStatus.set(key, bucket);
  }
  return {
    byStatus,
    activityDocs: entriesOf(activityRes).map((e) => e.data),
    openTaskGroups: taskResult.open.groups,
  };
}

export type TrackingFeedData = { tracking: LiveNote[]; error?: Error };

export async function loadTracking(): Promise<TrackingFeedData> {
  const res = (await getLiveCollection("tracking")) as LiveResult;
  if (res.error) return { tracking: [], error: res.error };
  return { tracking: entriesOf(res).sort(byUpdatedDesc) };
}

export type TasksFeedData = { tasks: TasksResult; error?: Error };

export async function loadTasks(): Promise<TasksFeedData> {
  try {
    return { tasks: await fetchTasks() };
  } catch (err) {
    return { tasks: EMPTY_TASKS, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export type HomeData = {
  recent: RecentFeedData;
  projects: ProjectsFeedData;
  tracking: TrackingFeedData;
  tasks: TasksFeedData;
  error?: Error;
};

/** Everything the home page shows, fetched concurrently (tasks fetched once). */
export async function loadHome(): Promise<HomeData> {
  const tasks = await loadTasks();
  const [recent, projects, tracking] = await Promise.all([
    loadRecent(),
    loadProjects(tasks.tasks),
    loadTracking(),
  ]);
  const error = recent.error ?? projects.error ?? tracking.error ?? tasks.error;
  return { recent, projects, tracking, tasks, ...(error ? { error } : {}) };
}
