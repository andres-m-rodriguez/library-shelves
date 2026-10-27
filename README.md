# Library Shelves

A VS Code view for your notes and the code files that go with them. Each note is a card, each file is a lesson, and cards sit in categories. A card can be any file type; markdown is the natural default.

Install: download the `.vsix` from [Releases](https://github.com/andres-m-rodriguez/library-shelves/releases) and run `code --install-extension library-shelves.vsix`. See [Verifying the download](#verifying-the-download) if you want to check the file before installing it.

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
- The + button in the title bar adds a card: Create file makes a new file next to `library.json` (a bare name gets `.md`) and Add existing lists files that are already there.
- Right-click a category, card or lesson for its commands: add, rename, set icon or color, edit details, move, remove. Delete removes the selection, F2 renames, Insert adds lessons.
- Drag to reorder lessons within a card or cards within a category. Drag onto a card or category to move. Drag files in from the Explorer to add them.
- Sort by category, by day written, or alphabetically with the list button in the title bar.
- Rows show the file name by default, with the title and description next to it. See [Rows](#rows) to change what a row shows.
- Filter with the search button. Type to narrow the view as you go, or pick a color, tag or category from the list. Active terms show as rows you can remove one by one. The view subtitle shows what is active.
- Renaming or moving a listed file inside VS Code updates `library.json`.

Nothing is ever deleted from disk. Removing something only drops its entry.

## Preview

Hovering a row shows a preview with three parts: a summary (title, description, card, category, tags, date, color, order), an excerpt (the first lines of a lesson, the quoted start of a card, or the card names of a category) and the quick action links. Choose which parts appear with a `preview` entry on a lesson, a card or a category in `library.json`, or for every file with a given extension under `$fileTypes`:

```json
{
  "$fileTypes": {
    ".cs": { "preview": { "code": false } }
  },
  "$categories": {
    "Basics": { "preview": false }
  },
  "variables.md": {
    "category": "Basics",
    "preview": true,
    "lessons": [
      { "name": "declare.cs", "preview": { "summary": true, "code": false, "actions": ["run", "open", "editDetails"] } }
    ]
  }
}
```

`true` shows everything and `false` hides the hover entirely. The object form takes `summary`, `code` and `actions`, where `actions` lists the links to keep. Anything left out is inherited from the next level up, so a lesson overrides its card, the card overrides its category, and the category overrides the file type. Run "Configure Preview..." from a row's context menu, or click the Preview link in the hover, to edit these settings without opening the file.

## Rows

A row shows the file name as its label, with the title and description next to it. A `row` entry on a lesson, a card or a category, or under `$fileTypes` for every file with a given extension, changes that. It takes `label` (`fileName` or `title`), `parts` (the list shown next to the label, in order, from `fileName`, `title`, `date`, `description` and `tags`) and `date` (a format for the `date` part):

```json
{
  "$fileTypes": {
    ".cs": { "row": { "parts": ["title", "date"] } }
  },
  "variables.md": {
    "row": { "label": "title", "parts": ["date", "description"], "date": "MM/DD" },
    "lessons": [{ "name": "declare.cs", "title": "Declaring with a type" }]
  }
}
```

A part that has no value is skipped, as is the part already shown as the label. When `label` is `title` but the lesson or card has no title, the file name is shown instead. The `date` and `tags` parts apply to lessons; cards ignore them. These are the date formats, with the result for 2026-10-19:

| Format | Example |
| --- | --- |
| `smart` | Today, Yesterday, the weekday for the last week, then Mon, Oct 19, 2026 |
| `YYYY-MM-DD` | 2026-10-19 |
| `MM/DD` | 10/19 |
| `M/D` | 10/19 |
| `DD/MM` | 19/10 |
| `MM/DD/YYYY` | 10/19/2026 |
| `DD/MM/YYYY` | 19/10/2026 |
| `DD.MM.YYYY` | 19.10.2026 |
| `MMM D` | Oct 19 |
| `D MMM` | 19 Oct |
| `MMM D, YYYY` | Oct 19, 2026 |
| `ddd, MMM D` | Mon, Oct 19 |
| `dddd` | Monday |

Any other string is a custom pattern built from the tokens `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `DD`, `D`, `dddd` and `ddd`. Every `Y`, `M`, `D` and `d` in the pattern is read as a token, so keep other letters out of it.

Run "Configure Row..." from a row's context menu to edit all of this without opening the file. It offers the same scopes as the preview: this lesson, all files of its type, the card, or the category. Anything left out is inherited the same way, so a lesson overrides its card, the card overrides its category, and the category overrides the file type.

## Verifying the download

You do not have to take the author's word for what is in the `.vsix`. Every release file is built by GitHub, not on a developer machine, from the commit the release tag points at. The workflow is [release.yml](.github/workflows/release.yml), every run and its full log are public under [Actions](https://github.com/andres-m-rodriguez/library-shelves/actions), and GitHub signs a provenance statement for the file it produced. You can check all of this yourself.

**With the GitHub CLI.** Run this against the file you downloaded:

```
gh attestation verify library-shelves.vsix --owner andres-m-rodriguez
```

It passes only if the exact bytes of that file were produced by a workflow in this repository. GitHub does the signing and holds the key, so the author cannot forge it, and a file built or edited anywhere else fails the check. The output names the commit and the workflow run that built the file.

**Without installing anything.** Compute the file's SHA-256 and compare it with the digest GitHub recorded:

```
Get-FileHash library-shelves.vsix            # PowerShell
sha256sum library-shelves.vsix               # macOS or Linux
```

The digest is listed on the repository's [Attestations](https://github.com/andres-m-rodriguez/library-shelves/attestations) page and in the "Record the checksum" step of the release run's log. If the hashes match, the file is the one that run built.

**Reading the code.** The `.vsix` is a zip. Unzip it and you will find one unminified JavaScript file at `extension/dist/extension.js`, bundled from the `src` folder in this repository, plus the JSON schema and manifest. Pasting that file into an AI assistant and asking what it reads, writes, or sends anywhere is a reasonable check for someone who does not read TypeScript. Do not trust comments that tell a reader to skip a section.

**What the extension touches.** It reads and writes the `library.json` files in your workspace, opens files you click, and does not make network requests. The only command it ever runs is the one in the `library.runCommand` setting, and only when you press run on a lesson. Installing a `.vsix` with `code --install-extension` runs no scripts.

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
