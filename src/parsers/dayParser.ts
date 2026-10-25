const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DayParser {
   fromTimestamp(ts: number): string {
      const date = new Date(ts);
      return this.fromDate(date);
   }

   fromDate(date: Date): string {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
   }

   toDate(key: string): Date {
      return new Date(`${key}T12:00:00`);
   }

   parse(text: string | undefined): string | undefined {
      return this.validate(text) === undefined && text?.trim() ? text.trim() : undefined;
   }

   validate(text: string | undefined): string | undefined {
      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
         return undefined;
      }
      if (!DAY_RE.test(trimmed)) {
         return "Use YYYY-MM-DD, for example 2026-10-24";
      }
      const parsed = this.toDate(trimmed);
      const roundTrip = Number.isNaN(parsed.getTime()) ? "" : this.fromDate(parsed);
      return roundTrip === trimmed ? undefined : "That is not a real calendar date";
   }
}
