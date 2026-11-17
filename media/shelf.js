// The page behind a library.shelf file. It draws the model the extension sends and
// posts back what the person asked for; it never reads or writes files itself.
//
// There are three pages: the shelves (every category with its cards as tiles), the graph
// (the same cards as nodes, with arrows for what builds on what; drawn by graph.js) and a
// card page (one card with its lessons), reached by clicking a tile or a node.
(function () {
   const vscode = acquireVsCodeApi();

   const shelvesEl = document.getElementById("shelves");
   const search = document.getElementById("search");
   const countEl = document.getElementById("count");
   const menuEl = document.getElementById("menu");

   const saved = vscode.getState() || {};
   const savedView = saved.view || {};
   // "home" is the overview a card page returns to: the shelves or the graph.
   let home = saved.home === "graph" ? "graph" : "shelves";
   let view = savedView.page === "card" && typeof savedView.key === "string" ? { page: "card", key: savedView.key } : { page: home };
   let graphView = saved.graphView && Number.isFinite(saved.graphView.k) ? saved.graphView : null;
   const queries = { shelves: typeof saved.query === "string" ? saved.query : "", card: "" };

   const filterButton = document.getElementById("filter");
   const filterCount = document.getElementById("filter-count");
   const filterPanel = document.getElementById("filter-panel");
   const filterBar = document.getElementById("filter-bar");

   // What the search box looks at, and which cards are shown at all. Inside one group any
   // selected value is enough; across groups every group has to agree.
   const UNCATEGORIZED = "";
   const FIELDS = [
      ["names", "Names and categories"],
      ["descriptions", "Descriptions"],
      ["lessons", "Lessons"],
      ["tags", "Tags"],
   ];
   const GROUPS = [
      ["categories", "Category"],
      ["colors", "Color"],
      ["tags", "Tag"],
   ];
   const filters = loadFilters(saved.filters || {});

   let model = null;
   let shelvesScroll = 0;

   function loadFilters(raw) {
      const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
      const fields = raw.fields || {};
      const loaded = { categories: strings(raw.categories), colors: strings(raw.colors), tags: strings(raw.tags), fields: {} };
      for (const [key] of FIELDS) {
         loaded.fields[key] = fields[key] !== false;
      }
      return loaded;
   }

   function saveState() {
      vscode.setState({ view, home, graphView, query: queries.shelves, filters });
   }

   function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) {
         node.className = className;
      }
      if (text) {
         node.textContent = text;
      }
      return node;
   }

   function plural(count, noun) {
      return `${count} ${noun}${count === 1 ? "" : "s"}`;
   }

   function act(action, ref) {
      vscode.postMessage({ type: "action", action, ref });
   }

   function accent(node, color) {
      if (color) {
         node.style.setProperty("--accent", color);
      }
   }

   function terms(text) {
      return text.toLowerCase().split(/\s+/).filter(Boolean);
   }

   function matchesAll(parts, wanted) {
      const haystack = parts.join("\n").toLowerCase();
      return wanted.every((term) => haystack.includes(term));
   }

   // ---------- model lookups ----------

   function allShelves() {
      const shelves = model.categories.map((category) => ({ category, cards: category.cards }));
      if (model.uncategorized.length) {
         shelves.push({ category: null, cards: model.uncategorized });
      }
      return shelves;
   }

   function findCard(key) {
      for (const shelf of allShelves()) {
         const index = shelf.cards.findIndex((card) => card.key === key);
         if (index >= 0) {
            return { card: shelf.cards[index], category: shelf.category, siblings: shelf.cards, index };
         }
      }
      return null;
   }

   // ---------- navigation ----------

   function openCardPage(key) {
      if (view.page === "shelves") {
         shelvesScroll = shelvesEl.scrollTop;
      }
      if (view.page !== "card") {
         home = view.page;
      }
      view = { page: "card", key };
      queries.card = "";
      saveState();
      render();
      shelvesEl.scrollTop = 0;
   }

   function backToShelves() {
      view = { page: home };
      saveState();
      render();
      shelvesEl.scrollTop = home === "shelves" ? shelvesScroll : 0;
   }

   function showHome(page) {
      if (view.page === page) {
         return;
      }
      if (view.page === "shelves") {
         shelvesScroll = shelvesEl.scrollTop;
      }
      home = page;
      view = { page };
      saveState();
      render();
      shelvesEl.scrollTop = page === "shelves" ? shelvesScroll : 0;
   }

   // ---------- rendering ----------

   function render() {
      hideMenu();
      shelvesEl.replaceChildren();
      countEl.textContent = "";
      filterBar.hidden = true;
      filterButton.hidden = !model || !model.inWorkspace || view.page === "card";
      shelvesEl.classList.toggle("graph-mode", view.page === "graph" && !filterButton.hidden);
      for (const page of ["shelves", "graph"]) {
         const tab = document.getElementById(`page-${page}`);
         const current = view.page === "card" ? home : view.page;
         tab.setAttribute("aria-selected", String(page === current));
      }
      document.getElementById("card-style").hidden = filterButton.hidden;
      if (filterButton.hidden) {
         hideFilterPanel();
      }
      if (!model) {
         return;
      }
      if (!model.inWorkspace) {
         shelvesEl.append(notice("This file is outside the open folder.", "Open the folder that contains it so the Library can read its cards."));
         return;
      }
      if (view.page === "card") {
         const found = findCard(view.key);
         if (found) {
            search.placeholder = "Search the lessons of this card";
            search.value = queries.card;
            renderCardPage(found);
            return;
         }
         // The card was removed or renamed while its page was open.
         view = { page: home };
         saveState();
      }
      if (view.page === "graph") {
         search.placeholder = "Search a card to see what it builds on and what builds on it";
         search.value = queries.shelves;
         pruneFilters();
         window.ShelfGraph.render(app, shelvesEl);
         renderFilterBar();
         if (!filterPanel.hidden) {
            renderFilterPanel();
         }
         return;
      }
      search.placeholder = "Search cards and lessons";
      search.value = queries.shelves;
      renderShelves();
   }

   function notice(title, hint) {
      const box = el("div", "notice");
      box.append(el("p", "notice-title", title), el("p", "notice-hint", hint));
      return box;
   }

   function button(className, text, title, onClick) {
      const node = el("button", className, text);
      if (title) {
         node.title = title;
         node.setAttribute("aria-label", title);
      }
      node.addEventListener("click", (event) => {
         event.stopPropagation();
         onClick(event);
      });
      return node;
   }

   function iconButton(symbol, title, onClick) {
      return button("icon", symbol, title, onClick);
   }

   // ---------- shelves page ----------

   function renderShelves() {
      const wanted = terms(queries.shelves);
      const shelves = allShelves();
      pruneFilters();
      const narrowing = wanted.length > 0 || selectedCount() > 0;
      let total = 0;
      let shown = 0;
      for (const shelf of shelves) {
         const name = shelf.category ? shelf.category.name : "";
         const visible = shelf.cards.filter((card) => cardPasses(card, shelf.category) && cardMatches(card, name, wanted));
         total += shelf.cards.length;
         shown += visible.length;
         if (narrowing && !visible.length) {
            continue;
         }
         shelvesEl.append(renderShelf(shelf.category, visible));
      }

      countEl.textContent = narrowing ? `${shown} of ${plural(total, "card")}` : plural(total, "card");
      if (!shelves.length) {
         shelvesEl.append(notice("This library is empty.", "Use New Card to add a file, or New Category to start a shelf."));
      } else if (narrowing && !shown) {
         shelvesEl.append(notice("Nothing matches the search and filters.", "Clear the search box, or change the filters with the funnel button."));
      }
      renderFilterBar();
      if (!filterPanel.hidden) {
         renderFilterPanel();
      }
   }

   function cardMatches(card, categoryName, wanted) {
      if (!wanted.length) {
         return true;
      }
      const { fields } = filters;
      const parts = [];
      if (fields.names) {
         parts.push(card.label, card.fileName, card.key, categoryName);
      }
      if (fields.descriptions) {
         parts.push(card.description);
      }
      for (const lesson of card.lessons) {
         if (fields.lessons) {
            parts.push(lesson.label, lesson.name, lesson.detail);
         }
         if (fields.tags) {
            parts.push(...lesson.tags);
         }
      }
      return matchesAll(parts, wanted);
   }

   // ---------- filters ----------

   // A card without a color of its own takes the color of its shelf.
   function colorOf(card, category) {
      return card.color || (category ? category.color : "");
   }

   function colorLabel(css) {
      const id = css.replace(/^var\(--vscode-/, "").replace(/\)$/, "");
      if (id === "descriptionForeground") {
         return "gray";
      }
      return id.startsWith("charts-") ? id.slice("charts-".length) : id;
   }

   function filterOptions() {
      const categories = model.categories.map((category) => category.name);
      if (model.uncategorized.length) {
         categories.push(UNCATEGORIZED);
      }
      const colors = new Set();
      const tags = new Set();
      for (const shelf of allShelves()) {
         for (const card of shelf.cards) {
            const color = colorOf(card, shelf.category);
            if (color) {
               colors.add(color);
            }
            for (const lesson of card.lessons) {
               lesson.tags.forEach((tag) => tags.add(tag));
            }
         }
      }
      return { categories, colors: [...colors], tags: [...tags].sort((a, b) => a.localeCompare(b)) };
   }

   // Drops selections that no longer exist, for example after a category was renamed.
   function pruneFilters() {
      const options = filterOptions();
      for (const [group] of GROUPS) {
         const kept = filters[group].filter((value) => options[group].includes(value));
         if (kept.length !== filters[group].length) {
            filters[group] = kept;
            saveState();
         }
      }
   }

   function selectedCount() {
      return filters.categories.length + filters.colors.length + filters.tags.length;
   }

   function fieldsNarrowed() {
      return FIELDS.some(([key]) => !filters.fields[key]);
   }

   function cardPasses(card, category) {
      if (filters.categories.length && !filters.categories.includes(category ? category.name : UNCATEGORIZED)) {
         return false;
      }
      if (filters.colors.length && !filters.colors.includes(colorOf(card, category))) {
         return false;
      }
      if (filters.tags.length && !card.lessons.some((lesson) => lesson.tags.some((tag) => filters.tags.includes(tag)))) {
         return false;
      }
      return true;
   }

   function valueLabel(group, value) {
      if (group === "categories") {
         return value === UNCATEGORIZED ? "Uncategorized" : value;
      }
      return group === "colors" ? colorLabel(value) : value;
   }

   function toggleValue(group, value) {
      const list = filters[group];
      const index = list.indexOf(value);
      if (index >= 0) {
         list.splice(index, 1);
      } else {
         list.push(value);
      }
      saveState();
      render();
   }

   function clearFilters() {
      for (const [group] of GROUPS) {
         filters[group] = [];
      }
      for (const [key] of FIELDS) {
         filters.fields[key] = true;
      }
      saveState();
      render();
   }

   function chip(text, pressed, color, onClick) {
      const node = el("button", "chip");
      node.setAttribute("aria-pressed", String(pressed));
      if (color) {
         const swatch = el("span", "chip-swatch");
         swatch.style.setProperty("--accent", color);
         node.append(swatch);
      }
      node.append(el("span", "", text));
      node.addEventListener("click", onClick);
      return node;
   }

   function renderFilterPanel() {
      const focused = document.activeElement && filterPanel.contains(document.activeElement) ? document.activeElement.dataset.id : null;
      const options = filterOptions();
      filterPanel.replaceChildren();

      const searchIn = el("div", "filter-group");
      searchIn.append(el("div", "filter-title", "Search in"));
      const fieldChips = el("div", "chips");
      for (const [key, label] of FIELDS) {
         const node = chip(label, filters.fields[key], "", () => {
            const others = FIELDS.some(([other]) => other !== key && filters.fields[other]);
            // The search has to look somewhere, so the last one stays on.
            if (filters.fields[key] && !others) {
               return;
            }
            filters.fields[key] = !filters.fields[key];
            saveState();
            render();
         });
         node.dataset.id = `field:${key}`;
         fieldChips.append(node);
      }
      searchIn.append(fieldChips);
      filterPanel.append(searchIn);

      for (const [group, title] of GROUPS) {
         if (!options[group].length) {
            continue;
         }
         const box = el("div", "filter-group");
         box.append(el("div", "filter-title", `Show only: ${title.toLowerCase()}`));
         const chips = el("div", "chips");
         for (const value of options[group]) {
            const node = chip(valueLabel(group, value), filters[group].includes(value), group === "colors" ? value : "", () => toggleValue(group, value));
            node.dataset.id = `${group}:${value}`;
            chips.append(node);
         }
         box.append(chips);
         filterPanel.append(box);
      }

      const foot = el("div", "filter-foot");
      const clear = button("link", "Clear all filters", "", clearFilters);
      clear.dataset.id = "clear";
      clear.disabled = !selectedCount() && !fieldsNarrowed();
      foot.append(clear);
      filterPanel.append(foot);

      // Clicking a chip redraws the panel; put the focus back where it was.
      if (focused) {
         const again = [...filterPanel.querySelectorAll("button")].find((node) => node.dataset.id === focused);
         if (again) {
            again.focus();
         }
      }
   }

   function renderFilterBar() {
      const count = selectedCount() + (fieldsNarrowed() ? 1 : 0);
      filterCount.textContent = count ? String(count) : "";
      filterButton.classList.toggle("active", count > 0);
      filterBar.replaceChildren();
      filterBar.hidden = count === 0;
      if (!count) {
         return;
      }
      for (const [group, title] of GROUPS) {
         for (const value of filters[group]) {
            const label = `${title}: ${valueLabel(group, value)}`;
            const node = chip(`${label} ×`, true, group === "colors" ? value : "", () => toggleValue(group, value));
            node.title = `Remove the filter ${label}`;
            filterBar.append(node);
         }
      }
      if (fieldsNarrowed()) {
         const names = FIELDS.filter(([key]) => filters.fields[key]).map(([, label]) => label.toLowerCase());
         filterBar.append(el("span", "filter-note", `Searching only ${names.join(", ")}`));
      }
      filterBar.append(button("link", "Clear", "Clear all filters", clearFilters));
   }

   function showFilterPanel() {
      renderFilterPanel();
      filterPanel.hidden = false;
      filterButton.setAttribute("aria-expanded", "true");
      const anchor = filterButton.getBoundingClientRect();
      const box = filterPanel.getBoundingClientRect();
      filterPanel.style.left = `${Math.max(4, Math.min(anchor.left, window.innerWidth - box.width - 4))}px`;
      filterPanel.style.top = `${anchor.bottom + 4}px`;
      const first = filterPanel.querySelector("button");
      if (first) {
         first.focus();
      }
   }

   function hideFilterPanel() {
      filterPanel.hidden = true;
      filterButton.setAttribute("aria-expanded", "false");
   }

   filterButton.addEventListener("click", () => {
      if (filterPanel.hidden) {
         showFilterPanel();
      } else {
         hideFilterPanel();
      }
   });
   filterPanel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
         event.stopPropagation();
         hideFilterPanel();
         filterButton.focus();
      }
   });
   document.addEventListener("pointerdown", (event) => {
      if (!filterPanel.hidden && !filterPanel.contains(event.target) && !filterButton.contains(event.target)) {
         hideFilterPanel();
      }
   });
   window.addEventListener("resize", hideFilterPanel);

   function renderShelf(category, cards) {
      const section = el("section", "shelf");
      const head = el("header", "shelf-head");
      accent(section, category ? category.color : "");

      head.append(el("span", "swatch"), el("h2", "", category ? category.name : "Uncategorized"));
      if (category && category.description) {
         head.append(el("span", "shelf-desc", category.description));
      }
      head.append(el("span", "shelf-count", plural(cards.length, "card")), el("span", "spacer"));

      if (category) {
         const ref = { kind: "category", name: category.name };
         head.append(
            iconButton("+", `New card in ${category.name}`, () => act("newCard", ref)),
            iconButton("⋯", `More actions for ${category.name}`, (event) => menuAtElement(event.currentTarget, categoryMenu(ref))),
         );
         head.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            showMenu(event.clientX, event.clientY, categoryMenu(ref));
         });
      } else {
         head.append(iconButton("+", "New card", () => vscode.postMessage({ type: "newCard" })));
      }

      const tiles = el("div", "tiles");
      for (const card of cards) {
         tiles.append(renderTile(card, category));
      }
      if (!cards.length) {
         tiles.append(el("p", "shelf-empty", "No cards on this shelf yet."));
      }
      section.append(head, tiles);
      return section;
   }

   // The same elements serve every card style; the style sheet decides what shows and how.
   function renderTile(card, category) {
      const ref = { kind: "card", key: card.key };
      const tile = el("article", "tile" + (card.exists ? "" : " missing"));
      tile.tabIndex = 0;
      tile.setAttribute("role", "link");
      const hint = card.exists ? "Click to see its lessons" : "The library lists this card, but the file does not exist";
      tile.title = [card.label, card.description, hint].filter(Boolean).join("\n");
      // A card without a color of its own takes the color of its shelf, as on the graph.
      accent(tile, colorOf(card, category));

      // Only the cover style shows this: the card's initial on its own or its shelf's color.
      const cover = el("div", "tile-cover", (card.label.trim()[0] || "?").toUpperCase());
      cover.setAttribute("aria-hidden", "true");
      const coverColor = colorOf(card, category);
      if (coverColor) {
         tile.style.setProperty("--cover", coverColor);
      }
      tile.append(cover);

      const head = el("div", "tile-head");
      head.append(
         el("div", "tile-title", card.label),
         iconButton("⋯", `More actions for ${card.label}`, (event) => menuAtElement(event.currentTarget, cardMenu(card, ref))),
      );
      tile.append(head);
      if (card.label !== card.fileName) {
         tile.append(el("div", "tile-file", card.fileName));
      }
      if (card.description) {
         tile.append(el("p", "tile-desc", card.description));
      }

      const foot = el("div", "tile-foot");
      foot.append(el("span", "", card.lessons.length ? plural(card.lessons.length, "lesson") : "No lessons"));
      if (!card.exists) {
         foot.append(el("span", "badge", "missing"));
      }
      tile.append(foot);

      tile.addEventListener("click", (event) => {
         if (!event.target.closest("button")) {
            openCardPage(card.key);
         }
      });
      tile.addEventListener("keydown", (event) => {
         if (event.target === tile && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openCardPage(card.key);
         }
      });
      tile.addEventListener("contextmenu", (event) => {
         event.preventDefault();
         showMenu(event.clientX, event.clientY, cardMenu(card, ref));
      });
      return tile;
   }

   // ---------- card page ----------

   function renderCardPage({ card, category, siblings, index }) {
      const ref = { kind: "card", key: card.key };
      const page = el("section", "card-page");
      accent(page, card.color || (category ? category.color : ""));

      const crumbs = el("nav", "crumbs");
      crumbs.append(
         button("link", home === "graph" ? "← Graph" : "← Library", home === "graph" ? "Back to the graph (Escape)" : "Back to the shelves (Escape)", backToShelves),
         el("span", "crumb-sep", "/"),
         el("span", "", category ? category.name : "Uncategorized"),
         el("span", "crumb-sep", "/"),
         el("span", "crumb-current", card.label),
      );

      const head = el("header", "card-head");
      head.append(el("h1", "", card.label));
      if (card.label !== card.fileName) {
         head.append(el("div", "card-file", card.fileName));
      }
      if (card.description) {
         head.append(el("p", "card-desc", card.description));
      }
      if (!card.exists) {
         head.append(el("p", "card-missing", "The library lists this card, but the file does not exist."));
      }

      const actions = el("div", "card-actions");
      actions.append(button("btn primary", "Open Card", "", () => act("open", ref)));
      if (card.runnable) {
         actions.append(button("btn", "Run", "", () => act("run", ref)));
      }
      actions.append(
         button("btn", "Add Lessons", "Add existing files as lessons", () => act("addLesson", ref)),
         button("btn", "New Lesson File", "Create a new file and add it as a lesson", () => act("newLessonFile", ref)),
         iconButton("⋯", `More actions for ${card.label}`, (event) => menuAtElement(event.currentTarget, cardMenu(card, ref))),
      );

      const relations = renderRelations(card);

      const wanted = terms(queries.card);
      const visible = card.lessons
         .map((lesson, i) => ({ lesson, number: i + 1 }))
         .filter(({ lesson }) => !wanted.length || matchesAll([lesson.label, lesson.name, lesson.detail, ...lesson.tags], wanted));
      countEl.textContent = wanted.length ? `${visible.length} of ${plural(card.lessons.length, "lesson")}` : plural(card.lessons.length, "lesson");

      const heading = el("h2", "lessons-heading", "Lessons");
      const list = el("ol", "lesson-list");
      for (const { lesson, number } of visible) {
         list.append(renderLessonRow(card, lesson, number));
      }

      page.append(crumbs, head, actions);
      if (relations) {
         page.append(relations);
      }
      page.append(heading, list);
      if (!card.lessons.length) {
         page.append(el("p", "lessons-empty", "This card has no lessons yet. Use Add Lessons or New Lesson File above."));
      } else if (!visible.length) {
         page.append(el("p", "lessons-empty", "No lesson matches the search."));
      }

      const pager = el("footer", "pager");
      const previous = siblings[index - 1];
      const next = siblings[index + 1];
      if (previous) {
         pager.append(button("btn", `‹ ${previous.label}`, "Previous card on this shelf", () => openCardPage(previous.key)));
      }
      pager.append(el("span", "spacer"));
      if (next) {
         pager.append(button("btn", `${next.label} ›`, "Next card on this shelf", () => openCardPage(next.key)));
      }
      page.append(pager);
      shelvesEl.append(page);
   }

   // What this card builds on and what builds on it, as links to those cards.
   function renderRelations(card) {
      const all = allShelves().flatMap((shelf) => shelf.cards);
      const byKey = new Map(all.map((other) => [other.key, other]));
      const needs = card.dependsOn.filter((key) => key !== card.key && byKey.has(key)).map((key) => byKey.get(key));
      const neededBy = all.filter((other) => other.key !== card.key && other.dependsOn.includes(card.key));
      if (!needs.length && !neededBy.length) {
         return null;
      }
      const box = el("div", "relations");
      const row = (title, cards) => {
         if (!cards.length) {
            return;
         }
         const line = el("div", "relation-row");
         line.append(el("span", "relation-title", title));
         for (const other of cards) {
            line.append(button("chip", other.label, `Go to ${other.label}`, () => openCardPage(other.key)));
         }
         box.append(line);
      };
      row("Builds on", needs);
      row("Needed by", neededBy);
      return box;
   }

   function renderLessonRow(card, lesson, number) {
      const ref = { kind: "lesson", cardKey: card.key, name: lesson.name };
      const row = el("li", "lesson-row" + (lesson.exists ? "" : " missing"));
      row.tabIndex = 0;
      row.title = lesson.exists ? `Open ${lesson.name}` : "The library lists this file, but it does not exist";
      accent(row, lesson.color);

      const body = el("div", "lesson-body");
      body.append(el("div", "lesson-label", lesson.label));
      const under = [lesson.label !== lesson.fileName ? lesson.fileName : "", lesson.detail].filter(Boolean).join(" · ");
      if (under) {
         body.append(el("div", "lesson-detail", under));
      }
      row.append(el("span", "lesson-number", String(number)), body);

      if (lesson.tags.length) {
         const tags = el("div", "tags");
         for (const tag of lesson.tags) {
            tags.append(el("span", "tag", tag));
         }
         row.append(tags);
      }
      if (!lesson.exists) {
         row.append(el("span", "badge", "missing"));
      }
      if (lesson.runnable) {
         row.append(iconButton("▶", `Run ${lesson.fileName}`, () => act("run", ref)));
      }
      row.append(iconButton("⋯", `More actions for ${lesson.label}`, (event) => menuAtElement(event.currentTarget, lessonMenu(lesson, ref))));

      row.addEventListener("click", (event) => {
         if (!event.target.closest("button")) {
            act("open", ref);
         }
      });
      row.addEventListener("keydown", (event) => {
         if (event.target === row && event.key === "Enter") {
            act("open", ref);
         }
      });
      row.addEventListener("contextmenu", (event) => {
         event.preventDefault();
         showMenu(event.clientX, event.clientY, lessonMenu(lesson, ref));
      });
      return row;
   }

   // ---------- menus ----------

   const SEPARATOR = "separator";

   function cardMenu(card, ref) {
      return [
         { label: "Open", action: "open", ref },
         ...(card.runnable ? [{ label: "Run", action: "run", ref }] : []),
         SEPARATOR,
         { label: "Add Lessons...", action: "addLesson", ref },
         { label: "New Lesson File...", action: "newLessonFile", ref },
         SEPARATOR,
         { label: "Edit Details...", action: "editDetails", ref },
         { label: "Move to Category...", action: "moveToCategory", ref },
         { label: "Set Dependencies...", action: "setDependencies", ref },
         { label: "Set Icon...", action: "setIcon", ref },
         { label: "Set Color...", action: "setColor", ref },
         SEPARATOR,
         { label: "Remove Card from Library", action: "removeCard", ref },
      ];
   }

   function lessonMenu(lesson, ref) {
      return [
         { label: "Open", action: "open", ref },
         ...(lesson.runnable ? [{ label: "Run", action: "run", ref }] : []),
         SEPARATOR,
         { label: "Edit Details...", action: "editDetails", ref },
         { label: "Set Color...", action: "setColor", ref },
         SEPARATOR,
         { label: "Remove Lesson from Library", action: "removeLesson", ref },
      ];
   }

   function categoryMenu(ref) {
      return [
         { label: "New Card...", action: "newCard", ref },
         SEPARATOR,
         { label: "Rename Category...", action: "renameCategory", ref },
         { label: "Edit Details...", action: "editDetails", ref },
         { label: "Set Icon...", action: "setIcon", ref },
         { label: "Set Color...", action: "setColor", ref },
         SEPARATOR,
         { label: "Remove Category...", action: "removeCategory", ref },
      ];
   }

   function menuAtElement(anchor, items) {
      const box = anchor.getBoundingClientRect();
      showMenu(box.left, box.bottom + 2, items);
   }

   function showMenu(x, y, items) {
      menuEl.replaceChildren();
      for (const item of items) {
         if (item === SEPARATOR) {
            menuEl.append(el("div", "menu-separator"));
            continue;
         }
         const entry = el("button", "menu-item", item.label);
         entry.setAttribute("role", "menuitem");
         entry.addEventListener("click", () => {
            hideMenu();
            if (item.run) {
               item.run();
            } else {
               act(item.action, item.ref);
            }
         });
         menuEl.append(entry);
      }
      menuEl.hidden = false;
      // Keep the menu inside the window.
      const box = menuEl.getBoundingClientRect();
      menuEl.style.left = `${Math.max(4, Math.min(x, window.innerWidth - box.width - 4))}px`;
      menuEl.style.top = `${Math.max(4, Math.min(y, window.innerHeight - box.height - 4))}px`;
      const first = menuEl.querySelector(".menu-item");
      if (first) {
         first.focus();
      }
   }

   function hideMenu() {
      menuEl.hidden = true;
   }

   menuEl.addEventListener("keydown", (event) => {
      const items = [...menuEl.querySelectorAll(".menu-item")];
      const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
         event.preventDefault();
         items[(index + 1) % items.length].focus();
      } else if (event.key === "ArrowUp") {
         event.preventDefault();
         items[(index - 1 + items.length) % items.length].focus();
      } else if (event.key === "Escape") {
         event.stopPropagation();
         hideMenu();
      }
   });
   document.addEventListener("pointerdown", (event) => {
      if (!menuEl.hidden && !menuEl.contains(event.target)) {
         hideMenu();
      }
   });
   window.addEventListener("blur", hideMenu);
   window.addEventListener("resize", hideMenu);
   shelvesEl.addEventListener("scroll", hideMenu);

   // ---------- what the graph page (graph.js) gets to use ----------

   const app = {
      el,
      button,
      notice,
      plural,
      colorOf,
      cardMatches,
      cardMenu,
      showMenu,
      model: () => model,
      cardStyle: () => styleSelect.value,
      searchTerms: () => terms(queries.shelves),
      // Every card that passes the filters, with its category.
      entries() {
         const list = [];
         for (const shelf of allShelves()) {
            for (const card of shelf.cards) {
               if (cardPasses(card, shelf.category)) {
                  list.push({ card, category: shelf.category });
               }
            }
         }
         return list;
      },
      setCount(text) {
         countEl.textContent = text;
      },
      openCard: openCardPage,
      post: (message) => vscode.postMessage(message),
      graphView: () => graphView,
      setGraphView(next) {
         graphView = { x: next.x, y: next.y, k: next.k };
         saveState();
      },
   };

   // ---------- toolbar and keys ----------

   const queryKey = () => (view.page === "card" ? "card" : "shelves");

   search.addEventListener("input", () => {
      queries[queryKey()] = search.value;
      saveState();
      render();
   });
   search.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && search.value) {
         event.stopPropagation();
         queries[queryKey()] = "";
         saveState();
         render();
      }
   });
   document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && view.page === "card") {
         backToShelves();
      }
   });
   document.getElementById("page-shelves").addEventListener("click", () => showHome("shelves"));
   document.getElementById("page-graph").addEventListener("click", () => showHome("graph"));
   document.getElementById("new-card").addEventListener("click", () => vscode.postMessage({ type: "newCard" }));
   document.getElementById("new-category").addEventListener("click", () => vscode.postMessage({ type: "newCategory" }));
   document.getElementById("open-text").addEventListener("click", () => vscode.postMessage({ type: "openText" }));
   document.getElementById("background").addEventListener("click", () => vscode.postMessage({ type: "background" }));

   // ---------- card style ----------

   const CARD_STYLES = ["classic", "reveal", "cover"];
   const styleSelect = document.getElementById("card-style");

   function applyCardStyle(style) {
      const chosen = CARD_STYLES.includes(style) ? style : "classic";
      for (const known of CARD_STYLES) {
         document.body.classList.toggle(`cards-${known}`, known === chosen);
      }
      styleSelect.value = chosen;
   }

   styleSelect.addEventListener("change", () => {
      applyCardStyle(styleSelect.value);
      if (view.page === "graph") {
         window.ShelfGraph.requestFit();
         render();
      }
      vscode.postMessage({ type: "cardStyle", style: styleSelect.value });
   });
   applyCardStyle("classic");

   // ---------- background ----------

   function applyBackground(background) {
      const body = document.body;
      const image = background && typeof background.image === "string" ? background.image : "";
      body.classList.remove("bg-cover", "bg-contain", "bg-tile");
      body.classList.toggle("has-bg", image !== "");
      if (!image) {
         body.style.removeProperty("--bg-image");
         body.style.removeProperty("--bg-dim");
         return;
      }
      const dim = Math.min(1, Math.max(0, Number(background.dim) || 0));
      body.style.setProperty("--bg-image", `url("${image.replace(/["\\\s]/g, encodeURIComponent)}")`);
      body.style.setProperty("--bg-dim", `${Math.round(dim * 100)}%`);
      body.classList.add(["cover", "contain", "tile"].includes(background.fit) ? `bg-${background.fit}` : "bg-cover");
   }

   window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "model") {
         const scroll = shelvesEl.scrollTop;
         model = event.data.model;
         applyBackground(model.background);
         applyCardStyle(model.cardStyle);
         render();
         shelvesEl.scrollTop = scroll;
      }
   });

   vscode.postMessage({ type: "ready" });
})();
