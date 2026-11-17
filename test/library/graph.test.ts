import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { CardMeta } from "../../src/contracts";
import { dependenciesOf, dependencyMap, dependentsOf, positionOf, prerequisitesOf, wouldCycle } from "../../src/library/graph";
import { LibraryFileParser } from "../../src/parsers/libraryFileParser";
import { ShelfMessageParser } from "../../src/parsers/shelfMessageParser";

// Variables <- Scopes <- If <- Recursion, and Scopes <- For
const COURSE: [string, CardMeta][] = [
   ["Variables.md", {}],
   ["Scopes.md", { dependsOn: ["Variables.md"] }],
   ["If.md", { dependsOn: ["Scopes.md"] }],
   ["For.md", { dependsOn: ["Scopes.md"] }],
   ["Recursion.md", { dependsOn: ["If.md"] }],
];

describe("dependenciesOf", () => {
   test("returns the listed card keys once each", () => {
      assert.deepEqual(dependenciesOf({ dependsOn: ["a.md", "b.md", "a.md"] }), ["a.md", "b.md"]);
   });

   test("ignores anything that is not a usable key", () => {
      const meta = { dependsOn: ["a.md", 3, "", "  ", null] } as unknown as CardMeta;
      assert.deepEqual(dependenciesOf(meta), ["a.md"]);
      assert.deepEqual(dependenciesOf({}), []);
      assert.deepEqual(dependenciesOf({ dependsOn: "a.md" } as unknown as CardMeta), []);
   });
});

describe("positionOf", () => {
   test("returns a finite pair", () => {
      assert.deepEqual(positionOf({ position: { x: 10, y: -4 } }), { x: 10, y: -4 });
   });

   test("returns undefined for anything else", () => {
      assert.equal(positionOf({}), undefined);
      assert.equal(positionOf({ position: { x: 1 } } as unknown as CardMeta), undefined);
      assert.equal(positionOf({ position: { x: "1", y: 2 } } as unknown as CardMeta), undefined);
      assert.equal(positionOf({ position: { x: Infinity, y: 2 } }), undefined);
      assert.equal(positionOf({ position: [1, 2] } as unknown as CardMeta), undefined);
      assert.equal(positionOf({ position: null } as unknown as CardMeta), undefined);
   });
});

describe("prerequisitesOf and dependentsOf", () => {
   const dependencies = dependencyMap(COURSE);

   test("prerequisites follow the chain upward", () => {
      assert.deepEqual([...prerequisitesOf(dependencies, "Recursion.md")].sort(), ["If.md", "Scopes.md", "Variables.md"]);
      assert.deepEqual([...prerequisitesOf(dependencies, "Variables.md")], []);
   });

   test("dependents follow the chain downward", () => {
      assert.deepEqual([...dependentsOf(dependencies, "Scopes.md")].sort(), ["For.md", "If.md", "Recursion.md"]);
      assert.deepEqual([...dependentsOf(dependencies, "Recursion.md")], []);
   });

   test("a loop written by hand does not hang", () => {
      const loop = dependencyMap([
         ["a.md", { dependsOn: ["b.md"] }],
         ["b.md", { dependsOn: ["a.md"] }],
      ]);
      assert.deepEqual([...prerequisitesOf(loop, "a.md")].sort(), ["a.md", "b.md"]);
   });
});

describe("wouldCycle", () => {
   const dependencies = dependencyMap(COURSE);

   test("a card cannot depend on itself", () => {
      assert.equal(wouldCycle(dependencies, "If.md", "If.md"), true);
   });

   test("a card cannot depend on something that already builds on it", () => {
      assert.equal(wouldCycle(dependencies, "Recursion.md", "Scopes.md"), true);
      assert.equal(wouldCycle(dependencies, "If.md", "Scopes.md"), true);
   });

   test("unrelated cards and forward links are fine", () => {
      assert.equal(wouldCycle(dependencies, "For.md", "Recursion.md"), false);
      assert.equal(wouldCycle(dependencies, "Variables.md", "Recursion.md"), false);
   });
});

describe("graph settings and messages", () => {
   const files = new LibraryFileParser();
   const messages = new ShelfMessageParser();

   test("$graph is read and is not a card", () => {
      const { value, issues } = files.parse(`{ "$graph": { "direction": "right", "edges": "elbow" }, "a.md": {} }`);
      assert.deepEqual(value.graph, { direction: "right", edges: "elbow" });
      assert.deepEqual(Object.keys(value.cards), ["a.md"]);
      assert.deepEqual(issues, []);
   });

   test("unknown graph settings are dropped", () => {
      assert.deepEqual(files.graphOf({ $graph: { direction: "up", edges: "wavy" } }), {});
   });

   test("positions are rounded and bad entries dropped", () => {
      const parsed = messages.parse({ type: "positions", positions: { "a.md": { x: 1.6, y: -2.2 }, "b.md": { x: "1", y: 2 }, "c.md": 5 } });
      assert.deepEqual(parsed, { type: "positions", positions: { "a.md": { x: 2, y: -2 } } });
   });

   test("links need both ends and options need known values", () => {
      assert.deepEqual(messages.parse({ type: "link", prerequisite: "a.md", card: "b.md" }), { type: "link", prerequisite: "a.md", card: "b.md" });
      assert.equal(messages.parse({ type: "unlink", prerequisite: "a.md" }), undefined);
      assert.deepEqual(messages.parse({ type: "graphDirection", value: "right" }), { type: "graphDirection", value: "right" });
      assert.equal(messages.parse({ type: "graphDirection", value: "up" }), undefined);
      assert.deepEqual(messages.parse({ type: "graphEdges", value: "straight" }), { type: "graphEdges", value: "straight" });
      assert.deepEqual(messages.parse({ type: "resetLayout" }), { type: "resetLayout" });
   });
});
