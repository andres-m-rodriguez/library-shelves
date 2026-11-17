// The graph page of a library.shelf file: every card is a node and an arrow runs from a
// card to each card that builds on it. It is drawn by shelf.js, which owns the model,
// the search box, the filters and the menus, and hands them over as `app`.
(function () {
   const SVG_NS = "http://www.w3.org/2000/svg";

   // Node size follows the card style chosen for the shelves.
   const SIZES = {
      classic: { w: 190, h: 58 },
      reveal: { w: 164, h: 40 },
      cover: { w: 118, h: 128 },
   };
   const LAYER_GAP = 72; // between a card and what builds on it
   const SIBLING_GAP = 26; // between cards on the same level
   const CLICK_SLOP = 4; // pointer travel below this is a click, not a drag

   let fitNext = false;

   function svgEl(name, attrs) {
      const node = document.createElementNS(SVG_NS, name);
      for (const key in attrs) {
         node.setAttribute(key, attrs[key]);
      }
      return node;
   }

   function stem(fileName) {
      const dot = fileName.lastIndexOf(".");
      return dot > 0 ? fileName.slice(0, dot) : fileName;
   }

   // ---------- layout ----------

   // Cards with a saved position keep it. The rest are placed in levels: a card sits one
   // level after the deepest card it builds on, ordered to keep arrows short.
   function layout(entries, needs, size, direction) {
      const depth = new Map();
      const walking = new Set();
      const depthOf = (key) => {
         if (depth.has(key)) {
            return depth.get(key);
         }
         if (walking.has(key)) {
            return 0; // a loop written by hand; break it here
         }
         walking.add(key);
         let deepest = 0;
         for (const need of needs.get(key)) {
            deepest = Math.max(deepest, depthOf(need) + 1);
         }
         walking.delete(key);
         depth.set(key, deepest);
         return deepest;
      };

      const levels = [];
      for (const { card } of entries) {
         const level = depthOf(card.key);
         (levels[level] = levels[level] || []).push(card);
      }

      const down = direction !== "right";
      const span = down ? size.w : size.h; // extent across a level
      const step = (down ? size.h : size.w) + LAYER_GAP + (down ? 0 : 24);
      const across = new Map();
      const positions = new Map();
      levels.forEach((level, index) => {
         const weight = new Map(
            level.map((card, i) => {
               const placed = needs.get(card.key).filter((need) => across.has(need));
               const average = placed.length ? placed.reduce((sum, need) => sum + across.get(need), 0) / placed.length : 0;
               // Cards with nothing above them keep their library order.
               return [card.key, placed.length ? average : (i - level.length / 2) * (span + SIBLING_GAP)];
            }),
         );
         level.sort((a, b) => weight.get(a.key) - weight.get(b.key));
         const total = level.length * span + (level.length - 1) * SIBLING_GAP;
         let cursor = -total / 2 + span / 2;
         for (const card of level) {
            across.set(card.key, cursor);
            const auto = down ? { x: cursor, y: index * step } : { x: index * step, y: cursor };
            const saved = card.position;
            positions.set(card.key, saved ? { x: saved.x, y: saved.y } : { x: Math.round(auto.x), y: Math.round(auto.y) });
            cursor += span + SIBLING_GAP;
         }
      });
      return positions;
   }

   function edgePath(from, to, size, direction, shape) {
      const down = direction !== "right";
      const a = down ? { x: from.x, y: from.y + size.h / 2 } : { x: from.x + size.w / 2, y: from.y };
      const b = down ? { x: to.x, y: to.y - size.h / 2 - 3 } : { x: to.x - size.w / 2 - 3, y: to.y };
      if (shape === "straight") {
         return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
      }
      if (shape === "elbow") {
         if (down) {
            const mid = (a.y + b.y) / 2;
            return `M ${a.x} ${a.y} V ${mid} H ${b.x} V ${b.y}`;
         }
         const mid = (a.x + b.x) / 2;
         return `M ${a.x} ${a.y} H ${mid} V ${b.y} H ${b.x}`;
      }
      const reach = Math.max(34, Math.abs(down ? b.y - a.y : b.x - a.x) / 2);
      return down
         ? `M ${a.x} ${a.y} C ${a.x} ${a.y + reach}, ${b.x} ${b.y - reach}, ${b.x} ${b.y}`
         : `M ${a.x} ${a.y} C ${a.x + reach} ${a.y}, ${b.x - reach} ${b.y}, ${b.x} ${b.y}`;
   }

   // ---------- page ----------

   function render(app, host) {
      const model = app.model();
      const options = model.graph || { direction: "down", edges: "curved" };
      const style = SIZES[app.cardStyle()] ? app.cardStyle() : "classic";
      const size = SIZES[style];
      const entries = app.entries();
      const byKey = new Map(entries.map((entry) => [entry.card.key, entry]));

      host.replaceChildren();
      if (!entries.length) {
         app.setCount("");
         host.append(app.notice("No cards to draw.", "Add cards on the Shelves page, or change the filters."));
         return;
      }

      // Arrows only run between cards that are present after filtering.
      const needs = new Map();
      const neededBy = new Map(entries.map(({ card }) => [card.key, []]));
      for (const { card } of entries) {
         const present = card.dependsOn.filter((key) => key !== card.key && byKey.has(key));
         needs.set(card.key, present);
         for (const key of present) {
            neededBy.get(key).push(card.key);
         }
      }
      const edgeCount = [...needs.values()].reduce((sum, list) => sum + list.length, 0);

      // Searching keeps the matching cards, everything they build on and everything built on them.
      const terms = app.searchTerms();
      let matched = new Set();
      let visible = null;
      if (terms.length) {
         const query = terms.join(" ");
         let hits = entries.filter(({ card }) => [card.label, card.fileName, stem(card.fileName)].some((text) => text.toLowerCase() === query));
         if (!hits.length) {
            hits = entries.filter((entry) => app.cardMatches(entry.card, entry.category ? entry.category.name : "", terms));
         }
         matched = new Set(hits.map(({ card }) => card.key));
         visible = new Set();
         const spread = (next) => {
            const todo = [...matched];
            const seen = new Set(todo);
            while (todo.length) {
               const key = todo.pop();
               visible.add(key);
               for (const other of next.get(key)) {
                  if (!seen.has(other)) {
                     seen.add(other);
                     todo.push(other);
                  }
               }
            }
         };
         spread(needs);
         spread(neededBy);
      }
      const shown = (key) => !visible || visible.has(key);
      app.setCount(visible ? `${visible.size} of ${app.plural(entries.length, "card")}` : app.plural(entries.length, "card"));

      const positions = layout(entries, needs, size, options.direction);
      const view = app.graphView() || { x: 0, y: 0, k: 1 };
      const needsFit = fitNext || !app.graphView();
      fitNext = false;

      const page = app.el("div", "graph-page");
      const graph = app.el("div", `graph graph-${options.direction}`);
      const world = app.el("div", "graph-world");
      const svg = svgEl("svg", { class: "graph-edges", width: 1, height: 1 });
      const defs = svgEl("defs", {});
      const marker = svgEl("marker", { id: "graph-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      marker.append(svgEl("path", { class: "gedge-head", d: "M 0 0 L 10 5 L 0 10 z" }));
      defs.append(marker);
      const edgeLayer = svgEl("g", {});
      const dragLine = svgEl("path", { class: "gedge gedge-new", "marker-end": "url(#graph-arrow)" });
      dragLine.style.display = "none";
      svg.append(defs, edgeLayer, dragLine);
      world.append(svg);
      graph.append(world);

      function applyView() {
         world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
      }

      function drawEdges() {
         edgeLayer.replaceChildren();
         for (const { card } of entries) {
            if (!shown(card.key)) {
               continue;
            }
            for (const need of needs.get(card.key)) {
               if (!shown(need)) {
                  continue;
               }
               const d = edgePath(positions.get(need), positions.get(card.key), size, options.direction, options.edges);
               const group = svgEl("g", { class: "gedge-group", "data-from": need, "data-to": card.key });
               const title = svgEl("title", {});
               title.textContent = `${card.label} builds on ${byKey.get(need).card.label}. Right-click to remove.`;
               group.append(title, svgEl("path", { class: "gedge", d, "marker-end": "url(#graph-arrow)" }), svgEl("path", { class: "gedge-hit", d }));
               group.addEventListener("contextmenu", (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  app.showMenu(event.clientX, event.clientY, [
                     { label: "Remove Dependency", run: () => app.post({ type: "unlink", prerequisite: need, card: card.key }) },
                  ]);
               });
               edgeLayer.append(group);
            }
         }
      }

      function light(key, on) {
         for (const group of edgeLayer.children) {
            if (group.dataset.from === key || group.dataset.to === key) {
               group.classList.toggle("lit", on);
            }
         }
      }

      const nodeEls = new Map();
      function place(node, key) {
         const at = positions.get(key);
         node.style.left = `${at.x - size.w / 2}px`;
         node.style.top = `${at.y - size.h / 2}px`;
      }

      for (const { card, category } of entries) {
         if (!shown(card.key)) {
            continue;
         }
         const node = app.el("div", `gnode gnode-${style}` + (matched.has(card.key) ? " matched" : "") + (card.exists ? "" : " missing"));
         node.dataset.key = card.key;
         node.tabIndex = 0;
         node.style.width = `${size.w}px`;
         node.style.height = `${size.h}px`;
         const color = app.colorOf(card, category);
         if (color) {
            node.style.setProperty("--accent", color);
         }
         node.title = [card.label, card.description, "Click to open. Drag to move. Drag the dot onto a card that builds on this one."].filter(Boolean).join("\n");

         const lessons = card.lessons.length ? app.plural(card.lessons.length, "lesson") : "No lessons";
         if (style === "cover") {
            node.append(app.el("div", "gnode-initial", (card.label.trim()[0] || "?").toUpperCase()), app.el("div", "gnode-title", card.label));
         } else if (style === "reveal") {
            const more = app.el("div", "gnode-more");
            more.append(app.el("div", "", card.description || card.fileName), app.el("div", "gnode-sub", lessons));
            node.append(app.el("div", "gnode-title", card.label), more);
         } else {
            node.append(app.el("div", "gnode-title", card.label), app.el("div", "gnode-sub", lessons));
         }
         node.append(app.el("span", "gnode-handle"));

         node.addEventListener("pointerenter", () => light(card.key, true));
         node.addEventListener("pointerleave", () => light(card.key, false));
         node.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
               app.openCard(card.key);
            }
         });
         node.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            app.showMenu(event.clientX, event.clientY, app.cardMenu(card, { kind: "card", key: card.key }));
         });
         place(node, card.key);
         world.append(node);
         nodeEls.set(card.key, node);
      }

      function fit() {
         const box = graph.getBoundingClientRect();
         const keys = [...nodeEls.keys()];
         if (!keys.length || !box.width || !box.height) {
            return;
         }
         const xs = keys.map((key) => positions.get(key).x);
         const ys = keys.map((key) => positions.get(key).y);
         const minX = Math.min(...xs) - size.w / 2;
         const maxX = Math.max(...xs) + size.w / 2;
         const minY = Math.min(...ys) - size.h / 2;
         const maxY = Math.max(...ys) + size.h / 2;
         view.k = Math.max(0.2, Math.min(box.width / (maxX - minX + 90), box.height / (maxY - minY + 110), 1.15));
         view.x = box.width / 2 - ((minX + maxX) / 2) * view.k;
         view.y = box.height / 2 - ((minY + maxY) / 2) * view.k;
         applyView();
         app.setGraphView(view);
      }

      // ---------- pointer: move a card, pan, or pull a new arrow ----------

      let drag = null;
      const toWorld = (event) => {
         const box = graph.getBoundingClientRect();
         return { x: (event.clientX - box.left - view.x) / view.k, y: (event.clientY - box.top - view.y) / view.k };
      };

      graph.addEventListener("pointerdown", (event) => {
         if (event.button !== 0) {
            return;
         }
         const node = event.target.closest(".gnode");
         const mode = event.target.closest(".gnode-handle") ? "link" : node ? "node" : "pan";
         drag = { mode, key: node ? node.dataset.key : "", x: event.clientX, y: event.clientY, travel: 0 };
         graph.setPointerCapture(event.pointerId);
         graph.classList.add("dragging");
         if (mode === "link") {
            dragLine.style.display = "";
         }
      });

      graph.addEventListener("pointermove", (event) => {
         if (!drag) {
            return;
         }
         const dx = event.clientX - drag.x;
         const dy = event.clientY - drag.y;
         drag.x = event.clientX;
         drag.y = event.clientY;
         drag.travel += Math.abs(dx) + Math.abs(dy);
         if (drag.mode === "pan") {
            view.x += dx;
            view.y += dy;
            applyView();
         } else if (drag.mode === "node" && drag.travel > CLICK_SLOP) {
            const at = positions.get(drag.key);
            at.x += dx / view.k;
            at.y += dy / view.k;
            place(nodeEls.get(drag.key), drag.key);
            drawEdges();
         } else if (drag.mode === "link") {
            const from = positions.get(drag.key);
            const to = toWorld(event);
            dragLine.setAttribute("d", `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
         }
      });

      function endDrag(event) {
         if (!drag) {
            return;
         }
         const done = drag;
         drag = null;
         graph.classList.remove("dragging");
         dragLine.style.display = "none";
         if (done.mode === "pan") {
            app.setGraphView(view);
         } else if (done.mode === "node") {
            if (done.travel <= CLICK_SLOP) {
               app.openCard(done.key);
               return;
            }
            // Every card's place is saved, so the ones that were never dragged stay put too.
            const all = {};
            for (const [key, at] of positions) {
               all[key] = { x: Math.round(at.x), y: Math.round(at.y) };
            }
            app.post({ type: "positions", positions: all });
         } else if (done.mode === "link" && event.type === "pointerup") {
            const under = document.elementFromPoint(event.clientX, event.clientY);
            const target = under ? under.closest(".gnode") : null;
            if (target && target.dataset.key !== done.key) {
               app.post({ type: "link", prerequisite: done.key, card: target.dataset.key });
            }
         }
      }
      graph.addEventListener("pointerup", endDrag);
      graph.addEventListener("pointercancel", endDrag);

      graph.addEventListener(
         "wheel",
         (event) => {
            event.preventDefault();
            const box = graph.getBoundingClientRect();
            const px = event.clientX - box.left;
            const py = event.clientY - box.top;
            const k = Math.min(2.5, Math.max(0.2, view.k * Math.exp(-event.deltaY * 0.0015)));
            view.x = px - ((px - view.x) / view.k) * k;
            view.y = py - ((py - view.y) / view.k) * k;
            view.k = k;
            applyView();
            app.setGraphView(view);
         },
         { passive: false },
      );

      // ---------- tools ----------

      const tools = app.el("div", "graph-tools");
      const select = (label, choices, current, onChange) => {
         const node = app.el("select", "");
         node.title = label;
         node.setAttribute("aria-label", label);
         for (const [value, text] of choices) {
            const option = app.el("option", "", text);
            option.value = value;
            node.append(option);
         }
         node.value = current;
         node.addEventListener("change", () => onChange(node.value));
         return node;
      };
      tools.append(
         app.button("btn", "Fit", "Fit every card in view", fit),
         app.button("btn", "Auto Layout", "Forget dragged positions and arrange the cards again", () => {
            fitNext = true;
            app.post({ type: "resetLayout" });
            // Nothing was saved yet when no card had been dragged, so no update comes back.
            if (!entries.some(({ card }) => card.position)) {
               fit();
            }
         }),
         select("Direction of the arrows", [["down", "Top to bottom"], ["right", "Left to right"]], options.direction, (value) => {
            fitNext = true;
            app.post({ type: "graphDirection", value });
         }),
         select("Shape of the arrows", [["curved", "Curved arrows"], ["straight", "Straight arrows"], ["elbow", "Elbow arrows"]], options.edges, (value) => {
            app.post({ type: "graphEdges", value });
         }),
      );

      page.append(graph, tools);
      if (!edgeCount) {
         page.append(app.el("div", "graph-hint", "No card depends on another yet. Hover a card and drag its dot onto the card that builds on it, or right-click a card and choose Set Dependencies."));
      }
      host.append(page);

      drawEdges();
      if (needsFit) {
         fit();
      } else {
         applyView();
      }
   }

   window.ShelfGraph = {
      render,
      requestFit() {
         fitNext = true;
      },
   };
})();
