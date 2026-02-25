# CLAUDE.md - Project Guide for Claude Code

## Project Overview

Desktop comic and novel viewer: Tauri v2 (Rust backend) + React 19 + TypeScript + Tailwind CSS v4 + Vite. Supports ZIP comics and text files (.md, .txt) with optional ChatTTS text-to-speech.

## Build & Run

```bash
npm install              # Install frontend dependencies
npm run tauri dev        # Development mode with hot-reload
npm run tauri build      # Production build (requires tts_server.exe, see below)
npx tsc --noEmit         # TypeScript type check only
npx vite build           # Frontend build only
```

**Windows note:** Rust compilation requires MSVC environment. Run from "Developer Command Prompt for VS 2022" or set LIB/INCLUDE env vars pointing to MSVC + Windows SDK paths.

### Building the TTS Server Exe (for bundled release)

```bash
cd python
pip install -r requirements-edge.txt pyinstaller
pyinstaller tts_server.spec
cp dist/tts_server.exe ../src-tauri/bin/tts_server.exe
```

The exe must exist at `src-tauri/bin/tts_server.exe` before running `npm run tauri build`. It bundles Edge TTS only (~14MB). ChatTTS is not included (torch is too large). The exe is gitignored.

### TTS Setup (Optional)

```bash
cd python
pip install -r requirements.txt   # ChatTTS + Flask + torch + numpy
python tts_server.py               # Starts on http://127.0.0.1:9966
```

**Recommended Python version:** 3.11 ~ 3.13. Python 3.14 works but requires auto-patches (see below).

Model files (~1.5GB) are auto-downloaded to `python/asset/` on first run. This directory is gitignored.

### Voice Tuning WebUI

```bash
cd python
python tts_webui.py   # Opens on http://127.0.0.1:9977
```

Adjust seed, temperature, top_P, top_K, speed in browser. Copy params and update `_VOICE_SEED` + `InferCodeParams` in `tts_server.py`.

## Architecture

- **Frontend** (`src/`): React SPA with three routes — HomePage (folder browser grid), ReaderPage (comic scroll reader), TextReaderPage (text/markdown reader with TTS)
- **Backend** (`src-tauri/src/`): Rust commands exposed via Tauri IPC — file scanning, ZIP reading, text file loading, TTS process management, audio file saving
- **TTS** (`python/`): ChatTTS Python HTTP server on localhost:9966, managed by Rust as a child process
- **IPC**: Frontend calls Rust via `invoke()` from `@tauri-apps/api/core`; data transferred as JSON (images/audio as base64 data URIs)
- **Cover loading**: Two-phase — `scan_folder` returns file list instantly, `get_cover` loads covers on demand via IntersectionObserver; covers cached in parent state to survive sort/filter changes
- **TTS lifecycle**: Rust manages Python process via `std::process::Command`, stores `Child` in `Mutex<TtsState>` managed state; communicates via HTTP (reqwest); process killed on window close

## TTS Compatibility Patches

`tts_server.py` includes auto-patches for Python 3.14 + transformers v5 + latest torchaudio compatibility. These activate automatically on startup when needed:

| Patch | Problem | Fix |
|-------|---------|-----|
| **base16384 shim** | `pybase16384` Cython/CFFI backends have no compiled wheels for Python 3.14 | Pure-Python encoder/decoder injected via `sys.modules` |
| **encode_plus** | `transformers` v5 removed `PreTrainedTokenizerFast.encode_plus()`, ChatTTS still calls it | Compatibility shim calling internal `_encode_plus` |
| **DynamicCache** | `transformers` v5 `DynamicCache.get_max_cache_shape()` returns `-1` instead of `None`, causing `narrow()` crash | Monkey-patch to return `None` for negative values |
| **WAV encoding** | Latest `torchaudio.save()` requires `torchcodec` package | Use Python stdlib `wave` module directly |

## Key Files

- `src-tauri/src/commands.rs` — All Rust backend logic (file scanning, ZIP reading, text loading, TTS management, audio saving)
- `src/pages/HomePage.tsx` — Folder browser with search, sort, cover cache management
- `src/pages/ReaderPage.tsx` — Comic reader with scroll, lazy load, zoom
- `src/pages/TextReaderPage.tsx` — Text/markdown reader with font size controls and TTS
- `src/components/ComicCard.tsx` — Cover card with lazy loading + text file icon variant
- `src/components/TtsAudioPlayer.tsx` — Audio playback controls with save button
- `src/components/TtsFloatingButton.tsx` — Floating "read aloud" button on text selection
- `src/hooks/useLazyLoad.ts` — IntersectionObserver-based lazy loading for reader pages
- `src/hooks/useZoom.ts` — Zoom state management (Ctrl+scroll on window, keyboard shortcuts)
- `src/hooks/useTts.ts` — TTS server lifecycle, audio playback, and save management
- `src/hooks/useTextSelection.ts` — Mouse text selection detection for TTS
- `python/tts_server.py` — Flask HTTP server with Edge TTS + ChatTTS (compat patches + voice config)
- `python/tts_server.spec` — PyInstaller spec for building standalone Edge TTS server exe
- `python/requirements-edge.txt` — Minimal Python deps for Edge TTS only (flask + edge-tts)
- `python/tts_webui.py` — Voice tuning Web UI for testing seeds and parameters
- `src-tauri/tauri.conf.json` — Tauri app configuration (zoomHotkeysEnabled: false, bundle resources)
- `src-tauri/bin/tts_server.exe` — Built TTS server exe (gitignored, built via PyInstaller)

## Code Conventions

- Rust: snake_case, async commands, `Result<T, String>` for error handling
- TypeScript: strict mode, functional components, custom hooks for logic
- Styling: Tailwind CSS v4 utility classes + @tailwindcss/typography, dark theme (neutral-900 base)
- Routing: react-router with query params (`/read?path=...` for comics, `/read-text?path=...` for text)
- State: Cover cache lifted to HomePage, TTS state managed in Rust via Mutex

## Dependencies

- **Rust crates**: `zip` (ZIP reading), `natord` (natural sort), `base64` (image encoding), `tauri-plugin-dialog` (folder picker + save dialog), `reqwest` (HTTP client for TTS)
- **npm packages**: `react-router` (routing), `@tauri-apps/plugin-dialog` (native dialog), `react-markdown` + `remark-gfm` (markdown rendering), `@tailwindcss/typography` (prose styling)
- **Python packages** (optional): `ChatTTS`, `flask`, `requests`, `torch`, `torchaudio`, `numpy`
