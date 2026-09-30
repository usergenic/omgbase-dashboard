/**
 * Bind GFM task checkboxes in a rendered note body to omg task blocks so the
 * `TaskWriteback` client script can toggle them via `/api/tasks/complete`.
 *
 * The renderer emits `<li class="task-list-item"><input type="checkbox" disabled> …`
 * with no block identity, so we pair each checkbox with a block from the
 * `from blocks where type == "task"` query for the same doc: by normalized text
 * first, then positionally for whatever is left when the counts still agree.
 * Checkboxes we can't pair stay disabled.
 */

export type TaskBlock = {
  id: string;
  text: string;
  checked: boolean;
};

export type TaskBindMeta = {
  path: string;
  title: string;
  slug: string;
  updatedAt?: string;
};

/** Tight lists: `<li class="task-list-item"><input …>`; loose lists wrap the input in `<p>`. */
const TASK_INPUT_RE =
  /(<li class="task-list-item">\s*(?:<p>\s*)?)<input type="checkbox"( checked)? disabled>/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Reduce text to a lowercase alphanumeric signature. The renderer smart-quotes,
 * re-encodes entities, and drops markup, while block text is raw source with
 * `**`, `` ` ``, `_` (also legit inside identifiers) and angle brackets, so
 * anything short of a real markdown parse mis-fires on punctuation. Letters and
 * digits in order are a stable, sufficiently unique fingerprint for pairing.
 */
function signature(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Rendered `<li>` inner HTML (up to any nested list) → comparable signature. */
export function normalizeRenderedTaskText(innerHtml: string): string {
  const cut = innerHtml.search(/<(ul|ol)\b/i);
  const own = cut === -1 ? innerHtml : innerHtml.slice(0, cut);
  return signature(decodeEntities(own.replace(/<[^>]+>/g, "")));
}

/** Block markdown source → comparable signature (drop link/image targets). */
export function normalizeTaskSource(markdown: string): string {
  return signature(
    markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, a: string, b?: string) => b ?? a),
  );
}

type Slot = {
  start: number;
  end: number;
  checked: boolean;
  text: string;
};

function findSlots(html: string): Slot[] {
  const slots: Slot[] = [];
  TASK_INPUT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TASK_INPUT_RE.exec(html)) !== null) {
    const start = m.index + m[1]!.length; // the `<input …>` itself
    const end = m.index + m[0].length;
    const close = html.indexOf("</li>", end);
    const inner = html.slice(end, close === -1 ? html.length : close);
    slots.push({
      start,
      end,
      checked: Boolean(m[2]),
      text: normalizeRenderedTaskText(inner),
    });
  }
  return slots;
}

/** Pair rendered checkboxes with task blocks; `null` where no block fits. */
export function pairTaskBlocks(slots: Slot[], blocks: TaskBlock[]): Array<TaskBlock | null> {
  const assigned: Array<TaskBlock | null> = slots.map(() => null);
  const used = new Set<number>();
  const normalized = blocks.map((b) => normalizeTaskSource(b.text));

  slots.forEach((slot, i) => {
    for (let j = 0; j < blocks.length; j++) {
      if (used.has(j)) continue;
      if (normalized[j] === slot.text && blocks[j]!.checked === slot.checked) {
        assigned[i] = blocks[j]!;
        used.add(j);
        return;
      }
    }
  });

  // Positional fallback for the leftovers, only when the counts still agree.
  const openSlots = slots.map((_, i) => i).filter((i) => assigned[i] === null);
  const openBlocks = blocks.map((_, j) => j).filter((j) => !used.has(j));
  if (openSlots.length > 0 && openSlots.length === openBlocks.length) {
    for (let k = 0; k < openSlots.length; k++) {
      const slot = slots[openSlots[k]!]!;
      const block = blocks[openBlocks[k]!]!;
      if (block.checked === slot.checked) assigned[openSlots[k]!] = block;
    }
  }
  return assigned;
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Rewrite the rendered body so each paired checkbox is live: enabled and
 * carrying the `data-task-check` / `data-block` attributes `TaskWriteback`
 * listens for. Returns `{ html, bound, total }` for diagnostics.
 */
export function bindTaskCheckboxes(
  html: string,
  blocks: TaskBlock[],
  meta: TaskBindMeta,
): { html: string; bound: number; total: number } {
  const slots = findSlots(html);
  if (slots.length === 0) return { html, bound: 0, total: 0 };
  const pairs = pairTaskBlocks(slots, blocks);

  let out = "";
  let cursor = 0;
  let bound = 0;
  slots.forEach((slot, i) => {
    const block = pairs[i];
    out += html.slice(cursor, slot.start);
    if (block) {
      bound++;
      out +=
        `<input type="checkbox"${slot.checked ? " checked" : ""}` +
        ` data-task-check data-block="${attr(block.id)}" data-path="${attr(meta.path)}"` +
        ` data-title="${attr(meta.title)}" data-slug="${attr(meta.slug)}"` +
        ` data-updated="${attr(meta.updatedAt ?? "")}">`;
    } else {
      out += html.slice(slot.start, slot.end);
    }
    cursor = slot.end;
  });
  out += html.slice(cursor);
  return { html: out, bound, total: slots.length };
}
