const ORDER_RE = /^\d+$/;

export class OrderParser {
   parse(text: string | undefined): number | undefined {
      const trimmed = text?.trim() ?? "";
      return ORDER_RE.test(trimmed) ? Number(trimmed) : undefined;
   }

   validate(text: string | undefined): string | undefined {
      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
         return undefined;
      }
      return ORDER_RE.test(trimmed) ? undefined : "A whole number, 0 or higher";
   }
}
