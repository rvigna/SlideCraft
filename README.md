# SlideCraft — Presentation Editor

A modern, lightweight web-based presentation editor for creating dynamic, interactive slideshows directly in your browser.

## Features

### Core Editing Capabilities
- **Slide Management**: Create, duplicate, and organize multiple slides with smooth transitions
- **Text Editing**: Add and format text boxes with customizable fonts, sizes, colors, and styles
- **Shape Drawing**: Insert and style various shapes (rectangles, circles, lines, curves)
- **Image Support**: Upload and position images on slides with resize and crop capabilities
- **Background Customization**: Set solid colors or image backgrounds for individual slides or all slides
- **Transitions**: Apply smooth slide transitions with adjustable durations

### Advanced Features
- **Undo/Redo**: Full undo/redo stack for all edits (Ctrl+Z / Ctrl+Y)
- **Copy/Paste**: Duplicate objects within or across slides (Ctrl+C / Ctrl+V)
- **Object Selection**: Click-to-select with visual feedback and selection handles
- **Drag & Resize**: Intuitive drag-to-move and handle-based resizing of objects
- **Rotation**: Rotate objects with visual angle indicator
- **Layering**: Bring to front, send to back, and arrange object z-order
- **Zoom**: Scale the canvas view for precise editing (10% - 200%)
- **Presentation Mode**: Full-screen slideshow with keyboard navigation (F5 to start)

### User Interface
- **Responsive Design**: Adaptive toolbar and panels for different screen sizes
- **Slide Thumbnails**: Visual panel showing all slides for quick navigation
- **Properties Panel**: Context-aware controls for selected objects
- **Status Bar**: Real-time display of object properties and save status
- **Context Menus**: Right-click menus for quick access to common actions
- **Menu Bar**: Traditional File, Edit, View, Insert, Format, and Slide menus

### Data Management
- **Auto-Save**: Automatic saving to browser localStorage with visual feedback
- **Local Export**: Save presentations as JSON for backup and sharing
- **Import**: Load previously saved presentations from JSON files
- **File Information**: Built-in file properties dialog

## Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No server or build tools required

### Installation
1. Clone or download this repository
2. Open `index.html` in your web browser
3. Start creating presentations immediately

```bash
# Simply navigate to the folder and open in a browser
open index.html
```

## Usage

### Creating a Presentation
1. Click on "Untitled Presentation" to rename your presentation
2. Use the "Slide" menu or the "+" button to add slides
3. Select a slide from the thumbnail panel to edit it

### Adding Content
- **Text**: Click the text box icon and drag on the slide
- **Shapes**: Use the shape icons in the toolbar
- **Images**: Click the image icon and select a file from your computer
- **Tables**: Insert a table via the Insert menu

### Formatting Objects
- **Select** an object by clicking on it
- Use the **Properties Panel** on the right to adjust:
  - Position and size (X, Y, Width, Height)
  - Appearance (fill color, border color/width)
  - Text properties (font, size, color, alignment)
  - Effects (shadows, opacity, rotation)

### Presenting
- Press **F5** or click the "Present" button to enter presentation mode
- **Arrow Keys** or **Space** to navigate slides
- **Esc** to exit presentation mode

### Keyboard Shortcuts
- `Ctrl+Z` / `Cmd+Z` - Undo
- `Ctrl+Y` / `Cmd+Y` - Redo
- `Ctrl+C` / `Cmd+C` - Copy selected object
- `Ctrl+X` / `Cmd+X` - Cut selected object
- `Ctrl+V` / `Cmd+V` - Paste
- `Delete` - Delete selected object
- `F5` - Start presentation
- `Esc` - Exit presentation/close menus
- `Ctrl+A` / `Cmd+A` - Select all objects on slide
- `Up/Down Arrows` - Adjust selected object position (in edit mode)

## Project Structure

```
slides/
├── index.html          # Main HTML markup
├── styles.css          # Complete styling and layouts
├── app.js              # Core application logic and state management
├── README.md           # This file
├── .gitignore          # Git ignore rules
└── package.json        # Project metadata (optional)
```

## File Descriptions

### index.html
Contains the semantic HTML structure including:
- Title bar with document name and menu
- Main toolbar with editing controls
- Slide canvas area
- Slide thumbnail panel
- Properties sidebar
- Context and dropdown menus
- Modal dialogs

### styles.css
Comprehensive styling (~900 lines) featuring:
- CSS custom properties for theming
- Responsive layout system
- Toolbar and panel styling
- Canvas and object styling
- Modal and menu styling
- Print and presentation mode styles

### app.js
Main application logic (~2100 lines) including:
- Slide data model and operations
- Event handling and user interactions
- Drag, resize, and rotation logic
- Undo/redo functionality
- localStorage persistence
- Export/import operations
- Presentation mode controller

## Browser Compatibility

- **Chrome/Edge**: Full support (v90+)
- **Firefox**: Full support (v88+)
- **Safari**: Full support (v14+)
- **Mobile Browsers**: Partial support (some features may be limited)

## Data Persistence

SlideCraft automatically saves your work to your browser's localStorage. Presentations are stored locally and persist across browser sessions. You can also:

- **Export**: Save presentations as JSON files for backup or sharing
- **Import**: Load previously exported presentations
- **Clear Cache**: Use the File menu to clear all saved data

## Performance

- Optimized for presentations with 50+ slides
- Smooth 60fps canvas rendering for most operations
- Efficient event delegation and DOM manipulation
- Lazy-loaded resources with minimal dependencies

## Dependencies

- **Font Awesome**: Icon library (CDN)
- **Google Fonts**: Typography resources (CDN)
- **No external JavaScript frameworks**: Pure vanilla JavaScript implementation

## Future Enhancements

Potential features for future versions:
- Collaboration and real-time sharing
- Advanced animation effects
- Custom themes and design templates
- Speaker notes with timer display
- Export to PDF, PowerPoint, or video
- Cloud synchronization
- Drawing tool for freehand sketching
- More shape options and design elements

## License

This project is open source and available for personal and commercial use.

## Support

For issues, feature requests, or questions, please refer to the project repository or contact the development team.

---

**Built with ❤️ by Rodrigo Vigna**
