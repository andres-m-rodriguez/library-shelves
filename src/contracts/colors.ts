export type ColorName = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray";

export type ColorSpec =
   | { kind: "named"; name: ColorName; themeId: string }
   | { kind: "themeId"; id: string };
