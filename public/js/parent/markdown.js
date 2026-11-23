// Tiny markdown for guides: frontmatter, headings, lists, paragraphs, **bold**, *italic*, `code`, [links](https://...). Escapes everything first.
import { esc } from "/js/common.js";

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function renderMarkdown(src) {
  const out = [];
  let list = null; // "ul" | "ol"
  let para = [];
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const close = () => { if (list) out.push(`</${list}>`); list = null; };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line);
    if (!line) { flush(); close(); } else if (h) {
      flush(); close();
      const n = Math.min(4, h[1].length + 1); // # becomes h2 inside the card
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
    } else if (li) {
      flush();
      const kind = li[1] ? "ul" : "ol";
      if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(li[3])}</li>`);
    } else { close(); para.push(line); }
  }
  flush(); close();
  return out.join("");
}
