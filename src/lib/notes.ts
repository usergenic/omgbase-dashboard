import {
  ACTIVITY_LIMIT_PER_PROJECT,
  projectNamespacePrefix,
} from "./queries";

export type NoteData = {
  title?: string;
  status?: string;
  layer?: string;
  type?: string;
  tracking?: boolean;
  priority?: number | null;
  path: string;
  docId: string;
  contentHash: string | null;
  slug: string;
  updatedAt?: string;
  $updated_at?: string;
  $title?: string;
  /** OQX `doc.out collect` projection — lean hits with `$path`. */
  outs?: unknown;
};

export type ActivityItem = {
  path: string;
  slug: string;
  title: string;
  updatedAt?: string;
};

export function noteTitle(data: NoteData): string {
  if (typeof data.title === "string" && data.title.length > 0) return data.title;
  if (typeof data.$title === "string" && data.$title.length > 0) return data.$title;
  return data.path.replace(/\.md$/i, "");
}

/** Collapse whitespace and strip simple markup for title comparison. */
export function normalizeHeadingText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Drop a leading `<h1>` from rendered HTML when its text matches `title`
 * (avoids duplicating the page chrome heading).
 */
export function stripLeadingH1IfMatches(html: string, title: string): string {
  const match = html.match(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i);
  if (!match) return html;
  if (normalizeHeadingText(match[1] ?? "") !== normalizeHeadingText(title)) {
    return html;
  }
  return html.slice(match[0].length);
}

/** Site hrefs / vault paths for notes we actually have detail pages for. */
export function buildKnownNoteHrefs(
  entries: Array<{ data: Pick<NoteData, "path" | "slug"> }>,
): Set<string> {
  return new Set(buildNoteHrefIndex(entries).keys());
}

/**
 * Map vault paths and `/note/…` aliases → canonical `/note/${slug}/` href.
 */
export function buildNoteHrefIndex(
  entries: Array<{ data: Pick<NoteData, "path" | "slug"> }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    const { path, slug } = entry.data;
    const noteHref = `/note/${slug}/`;
    const aliases = [
      noteHref,
      `/note/${slug}`,
      path,
      `/${path}`,
    ];
    if (path.endsWith(".md")) {
      const bare = path.replace(/\.md$/i, "");
      aliases.push(bare, `/${bare}`);
    }
    for (const key of aliases) index.set(key, noteHref);
  }
  return index;
}

function hrefPathOnly(href: string): string {
  return href.split("#")[0]!.split("?")[0]!;
}

function hrefHash(href: string): string {
  const i = href.indexOf("#");
  return i >= 0 ? href.slice(i) : "";
}

function isExternalOrSpecialHref(href: string): boolean {
  if (!href || href.startsWith("#")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return true;
  return false;
}

function resolveNoteHref(href: string, index: Map<string, string>): string | null {
  const path = hrefPathOnly(href);
  if (!path) return null;
  return index.get(path) ?? index.get(path.replace(/\/$/, "")) ?? index.get(`${path.replace(/\/$/, "")}/`) ?? null;
}

/**
 * For body links: rewrite targets we serve to `/note/…/`; unwrap (keep inner
 * HTML only) when the target isn't a rendered dashboard note. External and
 * hash-only links are unchanged.
 */
export function prepareNoteBodyLinks(html: string, noteHrefIndex: Map<string, string>): string {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs: string, inner: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) return full;
    const quote = hrefMatch[1]!;
    const href = hrefMatch[2] ?? "";
    if (isExternalOrSpecialHref(href)) return full;

    const resolved = resolveNoteHref(href, noteHrefIndex);
    if (!resolved) return inner;

    const next = `${resolved}${hrefHash(href)}`;
    if (href === next) return full;
    const newAttrs = attrs.replace(/\bhref\s*=\s*(["']).*?\1/i, `href=${quote}${next}${quote}`);
    return `<a${newAttrs}>${inner}</a>`;
  });
}

export function noteUpdatedAt(data: NoteData): string | undefined {
  if (typeof data.updatedAt === "string") return data.updatedAt;
  if (typeof data.$updated_at === "string") return data.$updated_at;
  return undefined;
}

export function formatWhen(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

const PROJECT_STATUS_ORDER = [
  "active",
  "exploring",
  "idea",
  "paused",
  "completed",
  "retired",
] as const;

export function projectStatusRank(status: string | undefined): number {
  if (!status) return PROJECT_STATUS_ORDER.length;
  const i = PROJECT_STATUS_ORDER.indexOf(status as (typeof PROJECT_STATUS_ORDER)[number]);
  return i === -1 ? PROJECT_STATUS_ORDER.length - 0.5 : i;
}

/** Explicit numeric priority sorts ascending; missing priority sorts after. */
export function projectPriorityRank(priority: unknown): number {
  if (typeof priority === "number" && Number.isFinite(priority)) return priority;
  return Number.POSITIVE_INFINITY;
}

function outPathsOf(data: NoteData): string[] {
  const outs = data.outs;
  if (!Array.isArray(outs)) return [];
  const paths: string[] = [];
  for (const item of outs) {
    if (item && typeof item === "object") {
      const path = (item as { $path?: unknown; path?: unknown }).$path
        ?? (item as { path?: unknown }).path;
      if (typeof path === "string") paths.push(path);
    } else if (typeof item === "string") {
      paths.push(item);
    }
  }
  return paths;
}

export function toActivityItem(data: NoteData): ActivityItem {
  return {
    path: data.path,
    slug: data.slug,
    title: noteTitle(data),
    updatedAt: noteUpdatedAt(data),
  };
}

/**
 * Assign recent activity docs to a project hub via (1) outbound link to the hub
 * or (2) path under the hub's namespace. Deduped, newest first, capped.
 */
export function activityForProject(
  hubPath: string,
  activity: NoteData[],
  limit = ACTIVITY_LIMIT_PER_PROJECT,
): ActivityItem[] {
  const prefix = projectNamespacePrefix(hubPath);
  const seen = new Set<string>();
  const matched: NoteData[] = [];

  for (const doc of activity) {
    if (doc.path === hubPath) continue;
    const underNamespace = doc.path.startsWith(prefix);
    const linksToHub = outPathsOf(doc).includes(hubPath);
    if (!underNamespace && !linksToHub) continue;
    if (seen.has(doc.path)) continue;
    seen.add(doc.path);
    matched.push(doc);
  }

  matched.sort((a, b) =>
    String(noteUpdatedAt(b) ?? "").localeCompare(String(noteUpdatedAt(a) ?? "")),
  );

  return matched.slice(0, limit).map(toActivityItem);
}
