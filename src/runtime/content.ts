// Demo content. Providers come and go; the placeholder is the design, so every
// piece looks finished with the network off.

export interface Providers {
  image(seed: string, w: number, h: number): string | null;
  avatar(seed: string): string | null;
}

export const providers: Providers = {
  image: (seed, w, h) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/${Math.round(w * 2)}/${Math.round(h * 2)}`,
  // notionists-neutral is CC0
  avatar: (seed) => `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`,
};

export function provider(next: Partial<Providers>) {
  Object.assign(providers, next);
}

export const bank = {
  names: ["Addie Moreau", "Noor Haddad", "Kenji Sato", "Lucía Peña", "Theo Lindqvist", "Amara Obi", "Ines Castel", "Milo Hartmann", "Priya Raman", "Sol Navarro"],
  prices: ["$48", "$120", "$19", "$240", "$65", "$8.50", "$32", "$310"],
  titles: ["Canvas tote", "Morning light", "Weekend in Lisbon", "Quiet hours", "Field notes", "Small batch", "Soft launch", "Blue hour"],
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

let cursor: Record<string, number> = {};
export function resetContent() {
  cursor = {};
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
