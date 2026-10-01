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
  docId?: string;
  slug: string;
  title: string;
  status?: string;
  updatedAt?: string;
};

/**
 * Display form of a vault path. Journal filenames use U+1804 MONGOLIAN COLON
 * between HH and MM because `:` is not filesystem-safe; render it as a plain
 * colon. Visual only — hrefs, copy buttons and data attributes keep the real
 * path.
 */
export function displayPath(path: string): string {
  return path.replace(/\u1804/g, ":");
}

export function noteTitle(data: NoteData): string {
  if (typeof data.title === "string" && data.title.length > 0) return data.title;
  if (typeof data.$title === "string" && data.$title.length > 0) return data.$title;
  return displayPath(data.path.replace(/\.md$/i, ""));
}

/**
 * Collapse whitespace, strip simple markup, and fold typographic punctuation
 * for title comparison. The renderer smart-quotes `'`/`"` and turns `--`/`...`
 * into `–`/`…`, while frontmatter / `$title` keep the authored ASCII.
 */
export function normalizeHeadingText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/-{2,3}/g, "-")
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

function isExternalOrSpecialHref(href: string): boolean {
  if (!href || href.startsWith("#")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return true;
  return false;
}

/** `/people/x.md#frag` or `people/x.md` → `/note/people/x/#frag`; else null. */
export function vaultPathToNoteHref(href: string): string | null {
  if (isExternalOrSpecialHref(href) || href.startsWith("/note/")) return null;
  const hashAt = href.indexOf("#");
  const path = (hashAt >= 0 ? href.slice(0, hashAt) : href).replace(/^\//, "");
  if (!/\.md$/i.test(path)) return null;
  return `/note/${path.replace(/\.md$/i, "")}/${hashAt >= 0 ? href.slice(hashAt) : ""}`;
}

/**
 * Point vault-path links (`[x](/people/x.md)`) in small rendered fragments —
 * task text, excerpts — at their `/note/…/` pages. Every document is routable,
 * so a path is enough; the live loader does the identity-aware version for
 * whole bodies.
 */
export function rewriteVaultLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) return full;
    const next = vaultPathToNoteHref(hrefMatch[2] ?? "");
    if (!next) return full;
    const quote = hrefMatch[1]!;
    return `<a${attrs.replace(/\bhref\s*=\s*(["']).*?\1/i, `href=${quote}${next}${quote}`)}>`;
  });
}

/**
 * The live loader rewrites every link omg resolved to a document into
 * `/note/<slug>/` before rendering. Whatever is left pointing at a vault path
 * is dangling (no such doc), so unwrap it to its inner HTML rather than link
 * to a 404. External, hash-only and site-absolute links are unchanged.
 */
export function unwrapUnresolvedNoteLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs: string, inner: string) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    if (!hrefMatch) return full;
    const href = hrefMatch[2] ?? "";
    if (isExternalOrSpecialHref(href)) return full;
    if (href.startsWith("/note/")) return full;
    if (href.startsWith("/") && !/\.md(#|$)/i.test(href)) return full;
    return inner;
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
    docId: data.docId,
    slug: data.slug,
    title: noteTitle(data),
    ...(typeof data.status === "string" && data.status ? { status: data.status } : {}),
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
