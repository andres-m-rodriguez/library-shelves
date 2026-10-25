export const TREE_MIME = "application/vnd.code.tree.libraryshelves";
export const URI_LIST_MIME = "text/uri-list";

export type DragRef =
   | { kind: "category"; json: string; name: string }
   | { kind: "card"; json: string; key: string }
   | { kind: "lesson"; json: string; cardKey: string; name: string };
