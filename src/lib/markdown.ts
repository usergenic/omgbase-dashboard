import { micromark } from "micromark";

/** `#RGB`, `#RRGGBB`, or `#RRGGBBAA` — not followed by another hex digit. */
const HEX_COLOR_RE =
  /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})(?![0-9A-Fa-f])/g;

/** Entire `<code>` body is a single hex color (optional surrounding whitespace). */
const LONE_HEX_CODE_RE =
  /<code(\s[^>]*)?>\s*(#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8}))\s*<\/code>/g;

const SKIP_TAGS = new Set([
  "code",
  "pre",
  "script",
  "style",
  "textarea",
  "kbd",
  "samp",
]);

function expandHex(hex: string): string {
  if (hex.length === 3) {
    return `#${[...hex].map((c) => c + c).join("")}`;
  }
  return `#${hex}`;
}

function swatchHtml(match: string, hex: string): string {
  const css = expandHex(hex);
  return `<span class="hex-color">${match}<span class="hex-swatch" style="background-color:${css}" title="${match}" aria-hidden="true"></span></span>`;
}

/** Chip lone `` `#RRGGBB` `` code spans; leave mixed code content alone. */
function decorateLoneHexInCode(html: string): string {
  return html.replace(LONE_HEX_CODE_RE, (_full, attrs: string | undefined, hex: string) => {
    return `<code${attrs ?? ""}>${swatchHtml(hex, hex.slice(1))}</code>`;
  });
}

/**
 * Insert a small color chip after hex color literals in HTML text nodes.
 * Also chips `<code>` that contains only a hex color. Skips pre/script/style
 * and mixed code spans.
 */
export function decorateHexColors(html: string): string {
  let out = "";
  let i = 0;
  const skipStack: string[] = [];

  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      const tag = html.slice(i, end + 1);
      out += tag;
      const m = /^<\/?\s*([a-zA-Z][\w:-]*)/.exec(tag);
      if (m) {
        const name = m[1]!.toLowerCase();
        const closing = /^<\s*\//.test(tag);
        const selfClosing = /\/>\s*$/.test(tag);
        if (closing) {
          if (skipStack.at(-1) === name) skipStack.pop();
        } else if (!selfClosing && SKIP_TAGS.has(name)) {
          skipStack.push(name);
        }
      }
      i = end + 1;
      continue;
    }

    let j = html.indexOf("<", i);
    if (j === -1) j = html.length;
    let text = html.slice(i, j);
    if (skipStack.length === 0) {
      text = text.replace(HEX_COLOR_RE, swatchHtml);
    }
    out += text;
    i = j;
  }

  return decorateLoneHexInCode(out);
}

/**
 * Render a task line as HTML (emphasis, code, links). Outer `<p>` from
 * micromark is stripped so the result can sit inside a label/span.
 */
export function renderInlineMarkdown(source: string): string {
  const html = micromark(source, { allowDangerousHtml: false });
  const inline = html.replace(/^<p>/i, "").replace(/<\/p>\s*$/i, "").trim();
  return decorateHexColors(inline);
}
