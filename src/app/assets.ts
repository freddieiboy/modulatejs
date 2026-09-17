// Pictures dropped on coral.fm. They are kept in this browser only (IndexedDB): nothing is uploaded, a link
// doesn't carry them, and another device shows the file's name where the picture would be. AGPL-3.0.

const DB = "coral", STORE = "pictures";
let db: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Blob>(); // what this session has, and all there is if the browser won't give us a database

function open(): Promise<IDBDatabase | null> {
  return (db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

const done = <T>(req: IDBRequest<T>) => new Promise<T>((ok, fail) => ((req.onsuccess = () => ok(req.result)), (req.onerror = () => fail(req.error))));

export async function allPictures(): Promise<Record<string, Blob>> {
  const d = await open();
  if (d) {
    try {
      const store = d.transaction(STORE).objectStore(STORE);
      const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
      keys.forEach((k, i) => memory.set(String(k), values[i] as Blob));
    } catch {}
  }
  return Object.fromEntries(memory);
}

export async function removePicture(name: string) {
  memory.delete(name);
  const d = await open();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(name);
    await new Promise<void>((ok) => ((tx.oncomplete = () => ok()), (tx.onerror = tx.onabort = () => ok())));
  } catch {}
}

export const heldPictures = () => [...memory.entries()].map(([name, blob]) => ({ name, blob })).sort((a, b) => a.name.localeCompare(b.name));

export const tidy = (fileName: string) => {
  const base = fileName.split(/[/\\]/).pop()!.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
  return /\.[a-z0-9]+$/.test(base) ? base : base + ".png";
};

async function same(a: Blob, b: Blob) {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
  return true;
}

// Keep a picture. The same picture again is the same name; a different picture with that name keeps both.
export async function keepPicture(file: File): Promise<{ name: string; kept: "browser" | "session" }> {
  const wanted = tidy(file.name || "picture.png");
  const dot = wanted.lastIndexOf(".");
  let name = wanted;
  for (let n = 2; memory.has(name) && !(await same(memory.get(name)!, file)); n++) name = wanted.slice(0, dot) + "-" + n + wanted.slice(dot);
  const blob = file.slice(0, file.size, file.type);
  memory.set(name, blob);
  const d = await open();
  if (!d) return { name, kept: "session" };
  try {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, name);
    await new Promise<void>((ok, fail) => ((tx.oncomplete = () => ok()), (tx.onerror = tx.onabort = () => fail(tx.error))));
    return { name, kept: "browser" };
  } catch {
    return { name, kept: "session" }; // full, or private browsing: it still works until the tab closes
  }
}
