# Library Shelves

A VS Code view for markdown notes and the code files that go with them. Each note is a card, each file is a lesson, and cards sit in categories.

Install: download the `.vsix` from [Releases](https://github.com/andres-m-rodriguez/library-shelves/releases) and run `code --install-extension library-shelves.vsix`.

Everything lives in a `library.json` next to your files:

```json
{
  "$categories": {
    "Basics": { "icon": "folder-public", "color": "blue", "order": 1 }
  },
  "variables.md": {
    "category": "Basics",
    "lessons": [
      { "name": "declare.cs", "order": 1, "title": "Declaring with a type", "tags": ["basics"] },
      { "name": "reassign.cs", "order": 2 }
    ]
  },
  "loops.md": {
    "category": "Basics",
    "lessons": [{ "name": "countdown.cs" }]
  }
}
```

Only `name` is required on a lesson. Cards and lessons also take `title`, `description`, `order`, `color`, `icon`, `tags` and `date`. Categories declared under `$categories` take `icon`, `color`, `order` and `description`. Comments and trailing commas are fine, and the extension keeps them when it edits the file.

A schema is registered for every `library.json`, so you get completion, hover help and validation. Category names are checked against `$categories` and a quick fix declares any that are missing.

## Using the view

- Click a row to open the file. Hover for a detail card with the first lines of the file and quick actions.
- Right-click a category, card or lesson for its commands: add, rename, set icon or color, edit details, move, remove. Delete removes the selection, F2 renames, Insert adds lessons.
- Drag to reorder lessons within a card or cards within a category. Drag onto a card or category to move. Drag files in from the Explorer to add them.
- Sort by category, by day written, or alphabetically with the list button in the title bar.
- Filter with the search button. Type to narrow the view as you go, or pick a color, tag or category from the list. Active terms show as rows you can remove one by one. The view subtitle shows what is active.
- Renaming or moving a listed file inside VS Code updates `library.json`.

Nothing is ever deleted from disk. Removing something only drops its entry.

## Run

The play button on a lesson, the run button in the editor title, Ctrl+Alt+Enter or the hover link runs `dotnet run <file>` in a terminal from the lesson's folder. Change the command with the `library.runCommand` setting, where `${file}` is the lesson path.

## Development

```
npm install
npm run check
npm run build
npm run package
```

## Filter syntax

The filter box also takes prefixes for people who prefer typing: `color:blue`, `tag:basics`, `cat:week`, `day:2026-10`. Every term must match, and quotes keep spaces in a term.
