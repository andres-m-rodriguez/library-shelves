import { CARD_STYLES, type CardStyle, SHELF_ACTIONS, type ShelfAction, type ShelfMessage, type ShelfRef } from "../contracts";

export class ShelfMessageParser {
   parse(value: unknown): ShelfMessage | undefined {
      if (!isRecord(value)) {
         return undefined;
      }
      switch (value.type) {
         case "ready":
         case "newCard":
         case "newCategory":
         case "openText":
         case "background":
            return { type: value.type };
         case "cardStyle": {
            const style = this.cardStyle(value.style);
            return style ? { type: "cardStyle", style } : undefined;
         }
         case "action": {
            const ref = this.parseRef(value.ref);
            return ref && this.isAction(value.action) ? { type: "action", action: value.action, ref } : undefined;
         }
         default:
            return undefined;
      }
   }

   parseRef(value: unknown): ShelfRef | undefined {
      if (!isRecord(value)) {
         return undefined;
      }
      if (value.kind === "category" && typeof value.name === "string") {
         return { kind: "category", name: value.name };
      }
      if (value.kind === "card" && typeof value.key === "string") {
         return { kind: "card", key: value.key };
      }
      if (value.kind === "lesson" && typeof value.cardKey === "string" && typeof value.name === "string") {
         return { kind: "lesson", cardKey: value.cardKey, name: value.name };
      }
      return undefined;
   }

   cardStyle(value: unknown): CardStyle | undefined {
      return CARD_STYLES.find((known) => known === value);
   }

   private isAction(value: unknown): value is ShelfAction {
      return typeof value === "string" && (SHELF_ACTIONS as readonly string[]).includes(value);
   }
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null && !Array.isArray(value);
}
