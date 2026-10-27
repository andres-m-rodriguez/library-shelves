import type { RowConfig, RowLabel, RowPart, RowSetting } from "../contracts";
import { dayLabel, parseDay } from "../dates";

export interface DateFormat {
   pattern: string;
   label: string;
}

export const SMART_DATE = "smart";

export const DATE_FORMATS: DateFormat[] = [
   { pattern: SMART_DATE, label: "Today, Yesterday, the weekday, then the full date" },
   { pattern: "YYYY-MM-DD", label: "Year first" },
   { pattern: "MM/DD", label: "Month and day" },
   { pattern: "M/D", label: "Month and day, no leading zeros" },
   { pattern: "DD/MM", label: "Day and month" },
   { pattern: "MM/DD/YYYY", label: "Month, day, year" },
   { pattern: "DD/MM/YYYY", label: "Day, month, year" },
   { pattern: "DD.MM.YYYY", label: "Day, month, year with dots" },
   { pattern: "MMM D", label: "Short month name and day" },
   { pattern: "D MMM", label: "Day and short month name" },
   { pattern: "MMM D, YYYY", label: "Short month name, day and year" },
   { pattern: "ddd, MMM D", label: "Weekday, short month name and day" },
   { pattern: "dddd", label: "Weekday only" },
];

export const DATE_TOKENS: [string, string][] = [
   ["YYYY", "four digit year"],
   ["YY", "two digit year"],
   ["MMMM", "full month name"],
   ["MMM", "short month name"],
   ["MM", "two digit month"],
   ["M", "month"],
   ["DD", "two digit day"],
   ["D", "day"],
   ["dddd", "full weekday name"],
   ["ddd", "short weekday name"],
];

export const ROW_LABELS: RowLabel[] = ["fileName", "title"];
export const ROW_PARTS: RowPart[] = ["fileName", "title", "date", "description", "tags"];
export const CARD_PARTS: RowPart[] = ["fileName", "title", "description"];

export const ROW_LABEL_NAMES: Record<RowLabel, string> = { fileName: "File name", title: "Title" };
export const ROW_PART_NAMES: Record<RowPart, string> = {
   fileName: "File name",
   title: "Title",
   date: "Date",
   description: "Description",
   tags: "Tags",
};

export const DEFAULT_ROW: RowConfig = { label: "fileName", parts: ["title", "description"], date: SMART_DATE };

const TOKEN_RE = /YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd/g;

export function sanitizeRow(value: unknown): RowSetting | undefined {
   if (typeof value !== "object" || !value || Array.isArray(value)) {
      return undefined;
   }
   const raw = value as Record<string, unknown>;
   const setting: RowSetting = {};
   if (typeof raw.label === "string" && isRowLabel(raw.label)) {
      setting.label = raw.label;
   }
   if (Array.isArray(raw.parts)) {
      setting.parts = raw.parts.filter((part): part is RowPart => typeof part === "string" && isRowPart(part));
   }
   if (typeof raw.date === "string" && raw.date.trim()) {
      setting.date = raw.date.trim();
   }
   return setting;
}

export function resolveRow(layers: (RowSetting | undefined)[]): RowConfig {
   const resolved: RowConfig = { ...DEFAULT_ROW };
   for (const layer of layers) {
      const clean = sanitizeRow(layer);
      if (clean === undefined) {
         continue;
      }
      if (clean.label !== undefined) {
         resolved.label = clean.label;
      }
      if (clean.parts !== undefined) {
         resolved.parts = clean.parts;
      }
      if (clean.date !== undefined) {
         resolved.date = clean.date;
      }
   }
   return resolved;
}

export function formatDay(key: string, pattern: string): string {
   if (pattern === SMART_DATE) {
      return dayLabel(key);
   }
   const date = parseDay(key);
   return pattern.replace(TOKEN_RE, (token) => tokenValue(date, token));
}

export function dateExample(pattern: string, sampleKey: string): string {
   return formatDay(sampleKey, pattern);
}

export function isRowLabel(value: string): value is RowLabel {
   return ROW_LABELS.includes(value as RowLabel);
}

export function isRowPart(value: string): value is RowPart {
   return ROW_PARTS.includes(value as RowPart);
}

function tokenValue(date: Date, token: string): string {
   switch (token) {
      case "YYYY":
         return String(date.getFullYear());
      case "YY":
         return String(date.getFullYear()).slice(-2);
      case "MMMM":
         return date.toLocaleDateString(undefined, { month: "long" });
      case "MMM":
         return date.toLocaleDateString(undefined, { month: "short" });
      case "MM":
         return pad(date.getMonth() + 1);
      case "M":
         return String(date.getMonth() + 1);
      case "DD":
         return pad(date.getDate());
      case "D":
         return String(date.getDate());
      case "dddd":
         return date.toLocaleDateString(undefined, { weekday: "long" });
      case "ddd":
         return date.toLocaleDateString(undefined, { weekday: "short" });
      default:
         return token;
   }
}

function pad(value: number): string {
   return value < 10 ? `0${value}` : String(value);
}
