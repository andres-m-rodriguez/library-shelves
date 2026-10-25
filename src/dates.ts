import { parsers } from "./parsers";

const DAY_MS = 86_400_000;

export function dayKey(ts: number): string {
   return parsers.day.fromTimestamp(ts);
}

export function parseDay(key: string): Date {
   return parsers.day.toDate(key);
}

export function longDate(key: string): string {
   const date = parseDay(key);
   return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function dayLabel(key: string): string {
   const today = dayKey(Date.now());
   if (key === today) {
      return "Today";
   }
   if (key === dayKey(Date.now() - DAY_MS)) {
      return "Yesterday";
   }
   const daysAgo = Math.round((parseDay(today).getTime() - parseDay(key).getTime()) / DAY_MS);
   if (daysAgo > 1 && daysAgo < 7) {
      return parseDay(key).toLocaleDateString(undefined, { weekday: "long" });
   }
   return longDate(key);
}
