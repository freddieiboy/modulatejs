// A very small highlighter for static snippets (the try-one lines, the spec, the library).
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function tint(src: string): string {
  const re = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(^[ \t]*[A-Za-z_$][\w$]*(?=[ \t]*:(?!:)))|([A-Za-z_$][\w$]*)(?=\s*\()|(\b\d*\.?\d+\b)|([()[\]{}.,;=>+\-*/<!?:]+)/gm;
  let out = "", last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? "t-com" : m[2] ? "t-str" : m[3] ? "t-label" : m[4] ? "t-fn" : m[5] ? "t-num" : "t-punc";
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}
