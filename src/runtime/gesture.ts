// Who gets a finger. Scrollers, drags and the screens' back gestures all listen to the same pointer, and each
// decides for itself, from the same first 10 points of movement, whether it is theirs. This is where they find
// each other without importing each other.

const owners = new WeakMap<Element, any>();
export const ownsScrolling = (el: Element, scroller: any) => owners.set(el, scroller);

// the scroller a finger landed in, if any (the innermost, looking no further out than `within`)
export function scrollerAt(target: EventTarget | null, within?: Element | null): any {
  for (let n = target as Element | null; n && n !== within; n = n.parentElement) if (owners.has(n)) return owners.get(n);
  return null;
}
// the scroller a layer sits in
export function scrollerAround(layer: any): any {
  for (let p = (layer.__root ?? layer).parent; p; p = p.parent) if (p.kind === "scroller") return p;
  return null;
}
export const LOCK = 10; // points of movement before anyone decides
