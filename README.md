# Comic Viewer

A desktop comic viewer built with **Tauri v2** (Rust) + **React** + **TypeScript** + **Tailwind CSS**.

Browse local folders of ZIP comic files with thumbnail previews, and read them in a smooth vertical infinite-scroll mode with zoom support.

## Features

- **Folder browsing** - Select a folder and see all `.zip` comics displayed as a cover grid
- **Recursive scanning** - Automatically finds comics in all subdirectories
- **Cover thumbnails** - First image in each ZIP is lazily extracted as the cover
- **Search & sort** - Filter comics by name, sort by name or path
- **Hover preview** - Full filename overlay on cover hover
- **Vertical infinite scroll** - Read comics in a single continuous page
- **Lazy loading** - Only images near the viewport are loaded, keeping memory usage low
- **Zoom** - Ctrl + scroll wheel (cursor-centered), Ctrl+0 / Ctrl++ / Ctrl+- shortcuts
- **Keyboard navigation** - Home (first page), End (last page), Esc (back to library)
- **Remember last folder** - Automatically reopens the last browsed folder on launch
- **Natural sort** - Pages are ordered correctly (page2 before page10)

## Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 |
| Backend  | Tauri v2 (Rust)                   |
| Build    | Vite 7                            |
| IPC      | Tauri invoke / command            |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (v1.77+)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload (Windows only)

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode (with hot-reload)
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
comic-viewer/
├── src/                          # React frontend
│   ├── pages/
│   │   ├── HomePage.tsx          # Folder browser + search/sort + comic grid
│   │   └── ReaderPage.tsx        # Vertical scroll reader + zoom
│   ├── components/
│   │   ├── ComicCard.tsx         # Cover card with lazy load + hover overlay
│   │   ├── ComicGrid.tsx         # Responsive grid layout
│   │   ├── TopBar.tsx            # Navigation bar
│   │   ├── ZoomIndicator.tsx     # Zoom level display
│   │   └── PageIndicator.tsx     # Page number display
│   ├── hooks/
│   │   ├── useZoom.ts            # Zoom state + keyboard/wheel handlers
│   │   ├── useLazyLoad.ts        # IntersectionObserver-based loading
│   │   └── useLastFolder.ts      # localStorage persistence
│   ├── App.tsx                   # Router setup
│   ├── types.ts                  # TypeScript interfaces
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands.rs           # Tauri commands (scan, cover, load, info)
│   │   ├── lib.rs                # App builder + plugin registration
│   │   └── main.rs               # Desktop entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Rust Backend Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `scan_folder`    | Recursively scans a directory for `.zip` files   |
| `get_cover`      | Extracts the first image from a ZIP as cover     |
| `get_comic_info` | Returns total page count for a comic             |
| `load_page`      | Loads a single page by index as base64           |

## Keyboard Shortcuts

| Shortcut       | Action              |
| -------------- | ------------------- |
| Ctrl + Scroll  | Zoom in/out (cursor-centered) |
| Ctrl + 0       | Reset zoom to 100%  |
| Ctrl + +/-     | Zoom in/out by 10%  |
| Home           | Jump to first page  |
| End            | Jump to last page   |
| Esc            | Return to library   |

## License

MIT
