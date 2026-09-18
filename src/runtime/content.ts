// Demo content. Providers come and go; the placeholder is the design, so every
// piece looks finished with the network off.

export interface Providers {
  image(seed: string, w: number, h: number): string | null;
  avatar(seed: string): string | null;
  // your own pictures: given the name in image("stroller.png"), a URL that has it, or null to use the name as the URL
  file?(name: string): string | null;
}

// A picture should be the thing it is named for. These are picked by hand from picsum's set (Unsplash photos,
// free to use), so "mug" is a mug and "park" is a park, and the same word is the same picture everywhere. A word
// that isn't here gets a picture by hash, as ever.
export const PICTURES: Record<string, number> = {
  // things
  mug: 30, coffee: 113, espresso: 225, book: 24, notes: 24, "field notes": 24, clock: 175, watch: 26, "desk set": 26, camera: 250, "film camera": 250, sneakers: 103, shoes: 103, heels: 21, tricycle: 146, bike: 146, honey: 312, "honey jar": 312, tart: 102, dessert: 102, "dream catcher": 104, iris: 152, flower: 152, plant: 305, "house plant": 305, salad: 292, dog: 237, laptop: 9, car: 111, van: 184, balloon: 174, cactus: 248, lily: 306, cow: 200,
  // places
  room: 42, cafe: 42, park: 216, path: 17, forest: 203, woods: 190, harbour: 211, pier: 77, boats: 211, dunes: 196, sand: 196, desert: 27, sea: 149, ocean: 296, beach: 215, lake: 54, mountain: 29, mountains: 29, alps: 29, city: 122, night: 232, street: 164, canal: 165, venice: 165, lighthouse: 58, bridge: 43, road: 314, railway: 197, train: 197, blossom: 83, spring: 83, family: 129, bench: 129, concert: 158, sunset: 110, field: 107, meadow: 18, snow: 235, winter: 235, sky: 52, clouds: 54, cabin: 76, garden: 189, market: 195,
};
// "Stone mug" is a mug, "a film camera" is a camera: the whole name first, then its last word
export function pictureOf(seed: string): number | undefined {
  const key = String(seed).trim().toLowerCase().replace(/^(a|an|the)\s+/, "");
  return PICTURES[key] ?? PICTURES[key.split(/\s+/).pop()!];
}

export const providers: Providers = {
  image: (seed, w, h) => {
    const id = pictureOf(seed);
    return id != null ? `https://picsum.photos/id/${id}/${Math.round(w * 2)}/${Math.round(h * 2)}` : `https://picsum.photos/seed/${encodeURIComponent(seed)}/${Math.round(w * 2)}/${Math.round(h * 2)}`;
  },
  // notionists-neutral is CC0
  avatar: (seed) => `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`,
};

export function provider(next: Partial<Providers>) {
  Object.assign(providers, next);
}

const builtin = {
  names: ["Addie Moreau", "Noor Haddad", "Kenji Sato", "Lucía Peña", "Theo Lindqvist", "Amara Obi", "Ines Castel", "Milo Hartmann", "Priya Raman", "Sol Navarro"],
  prices: ["$48", "$120", "$19", "$240", "$65", "$8.50", "$32", "$310"],
  titles: ["Film camera", "Stone mug", "Field notes", "Brass clock", "Sunday sneakers", "Honey jar", "Raspberry tart", "Dream catcher", "House plant", "Red tricycle"],
  lines: [
    "Is this still available?",
    "Yes! Two left in sand.",
    "Could you ship it by Friday?",
    "Easily. I'll pack it tonight.",
    "Perfect, sending payment now",
    "Thank you! It's on its way.",
    "Got it today, it's lovely",
    "So glad. Enjoy!",
  ],
};

export type Bank = Record<keyof typeof builtin, string[]>;
export const bank: Bank = { ...builtin };

let cursor: Record<string, number> = {};
export function resetContent() {
  cursor = {};
  Object.assign(bank, builtin);
}

// content({ titles: "Canvas tote, Stone mug", prices: ["$48", "$22"] })
// Your words instead of the bank's. Set it once, on the first line; every piece that
// fills itself (card, text, avatar, messages, sheet) draws from it, in order.
export function content(yours: Partial<Record<keyof Bank, string | string[]>>) {
  if (!yours || typeof yours !== "object" || Array.isArray(yours)) throw new Error(`content() takes your words by kind: content({ titles: "Canvas tote, Stone mug", prices: "$48, $22" })`);
  for (const [kind, value] of Object.entries(yours)) {
    if (!(kind in builtin)) throw new Error(`content(): no "${kind}" — the kinds are ${Object.keys(builtin).join(", ")}`);
    const list = (Array.isArray(value) ? value : String(value).split(/\s*[,\n]\s*/)).map((v) => String(v).trim()).filter(Boolean);
    if (!list.length) throw new Error(`content(): "${kind}" is empty`);
    (bank as any)[kind] = list;
    delete cursor[kind];
  }
}

// each call hands out the next one, so a run always reads the same
export function next(kind: keyof typeof bank): string {
  const list = bank[kind];
  const i = cursor[kind] ?? 0;
  cursor[kind] = i + 1;
  return list[i % list.length];
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const DUOS = [
  ["#f3c6a5", "#e2694f"],
  ["#c9b8ff", "#7a5af8"],
  ["#bfe8d6", "#35b889"],
  ["#bcd9ff", "#3f8ef7"],
  ["#fbe3a8", "#f2b33d"],
  ["#f9c1d5", "#ea5a8c"],
  ["#e8dfd0", "#b9a88c"],
];

export function duo(seed: string): [string, string] {
  return DUOS[hash(seed) % DUOS.length] as [string, string];
}

export function placeholder(seed: string): string {
  const [a, b] = duo(seed);
  const angle = 120 + (hash(seed + "a") % 120);
  return `linear-gradient(${angle}deg, ${a}, ${b})`;
}

export const looksLikeUrl = (s: string) => /^(https?:|data:|blob:|\/|\.\/)|\.(png|jpe?g|gif|webp|avif|svg)$/i.test(s);

export function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
