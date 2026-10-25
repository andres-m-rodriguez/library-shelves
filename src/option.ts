export type Option<T> = { readonly some: true; readonly value: T } | { readonly some: false };

export const none: Option<never> = { some: false };

export function some<T>(value: T): Option<T> {
   return { some: true, value };
}

export function option<T>(value: T | undefined | null): Option<T> {
   return value === undefined || value === null ? none : some(value);
}

export function raw<T>(o: Option<T>): T | undefined {
   return o.some ? o.value : undefined;
}

export function nonEmpty(text: string): Option<string> {
   const trimmed = text.trim();
   return trimmed ? some(trimmed) : none;
}

export function map<T, U>(o: Option<T>, f: (value: T) => U): Option<U> {
   return o.some ? some(f(o.value)) : none;
}

export function flatMap<T, U>(o: Option<T>, f: (value: T) => Option<U>): Option<U> {
   return o.some ? f(o.value) : none;
}

export function orElse<T>(o: Option<T>, fallback: T): T {
   return o.some ? o.value : fallback;
}

export function compact<T>(options: Option<T>[]): T[] {
   const values: T[] = [];
   for (const o of options) {
      if (o.some) {
         values.push(o.value);
      }
   }
   return values;
}
