import { CARD_STYLES, type CardStyle, GRAPH_DIRECTIONS, GRAPH_EDGES, type Point, SHELF_ACTIONS, type ShelfAction, type ShelfMessage, type ShelfRef } from "../contracts";

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
         case "resetLayout":
            return { type: value.type };
         case "cardStyle": {
            const style = this.cardStyle(value.style);
            return style ? { type: "cardStyle", style } : undefined;
         }
         case "link":
         case "unlink":
            return typeof value.prerequisite === "string" && typeof value.card === "string"
               ? { type: value.type, prerequisite: value.prerequisite, card: value.card }
               : undefined;
         case "positions": {
            const positions = this.positions(value.positions);
            return positions ? { type: "positions", positions } : undefined;
         }
         case "graphDirection": {
            const direction = GRAPH_DIRECTIONS.find((known) => known === value.value);
            return direction ? { type: "graphDirection", value: direction } : undefined;
         }
         case "graphEdges": {
            const edges = GRAPH_EDGES.find((known) => known === value.value);
            return edges ? { type: "graphEdges", value: edges } : undefined;
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

   // Card key to the center of its node. Anything that is not a finite pair is dropped.
   positions(value: unknown): Record<string, Point> | undefined {
      if (!isRecord(value)) {
         return undefined;
      }
      const positions: Record<string, Point> = {};
      for (const [key, raw] of Object.entries(value)) {
         if (isRecord(raw) && typeof raw.x === "number" && typeof raw.y === "number" && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
            positions[key] = { x: Math.round(raw.x), y: Math.round(raw.y) };
         }
      }
      return positions;
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
