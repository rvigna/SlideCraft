# SlideCraft — Presentation Editor

A web-based presentation editor built with **React**, **TypeScript** and the **IBM Carbon Design System**. It opens and saves **PowerPoint (.pptx)** files.

## Features

### PowerPoint in and out
- **Open .pptx**: File › Open PowerPoint (⌘O), or drag a `.pptx` onto the window. The importer reads the Office Open XML directly. It handles:
  - theme colors and fonts, including `lumMod`/`lumOff`/`tint`/`shade`
  - placeholder positions and text styles inherited from layouts and masters
  - groups, connectors, rotation and autofit font scaling
  - bullets, numbered lists and per-word formatting
  - solid, gradient and picture backgrounds
  - cropped images, decorative master/layout artwork and speaker notes
- **Save .pptx**: File › Save as PowerPoint (⌘⇧S). Slides export as real, editable PowerPoint content: text boxes with rich runs, native shapes, images, notes, shadows, borders and opacity. Gradients and icons become images.
- Not supported yet: tables become plain text boxes, and charts, SmartArt and media are skipped. A notification lists what changed.

### Editing
- **Multi-select**: drag a marquee, Shift- or ⌘-click, or press ⌘A. Then move, nudge, copy, delete and format the whole selection.
- **Smart guides**: objects snap to the slide's edges and center and to other objects while you move or resize them. Hold Alt to turn snapping off.
- **Align & distribute**: align to the slide or to the selection, distribute evenly, and change z-order (⌘] / ⌘[).
- **Rich text**: edit in place. B/I/U apply to the highlighted words, or to the whole box when no text is highlighted. Supports bullet and numbered lists, line height and vertical alignment.
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
- **Presenter view** (⌥F5): a separate window with the current and next slide, speaker notes, a timer and a clock.

### Files
- Your work auto-saves to this browser.
- Exports: PowerPoint, PDF (through the print dialog, one slide per page), a self-contained **HTML slideshow**, and SlideCraft JSON.
- Decks saved by SlideCraft 1.x still load. Font Awesome icons are mapped to their Carbon equivalents.

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev       # start the dev server
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
npm test          # unit tests, including a PPTX export → import round trip
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
