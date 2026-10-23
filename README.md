# SlideCraft — Presentation Editor

A web-based presentation editor built with **React**, **TypeScript** and the **IBM Carbon Design System**. It opens and saves **PowerPoint (.pptx)** files.

## Features

### AI assistant
Open it with the ✨ toolbar button or Format › AI Assistant. It uses Claude (`claude-opus-5-5`) with your own Anthropic API key, which is stored only in your browser and sent only to `api.anthropic.com`.
- **Generate a deck** from a topic, an outline or pasted notes. You choose the number of slides, the audience and the theme.
- **Quick actions**: improve this slide, write speaker notes, make it concise, fix design issues (including splitting crowded slides), add a summary slide.
- **Chat**: ask for anything, e.g. "turn slide 3 into a chart", "translate the deck to Spanish", "reorder for a 5-minute version". Claude edits the deck through tools: reading slides, writing slides in Markdown, editing objects, setting notes and themes, and running the design check. You watch the changes happen, can stop them midway, and **undo the whole run in one click**.
- It streams responses, caches the system prompt, and uses server-side refusal fallback.

### Design check
A live linter for slides (toolbar ✓ button; the badge shows the issue count):
- text that overflows its box, objects off the slide, low contrast (WCAG AA), text under 12px
- more than three typefaces, edges that are *almost* aligned, empty text boxes, crowded slides, overlapping text, slides without a title

Each issue has **Show**, and most have a one-click fix (fit text, fix color, snap, move inside, unify fonts…). **Fix all** applies every fix as a single undo step. The same checks run in the CLI.

### Decks as code
Write presentations in Markdown, or paste notes, an outline or a README. Open a file with File › Open Markdown, or press ⌘⇧M. The Markdown dialog has two modes: **Whole deck** edits the entire deck as Markdown, and **Add slides** inserts new slides after the current one. Both show a live preview and have snippet buttons (columns, cards, chart, table, code, big number, picture, quote). You can also download any deck as `.md`.

SlideCraft picks the layout from the content, and the generated slides pass the design check:
- **Slides split themselves.** `---` separates slides. Without it, each `#` heading starts a slide, or each `##` heading when the document has a single `#` title, which becomes the title slide; a `##` directly under it is the subtitle.
- **Long lists continue** on extra slides ("Title (continued)"), in evenly sized parts, instead of shrinking to unreadable text. Each part stays under the design check's limits of 8 bullets and 90 words.
- **Columns**: `|||` on its own line starts the next column. **Cards**: 2–4 `###` sections become side-by-side cards.
- **Code**: a fenced block becomes a code box. **Big number**: a title that is just a number (`# 42%`) gets the big-number layout.
- **Pictures**: `![bg](url)` makes a background, and `![bg left](url)` / `![bg right](url)` puts a picture on half the slide.
- **Front matter**: `theme`, `motion`, `footer` (text on every slide) and `paginate: true` (slide numbers).

````markdown
---
title: Q3 Business Review
theme: Carbon Dark
motion: subtle
footer: Q3 Review · Internal
paginate: true
---

# Q3 Business Review
## Prepared for the leadership team

---

# Revenue grew in every region
- Total revenue up **12%**
  - EMEA led with +16%

```chart column
title: Revenue ($M)
categories: Q1, Q2, Q3
EMEA: 90, 104, 118
APAC: 70, 88, 97
```

Note: speaker notes go after "Note:"

---

# Three priorities
### Focus
Fewer, bigger bets
### Speed
Ship every week
### Partners
Grow the ecosystem

---

# Before and after
- Manual exports

|||

- One source of truth

---

# 42%
of trial users upgraded

---

# The team
![bg left](team.jpg)
- Twelve people, five countries
````

Also supported: `![alt](url)` images, `> quotes`, numbered lists, `` `code` ``, `~~strike~~`, `***bold italic***`, backslash escapes, and per-slide directives such as `<!-- layout: section -->`, `<!-- background: #161616 -->`, `<!-- transition: fade 0.8 -->` and `<!-- motion: focus -->`. A full example is in [`examples/quarterly-review.md`](examples/quarterly-review.md).

**Command line** (`npm run build:cli` once, then `npx slidecraft …` or `node bin/slidecraft.mjs …`):

```bash
slidecraft build talk.md -o talk.pptx            # Markdown → PowerPoint (also .html, .json, .md)
slidecraft build deck.pptx -o deck.md            # PowerPoint → Markdown, for diffs and review
slidecraft lint deck.pptx                        # design check; exit code 1 on errors (CI-friendly)
slidecraft lint deck.pptx --fix -o fixed.pptx    # apply the automatic fixes
```

### PowerPoint in and out
- **Open .pptx**: File › Open PowerPoint (⌘O), or drag a `.pptx` onto the window. The importer reads the Office Open XML directly. It handles:
  - theme colors and fonts, including `lumMod`/`lumOff`/`tint`/`shade`
  - placeholder positions and text styles inherited from layouts and masters
  - groups, connectors, rotation and autofit font scaling
  - bullets at every indent level, numbered lists and per-word formatting
  - solid, gradient and picture backgrounds
  - **tables**, including PowerPoint's default table style, header rows and banding
  - **charts** (column, bar, line, area, pie, doughnut), imported as editable charts with their data
  - **SmartArt**, from the drawing PowerPoint caches inside the file
  - embedded objects (Excel, Visio…) as their preview picture; video and audio as their poster frame
  - cropped images, decorative master/layout artwork, slide transitions and speaker notes
- **Save .pptx**: File › Save as PowerPoint (⌘⇧S). Slides export as real, editable PowerPoint content:
  - text boxes with rich runs and nested bullets, and native shapes
  - **native tables** and **native charts** (they stay editable in PowerPoint)
  - images, notes, shadows, borders and opacity
  - **slide transitions**, and the deck theme (stored so it comes back when reopened in SlideCraft)
  - Gradients and icons become images.
- **Office fonts** keep their names in the file but display with metric-compatible open fonts when the original isn't installed (Calibri→Carlito, Cambria→Caladea, Arial→Arimo, Times New Roman→Tinos, Courier New→Cousine, Georgia→Gelasio, Aptos→Inter), so line breaks match PowerPoint.
- Not supported yet: scatter, bubble and stock charts are skipped, and merged table cells import unmerged. A notification lists anything that changed.

### Editing
- **Multi-select**: drag a marquee, Shift- or ⌘-click, or press ⌘A. Then move, nudge, copy, delete and format the whole selection.
- **Smart guides**: objects snap to the slide's edges and center and to other objects while you move or resize them. Hold Alt to turn snapping off.
- **Align & distribute**: align to the slide or to the selection, distribute evenly, and change z-order (⌘] / ⌘[).
- **Rich text**: edit in place. B/I/U apply to the highlighted words, or to the whole box when no text is highlighted. Supports bullet and numbered lists (Tab / Shift+Tab to nest), line height and vertical alignment.
- **Tables**: double-click a cell to edit; Tab moves between cells. Add and remove rows and columns, and toggle the header row and banding. The text toolbar styles the whole table.
- **Charts**: column, bar, line, area, pie and doughnut, drawn natively as SVG. Double-click a chart to open its data editor, which has a spreadsheet grid and a live preview.
- **Shapes** (11), **Carbon icons** (80+) and **images**. Images can be added by URL, upload, drag-and-drop or paste.
- **Clipboard**: copied objects can be pasted into another SlideCraft tab. Pasted images and plain text become new objects.
- **Undo/redo**: a whole drag or a whole color-picker adjustment counts as one undo step.

### Design
- **9 deck themes** (Carbon, Carbon Dark, Classic, Midnight, Aurora, Sunset, Forest, Editorial, Terminal). A theme restyles every slide; new slides and layouts follow it.
- **9 layouts** with live previews: title, title + content, two columns, image + text, section header, big number, three points and quote.
- Slide backgrounds can be a color, a gradient or an image, for one slide or all of them.
- Per-slide transitions: fade, rise, soft zoom, slide, wipe and zoom.

### Transitions & animation
**Slide › Transitions & Animation…** (or the toolbar's motion button when nothing is selected) opens the **motion wizard**. It has three steps:
1. **Style**: pick a preset. Each card shows a live preview. *Subtle* (fade with a gentle rise), *Smooth*, *Focus* (soft zoom), *Lively*, or *None* to clear everything.
2. **Options**: apply to this slide or the whole deck, animate the content as well as the slide, reveal bullets one click at a time, and set the speed (relaxed / normal / brisk).
3. **Preview**: watch it on your slide, then **Apply**. The whole change is one undo step.

Objects enter in reading order: the title first, then the content from top to bottom with a short stagger. You can fine-tune any object in the Properties panel under **Animation**: effect, duration, delay, *wait for a click* and *one bullet at a time*. In the slideshow, click "builds" step through before the next slide, and the counter shows the step (e.g. `2 / 8 · 1/4`). The HTML export plays the same animations. Both honour the system's *reduce motion* setting.

In Markdown, add `motion: subtle` to the front matter. The assistant can do it too: "make the transitions subtle". From the console: `slidecraft.applyMotion('subtle', { scope: 'all', revealOnClick: true })`. PowerPoint export keeps slide transitions; rise and soft zoom map to fade and zoom. Object entrance animations are not exported to PowerPoint yet.

### Presenting
- **Slideshow** (F5, or ⇧F5 from the beginning): full screen, click or arrow keys to advance, `B`/`W` for a black or white screen, number + Enter to jump to a slide, progress bar.
- **Presenter view** (⌥F5): a separate window with the current and next slide, speaker notes, a timer and a clock. Move the audience window to the projector and click it once to go full screen.

### Files
- Your work auto-saves to this browser (IndexedDB, so decks with many images fit; it also saves when you switch tabs or close the window).
- Exports: PowerPoint, PDF (through the print dialog, one slide per page), a self-contained **HTML slideshow**, and SlideCraft JSON.
- Decks saved by SlideCraft 1.x still load. Font Awesome icons are mapped to their Carbon equivalents.

## Automation API

The running app exposes `window.slidecraft`. You can use it from the browser console, from Playwright or Puppeteer scripts, or from a browser extension. Calls go through the same store as the UI, so every change can be undone, is auto-saved and appears on screen immediately. Type `slidecraft.help()` in the console for the full reference (also under Help › Automation API).

```js
// Build a slide: one undo step for the whole batch
slidecraft.batch(() => {
  const s = slidecraft.addSlide({ layout: 'Blank', notes: 'Walk through the numbers' });
  slidecraft.addText('Quarterly results', { slide: s, x: 60, y: 30, fontSize: 36, fontWeight: '700' });
  slidecraft.addTable([['Region', 'Q1', 'Q2'], ['EMEA', 90, 104]], { slide: s, x: 60, y: 120, w: 420 });
  slidecraft.addChart('column', { slide: s, x: 500, y: 110, w: 420, h: 300, title: 'Revenue',
    categories: ['Q1', 'Q2'], series: [{ name: 'EMEA', values: [90, 104] }] });
  slidecraft.addBullets(['Growth everywhere', ['EMEA +16%'], 'Margins stable'], { slide: s, y: 340 });
});

slidecraft.find({ type: 'chart' });                        // query objects
slidecraft.update(id, { x: 100, color: '#da1e28' });       // change any property
slidecraft.setTheme('Carbon Dark');
const blob = await slidecraft.exportPptx({ download: false });
await slidecraft.openPptx('https://example.com/deck.pptx');
slidecraft.onChange(deck => console.log(deck.slides.length));
```

| Area | Calls |
|---|---|
| Read | `getDeck()`, `getSlides()`, `getSlide(i)`, `getObject(id)`, `find({type, text, slide})`, `currentSlide`, `slideCount`, `selection`, `themes()`, `layouts()`, `icons()` |
| Deck | `newDeck(theme)`, `load(json)`, `setTitle()`, `setTheme()` |
| Slides | `addSlide({layout, after, background, notes})`, `updateSlide(i, patch)`, `duplicateSlide`, `deleteSlide`, `moveSlide(from, to)`, `goToSlide`, `applyLayout` |
| Objects | `addText`, `addBullets`, `addShape`, `addImage`, `addIcon`, `addTable`, `addChart`, `update`, `remove`, `select`, `align`, `distribute`, `arrange` |
| History | `undo()`, `redo()`, `batch(fn)` |
| Files | `exportPptx()`, `openPptx(url \| Blob \| ArrayBuffer)`, `exportHtml()` (async), `exportJson()`, `save()` (async), `print()` |
| Present | `present(i)`, `presenterView(i)`, `next()`, `prev()`, `exitPresentation()` |
| Design | `lint()`, `fixIssues(keys?)` |
| Motion | `applyMotion(preset, {scope, slideIndex, animateContent, revealOnClick, speed})` |
| Markdown | `toMarkdown()`, `fromMarkdown(md)` |
| AI | `ask(prompt)`, `setApiKey(key)` |
| Events | `onChange(fn)`, `notify(title, kind)` |

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev       # start the dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
npm test          # unit tests, including PPTX round trips for text, tables, charts, themes and SmartArt
```

## Keyboard shortcuts

Help › Keyboard Shortcuts (⌘/) has the full list. The main ones:

| Shortcut | Action |
|---|---|
| ⌘S / ⌘⇧S / ⌘O | Save in browser / save as PowerPoint / open PowerPoint |
| ⌘Z / ⌘⇧Z | Undo / redo |
| ⌘C / ⌘X / ⌘V / ⌘D | Copy / cut / paste / duplicate |
| ⌘A, Shift-click, drag | Select all / add to selection / marquee |
| Arrows (+Shift) | Nudge 1px (10px) |
| Enter / Esc | Edit text / stop editing |
| T, ⌘M | New text box, new slide |
| F5, ⇧F5, ⌥F5 | Present from current / from start / presenter view |

## Project structure

```
src/
├── model/        # Data model, themes, layouts, geometry, rich text, colors, Markdown, design lint
├── store/        # Zustand + Immer editor store with structural-sharing undo history
├── io/           # PPTX import/export, HTML export, images, file actions, rasterizing
├── api.ts        # window.slidecraft automation API
├── ai/           # Claude assistant: agent loop and deck-editing tools
├── cli/          # slidecraft command-line tool (Node + jsdom)
├── components/   # Carbon UI: header/menubar, toolbar, canvas, panels, dialogs, slideshow
├── hooks/        # Keyboard shortcuts, clipboard, auto-save
├── styles/       # app.scss (Carbon tokens + editor layout)
└── test/         # Vitest unit tests
```

## Tech
- React 19, TypeScript, Vite
- `@carbon/react` and `@carbon/icons-react`, using IBM Plex type
- Zustand + Immer for state
- PptxGenJS for PowerPoint export; JSZip with a custom OOXML parser for import
- `@anthropic-ai/sdk` (tool runner) for the AI assistant

## License

MIT. Built by Rodrigo Vigna.
