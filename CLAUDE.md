# CLAUDE.md - Project Guide for Claude Code

## Project Overview

Desktop comic viewer: Tauri v2 (Rust backend) + React 19 + TypeScript + Tailwind CSS v4 + Vite.

## Build & Run

```bash
npm install              # Install frontend dependencies
npm run tauri dev        # Development mode with hot-reload
npm run tauri build      # Production build
npx tsc --noEmit         # TypeScript type check only
npx vite build           # Frontend build only
```

**Windows note:** Rust compilation requires MSVC environment. Run from "Developer Command Prompt for VS 2022" or set LIB/INCLUDE env vars pointing to MSVC + Windows SDK paths.

## Architecture

- **Frontend** (`src/`): React SPA with two routes — HomePage (folder browser grid with search/sort) and ReaderPage (vertical scroll reader with zoom)
- **Backend** (`src-tauri/src/`): Rust commands exposed via Tauri IPC — `scan_folder`, `get_cover`, `get_comic_info`, `load_page`
- **IPC**: Frontend calls Rust via `invoke()` from `@tauri-apps/api/core`; data transferred as JSON (images as base64 data URIs)
- **Cover loading**: Two-phase — `scan_folder` returns file list instantly, `get_cover` loads covers on demand via IntersectionObserver; covers cached in parent state to survive sort/filter changes

## Key Files

- `src-tauri/src/commands.rs` — All Rust backend logic (ZIP reading, image extraction, natural sort, recursive scan)
- `src/pages/HomePage.tsx` — Folder browser with search, sort, cover cache management
- `src/pages/ReaderPage.tsx` — Comic reader with scroll, lazy load, zoom
- `src/components/ComicCard.tsx` — Cover card with lazy loading + hover overlay
- `src/hooks/useLazyLoad.ts` — IntersectionObserver-based lazy loading for reader pages
- `src/hooks/useZoom.ts` — Zoom state management (Ctrl+scroll on window, keyboard shortcuts)
- `src-tauri/tauri.conf.json` — Tauri app configuration (zoomHotkeysEnabled: false to prevent WebView2 intercepting Ctrl+scroll)

## Code Conventions

- Rust: snake_case, async commands, `Result<T, String>` for error handling
- TypeScript: strict mode, functional components, custom hooks for logic
- Styling: Tailwind CSS v4 utility classes, dark theme (neutral-900 base)
- Routing: react-router with query params for comic path (`/read?path=...`)
- State: Cover cache lifted to HomePage, passed down via props to ComicGrid/ComicCard

## Dependencies

- **Rust crates**: `zip` (ZIP reading), `natord` (natural sort), `base64` (image encoding), `tauri-plugin-dialog` (folder picker)
- **npm packages**: `react-router` (routing), `@tauri-apps/plugin-dialog` (native dialog)
