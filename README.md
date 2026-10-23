# SlideCraft — Presentation Editor

A web-based presentation editor built with **React**, **TypeScript** and the **IBM Carbon Design System**. It opens and saves **PowerPoint (.pptx)** files.

## Features

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
- Per-slide transitions: fade, slide and zoom.

### Presenting
- **Slideshow** (F5, or ⇧F5 from the beginning): full screen, click or arrow keys to advance, `B`/`W` for a black or white screen, number + Enter to jump to a slide, progress bar.
- **Presenter view** (⌥F5): a separate window with the current and next slide, speaker notes, a timer and a clock. Move the audience window to the projector and click it once to go full screen.

### Files
- Your work auto-saves to this browser.
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
| Files | `exportPptx()`, `openPptx(url \| Blob \| ArrayBuffer)`, `exportHtml()`, `exportJson()`, `save()`, `print()` |
| Present | `present(i)`, `presenterView(i)`, `next()`, `prev()`, `exitPresentation()` |
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
├── model/        # Data model, themes, layouts, geometry (snapping, align), rich text, colors
├── store/        # Zustand + Immer editor store with structural-sharing undo history
├── io/           # PPTX import/export, HTML export, images, file actions, rasterizing
├── api.ts        # window.slidecraft automation API
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

## License

MIT. Built by Rodrigo Vigna.
