# Parent guides

A weekly teaching guide for the parent (concept cards, the Saturday script, what to watch for). It appears on the parent Overview under **Guides to teach**. The kid never sees it in the app.

## Files
- `public/guides/week-NN.md`: the guide, hand-editable markdown.
- `public/guides/index.json`: which guides exist. The app reads this first, so a guide not listed here is not shown.

```json
{ "guides": [ { "week": 1, "topic": "Diagnostic + number sense", "due": "2026-11-30", "file": "week-01.md" } ] }
```

`due` is a date (YYYY-MM-DD). The `weekly-content` skill sets it to the creation date + 7 days. If it is left out, the app uses the Saturday of that week (`ROADMAP[week-1].start` + 5 days). Change a due date by editing `index.json`.

## Markdown
Flat frontmatter (`week`, `created`, optional `book`, `chapter`), then `# Week N: topic`, `##` sections and `###` concept headings. Supported: headings, `-` and `1.` lists, paragraphs, `**bold**`, `*italic*`, `` `code` `` and `[text](https://...)` links. Everything else is shown as plain text. The first `#` line is dropped in the app because the card already shows the title. The renderer is `public/js/parent/markdown.js`.

## Taught flag
The guide text is static, but "taught" is the parent's click, so it is stored in D1 (`guide_status`: `week`, `taught_at`).

- `GET /api/parent/guides/status` returns `[ { week, taught_at } ]`.
- `POST /api/parent/guides/:week/taught` with `{}` marks it taught; `{ "taught": false }` undoes it. `:week` is 1 to 19.

## Dashboard behaviour
Untaught guides are listed with the earliest due date first, with an overdue, due today or due in N days label. Open a card to read the full guide. Taught guides move to a collapsed "Taught (n)" group with an Undo button.

## Access
The markdown files are public static files, so the kid can open `/guides/week-NN.md` if they know the URL. Only the dashboard links to them. Do not put answers to the week's questions in a guide.
