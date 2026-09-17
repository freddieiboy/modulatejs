// The app's way of looking at screens, not the vocabulary's. A file with sections gets a strip of thumbnails
// under the phone, one per section with layers in it: click one and the device frames that section alone, the
// clock held, so a screen can be worked on by itself. And beside a line that goes somewhere (go(product),
// into(photo)) a small arrow; hover it and the fold it goes to lights up. That is the whole "master screen". AGPL-3.0.
import { EditorView, gutter, GutterMarker, Decoration, DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { foldable } from "@codemirror/language";

// ——— the strip
export interface Strip {
  show(names: string[], code: string, device: { w: number; h: number; radius: number }, pictures: Record<string, Blob>): void;
  clear(): void; // the device ran again: whatever was framed alone is back in its place
  toggle(name: string): void;
  has(name: string): boolean;
}

const THUMB_H = 92;
export function makeStrip(el: HTMLElement, main: HTMLIFrameElement): Strip {
  let names: string[] = [], alone: string | null = null, lastCode = "";
  const frames = new Map<string, { frame: HTMLIFrameElement; ready: boolean }>();
  let files: Record<string, Blob> = {};
  let timer: any, drawn = "";

  addEventListener("message", (e) => {
    for (const [name, f] of frames)
      if (e.source === f.frame.contentWindow && e.data?.type === "ready") {
        f.ready = true;
        f.frame.contentWindow!.postMessage({ type: "pictures", files }, "*");
        f.frame.contentWindow!.postMessage({ type: "run", code: lastCode, solo: name }, "*");
      }
  });

  const mark = () => el.querySelectorAll<HTMLElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.name === alone)));
  function toggle(name: string) {
    if (!names.includes(name)) return;
    if (alone === name) {
      alone = null;
      main.contentWindow!.postMessage({ type: "run", code: lastCode }, "*");
    } else {
      // from one framed section to another goes by way of the real thing, so nothing of the first is left behind
      alone = name;
      main.contentWindow!.postMessage({ type: "run", code: lastCode, solo: name }, "*");
    }
    mark();
  }

  return {
    toggle,
    has: (name) => names.includes(name),
    clear() {
      alone = null;
      mark();
    },
    show(next, code, device, pictures) {
      files = pictures;
      lastCode = code;
      const shown = next.length >= 2 ? next.slice(0, 8) : [];
      el.hidden = !shown.length;
      const k = THUMB_H / device.h;
      if (shown.join("\n") !== names.join("\n") || el.dataset.shape !== `${device.w}x${device.h}`) {
        names = shown;
        drawn = code;
        el.dataset.shape = `${device.w}x${device.h}`;
        el.textContent = "";
        frames.clear();
        for (const name of names) {
          const b = document.createElement("button");
          b.className = "screen";
          b.dataset.name = name;
          b.title = `look at ${name} by itself · again to return`;
          const box = document.createElement("span");
          box.className = "screen-box";
          box.style.cssText = `width:${Math.round(device.w * k)}px;height:${THUMB_H}px;border-radius:${Math.round(device.radius * k)}px`;
          const frame = document.createElement("iframe");
          frame.src = "/frame?thumb";
          frame.tabIndex = -1;
          frame.setAttribute("aria-hidden", "true");
          frame.style.cssText = `width:${device.w}px;height:${device.h}px;transform:scale(${k})`;
          box.appendChild(frame);
          const label = document.createElement("span");
          label.className = "screen-name";
          label.textContent = name;
          b.append(box, label);
          b.onclick = () => toggle(name);
          el.appendChild(b);
          frames.set(name, { frame, ready: false });
          frame.addEventListener("load", () => frame.contentWindow?.postMessage({ type: "hello" }, "*"));
        }
        mark();
        return;
      }
      // the same sections as before: the pictures catch up once the typing pauses (and only if something was typed)
      if (code === drawn) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        drawn = lastCode;
        for (const [name, f] of frames) if (f.ready) f.frame.contentWindow!.postMessage({ type: "run", code: lastCode, solo: name }, "*");
      }, 500);
    },
  };
}

// ——— in the editor: a click on a section's name frames it; an arrow beside a line that goes somewhere
const GOES = /\.(?:go|into)\(\s*([A-Za-z_$][\w$]*)/;
const lightUp = StateEffect.define<{ from: number; to: number } | null>();
const lit = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) deco = Decoration.none;
    for (const e of tr.effects)
      if (e.is(lightUp)) {
        if (!e.value) deco = Decoration.none;
        else {
          const b = new RangeSetBuilder<Decoration>();
          for (let n = tr.state.doc.lineAt(e.value.from).number; n <= tr.state.doc.lineAt(e.value.to).number; n++) b.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from, Decoration.line({ class: "cm-goes-here" }));
          deco = b.finish();
        }
      }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// where a name is defined: its line, and the whole fold when it is a section
function whereIs(view: EditorView, name: string): { from: number; to: number } | null {
  const doc = view.state.doc;
  const label = new RegExp(`^\\s*${name.replace(/\$/g, "\\$")}\\s*:(?!:)`);
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (!label.test(line.text)) continue;
    const fold = /:\s*\{\s*(\/\/.*)?$/.test(line.text) ? foldable(view.state, line.from, line.to) : null;
    return { from: line.from, to: fold ? doc.lineAt(fold.to).to : line.to };
  }
  return null;
}

class Arrow extends GutterMarker {
  constructor(readonly target: string) {
    super();
  }
  eq(other: Arrow) {
    return other.target === this.target;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-goes";
    el.textContent = "→";
    el.title = `goes to ${this.target}`;
    el.onmouseenter = () => view.dispatch({ effects: lightUp.of(whereIs(view, this.target)) });
    el.onmouseleave = () => view.dispatch({ effects: lightUp.of(null) });
    el.onclick = () => {
      const at = whereIs(view, this.target);
      if (at) view.dispatch({ selection: { anchor: at.from }, effects: EditorView.scrollIntoView(at.from, { y: "center" }) });
    };
    return el;
  }
}

export function screensInEditor(strip: () => Strip | null) {
  return [
    lit,
    gutter({
      class: "cm-goes-gutter",
      lineMarker(view, line) {
        const m = GOES.exec(view.state.doc.lineAt(line.from).text);
        return m ? new Arrow(m[1]) : null;
      },
      lineMarkerChange: (u) => u.docChanged,
    }),
    EditorView.domEventHandlers({
      click(e, view) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !view.state.selection.main.empty) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        const line = view.state.doc.lineAt(pos);
        const m = /^(\s*)([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(line.text);
        const s = strip();
        if (!m || !s || pos - line.from < m[1].length || pos - line.from > m[1].length + m[2].length || !s.has(m[2])) return false;
        s.toggle(m[2]);
        return false;
      },
    }),
  ];
}
