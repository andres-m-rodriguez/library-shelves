import type { CardMeta } from "../contracts";

// A card's dependencies are the keys of the cards it builds on: "If.md" depends on
// "Scopes.md" when Scopes has to be understood first.

export type Dependencies = Map<string, string[]>;

export function dependenciesOf(meta: CardMeta): string[] {
   const raw: unknown = meta.dependsOn;
   if (!Array.isArray(raw)) {
      return [];
   }
   const keys = raw.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
   return [...new Set(keys)];
}

export function positionOf(meta: CardMeta): { x: number; y: number } | undefined {
   const raw: unknown = meta.position;
   if (typeof raw !== "object" || raw === undefined || Array.isArray(raw) || !raw) {
      return undefined;
   }
   const { x, y } = raw as { x?: unknown; y?: unknown };
   return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

export function dependencyMap(cards: Iterable<[string, CardMeta]>): Dependencies {
   const map: Dependencies = new Map();
   for (const [key, meta] of cards) {
      map.set(key, dependenciesOf(meta));
   }
   return map;
}

// Everything the card builds on, directly or through other cards.
export function prerequisitesOf(dependencies: Dependencies, key: string): Set<string> {
   return reach(key, (current) => dependencies.get(current) ?? []);
}

// Everything that builds on the card, directly or through other cards.
export function dependentsOf(dependencies: Dependencies, key: string): Set<string> {
   const reverse = new Map<string, string[]>();
   for (const [card, needs] of dependencies) {
      for (const need of needs) {
         reverse.set(need, [...(reverse.get(need) ?? []), card]);
      }
   }
   return reach(key, (current) => reverse.get(current) ?? []);
}

// Whether making `card` depend on `prerequisite` would close a loop.
export function wouldCycle(dependencies: Dependencies, prerequisite: string, card: string): boolean {
   return prerequisite === card || prerequisitesOf(dependencies, prerequisite).has(card);
}

function reach(start: string, next: (key: string) => string[]): Set<string> {
   const seen = new Set<string>();
   const todo = [...next(start)];
   while (todo.length) {
      const key = todo.pop() as string;
      if (seen.has(key)) {
         continue;
      }
      seen.add(key);
      todo.push(...next(key));
   }
   return seen;
}
