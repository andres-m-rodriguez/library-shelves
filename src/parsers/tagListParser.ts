export class TagListParser {
   parse(text: string): string[] {
      const seen = new Set<string>();
      const tags: string[] = [];
      for (const part of text.split(",")) {
         const tag = part.trim();
         const lower = tag.toLowerCase();
         if (tag && !seen.has(lower)) {
            seen.add(lower);
            tags.push(tag);
         }
      }
      return tags;
   }

   format(tags: string[]): string {
      return tags.join(", ");
   }
}
