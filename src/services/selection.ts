import type * as vscode from "vscode";
import type { Card, Category, Node } from "../contracts";
import { none, option, some, type Option } from "../option";
import { nodeId } from "../tree/nodeId";

type NodeOf<K extends Node["kind"]> = Extract<Node, { kind: K }>;

export class Selection {
   constructor(private readonly view: vscode.TreeView<Node>) {}

   first(node: Option<Node>): Option<Node> {
      return node.some ? node : option(this.view.selection[0]);
   }

   targetsOf(node: Option<Node>): Node[] {
      const selection = dedupe(this.view.selection);
      if (!node.some) {
         return selection;
      }

      const clickedId = nodeId(node.value);
      return selection.some((n) => nodeId(n) === clickedId) ? selection : [node.value];
   }

   targetsOfKind<K extends Node["kind"]>(node: Option<Node>, kind: K): NodeOf<K>[] {
      const isKind = (n: Node): n is NodeOf<K> => n.kind === kind;
      if (node.some && !isKind(node.value)) {
         return [];
      }
      return this.targetsOf(node).filter(isKind);
   }

   cardOf(node: Option<Node>): Option<Card> {
      const target = this.first(node);
      if (!target.some) {
         return none;
      }
      switch (target.value.kind) {
         case "card":
            return some(target.value.card);
         case "lesson":
            return some(target.value.lesson.card);
         default:
            return none;
      }
   }

   categoryClicked(node: Option<Node>): Option<Category> {
      return node.some && node.value.kind === "category" ? some(node.value.category) : none;
   }

   categoryOf(node: Option<Node>): Option<Category> {
      return this.categoryClicked(this.first(node));
   }
}

function dedupe<T extends Node>(nodes: readonly T[]): T[] {
   const seen = new Set<string>();
   return nodes.filter((node) => {
      const id = nodeId(node);
      if (seen.has(id)) {
         return false;
      }
      seen.add(id);
      return true;
   });
}
