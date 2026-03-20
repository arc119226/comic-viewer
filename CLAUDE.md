# CLAUDE.md - Project Guide for Claude Code

## Project Overview

Desktop comic and novel viewer: Tauri v2 (Rust backend) + React 19 + TypeScript + Tailwind CSS v4 + Vite. Supports ZIP comics and text files (.md, .txt) with optional TTS (Edge TTS, ChatTTS, Index-TTS).

## Build & Run

```bash
npm install              # Install frontend dependencies
npm run tauri dev        # Development mode with hot-reload (auto-creates placeholder exe)
npm run build:tts        # Build TTS server exe (requires Python deps, see below)
npm run build:all        # One-step production build (build:tts + tauri build)
npm run tauri build      # Production build (requires tts_server.exe already built)
npx tsc --noEmit         # TypeScript type check only
npx vite build           # Frontend build only
```

**Windows note:** Rust compilation requires MSVC environment. Run from "Developer Command Prompt for VS 2022" or set LIB/INCLUDE env vars pointing to MSVC + Windows SDK paths.

### Building the TTS Server Exe (for bundled release)

```bash
pip install -r python/requirements-edge.txt pyinstaller   # One-time setup
npm run build:tts                                          # Build + copy exe
```

Or manually:
```bash
cd python
python -m PyInstaller tts_server.spec
cp dist/tts_server.exe ../src-tauri/bin/tts_server.exe
```

The exe bundles Edge TTS only (~14MB). ChatTTS is not included (torch is too large). The exe is gitignored. In dev mode (`npm run tauri dev`), `build.rs` auto-creates a placeholder exe so the build never fails — TTS runs from Python directly in dev.

### TTS Setup (Optional)

```bash
cd python
pip install -r requirements.txt   # ChatTTS + Flask + torch + numpy
python tts_server.py               # Starts on http://127.0.0.1:9966
```

**Recommended Python version:** 3.11 ~ 3.13. Python 3.14 works but requires auto-patches (see below).

**Key dependency versions for ChatTTS:**
- `transformers==4.52.1` (v4.x series — ChatTTS is not compatible with transformers v5)
- `tokenizers>=0.21,<0.22` (required by transformers 4.52.1; v0.22+ will cause import errors)
- `huggingface-hub<1.0,>=0.30.0` (required by transformers 4.x)
- `torch 2.10+cu128` (CUDA GPU acceleration, install via `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128`)

Model files (~1.5GB) are auto-downloaded to `python/asset/` on first run. This directory is gitignored.

### Index-TTS Setup (Optional)

Index-TTS is a high-quality zero-shot voice cloning TTS by Bilibili (supports Chinese + English with emotion control). Requires CUDA GPU. Runs in its own venv (separate from ChatTTS) to avoid dependency conflicts (Index-TTS needs transformers v5 + torch 2.8, while ChatTTS needs transformers v4 + torch 2.10).

```bash
cd python
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/index-tts/index-tts.git
cd index-tts
uv sync --all-extras                                     # Create venv with deps
# Download checkpoints (~GB level) from HuggingFace into python/index-tts/checkpoints/
```

The server auto-detects `python/index-tts/.venv/Scripts/python.exe` and probe-tests it at startup. Place a reference voice WAV (5-10s, clear speech) at `python/voices/default.wav`, or pick one in the UI. The `index-tts/` directory and `checkpoints/` are gitignored.

**MSIX Python note:** If `uv` was installed via an MSIX-packaged app (e.g. Claude Desktop), Python is stored inside a sandboxed path (`AppData\Local\Packages\{id}\LocalCache\Roaming\...`). The pyvenv.cfg `home` path (`AppData\Roaming\...`) is an app-execution alias that may fail with `WinError 2` from Tauri/Rust child processes. The server auto-resolves this via `os.path.realpath()` and MSIX package scanning, then probe-tests each candidate with `python -c "import sys"` to find the working interpreter.

### Voice Tuning WebUI

```bash
cd python
python tts_webui.py   # Opens on http://127.0.0.1:9977
```

Adjust seed, temperature, top_P, top_K, speed in browser. Copy params and update `_VOICE_SEED` + `InferCodeParams` in `tts_server.py`.

## Architecture

- **Frontend** (`src/`): React SPA with three routes — HomePage (folder browser grid), ReaderPage (comic scroll reader), TextReaderPage (text/markdown reader with TTS)
- **Backend** (`src-tauri/src/`): Rust commands exposed via Tauri IPC — file scanning, ZIP reading, text file loading, TTS process management, audio file saving
- **TTS** (`python/`): Flask HTTP server on localhost:9966 supporting Edge TTS (cloud), ChatTTS (local AI), and Index-TTS (voice cloning via subprocess in separate venv), managed by Rust as a child process
- **IPC**: Frontend calls Rust via `invoke()` from `@tauri-apps/api/core`; data transferred as JSON (images/audio as base64 data URIs)
- **Cover loading**: Two-phase — `scan_folder` returns file list instantly, `get_cover` loads covers on demand via virtual scroll (only visible cards mount and trigger loading). Two-level cache: L1 in-memory HashMap (SHA256 → data URI) for same-session hits, L2 persistent disk cache (`app_cache_dir/covers/{sha256}.{ext}` with raw image bytes) for cross-session hits. Cache key is SHA256 of first 8KB of ZIP (content-addressed — survives file rename/move)
- **HomePage keep-alive**: HomePage stays mounted (hidden via `display:none`) when navigating to readers, preserving all state (covers, scroll position, search, sort) without re-fetching
- **Virtual scrolling**: ComicGrid uses `@tanstack/react-virtual` to only render visible rows (~30-50 cards), handling 1000+ comics efficiently
- **Comic reader optimizations**: ZIP index cache (`ZipIndexCache`) avoids re-scanning ZIP entries per page; parallel preloading (5 pages ahead via concurrent IPC); aspect-ratio placeholders from first page dimensions (no layout shift); binary search scroll tracking; automatic page unloading (>20 pages from current) to cap memory usage
- **TTS lifecycle**: Rust manages Python process via `std::process::Command`, stores `Child` in `Mutex<TtsState>` managed state; communicates via HTTP (reqwest); process killed on window close

## TTS Compatibility Patches

`tts_server.py` includes auto-patches for Python 3.14 + latest torchaudio compatibility. These activate automatically on startup when needed:

| Patch | Problem | Fix |
|-------|---------|-----|
| **base16384 shim** | `pybase16384` Cython/CFFI backends have no compiled wheels for Python 3.14 | Pure-Python encoder/decoder injected via `sys.modules` |
| **WAV encoding** | Latest `torchaudio.save()` requires `torchcodec` package | Use Python stdlib `wave` module directly |
| **DynamicCache.layers** | ChatTTS accesses `cache.layers` which doesn't exist in transformers 4.52.x | `__init__` wrapper + `__getattr__` fallback add `.layers` as alias for `key_cache` |
| **DynamicCache.get_max_cache_shape** | Signature mismatch + returns -1 instead of None for unlimited | Wrapper normalizes args and converts -1 → None |
| **DynamicCache.get_max_length** | ChatTTS uses deprecated `get_max_length()` fallback | Provided via `__getattr__` returning `lambda: None` |
| **MSIX Python alias** | uv-installed Python via MSIX app uses app-execution alias that fails from Tauri subprocess | Multi-strategy resolver (realpath + MSIX package scan) with startup probe-test |

**Important:** Use `transformers==4.52.1` (v4.x). ChatTTS is incompatible with transformers v5 (removed `encode_plus`, `DynamicCache` behavior changes, etc.). Index-TTS needs transformers v5 but runs in its own isolated venv so there is no conflict.

## Key Files

- `src-tauri/src/commands.rs` — All Rust backend logic (file scanning, ZIP reading, text loading, TTS management, audio saving, persistent cover cache with SHA256 content-addressing)
- `src/App.tsx` — Router with keep-alive layout (HomePage stays mounted, hidden via display:none when in reader)
- `src/pages/HomePage.tsx` — Folder browser with search, sort, cover cache management (flex layout for virtual scroll)
- `src/pages/ReaderPage.tsx` — Comic reader with scroll, lazy load, zoom
- `src/pages/TextReaderPage.tsx` — Text/markdown reader with font size controls and TTS
- `src/components/ComicGrid.tsx` — Virtual scrolling grid using @tanstack/react-virtual (renders only visible rows)
- `src/components/ComicCard.tsx` — Cover card with on-mount loading (virtualizer controls visibility) + text file icon variant
- `src/components/TtsAudioPlayer.tsx` — Audio playback controls with save button
- `src/components/TtsFloatingButton.tsx` — Floating "read aloud" button on text selection
- `src/hooks/useLazyLoad.ts` — IntersectionObserver-based lazy loading for comic reader pages
- `src/hooks/useZoom.ts` — Zoom state management (Ctrl+scroll on window, keyboard shortcuts)
- `src/hooks/useTts.ts` — TTS server lifecycle, audio playback, and save management
- `src/hooks/useTextSelection.ts` — Mouse text selection detection for TTS
- `python/tts_server.py` — Flask HTTP server with Edge TTS + ChatTTS + Index-TTS (compat patches + voice config)
- `python/tts_server.spec` — PyInstaller spec for building standalone Edge TTS server exe
- `python/requirements-edge.txt` — Minimal Python deps for Edge TTS only (flask + edge-tts)
- `python/tts_webui.py` — Voice tuning Web UI for testing seeds and parameters
- `src-tauri/tauri.conf.json` — Tauri app configuration (zoomHotkeysEnabled: false, bundle resources)
- `src-tauri/bin/tts_server.exe` — Built TTS server exe (gitignored, built via PyInstaller)

## Code Conventions

- Rust: snake_case, async commands, `Result<T, String>` for error handling
- TypeScript: strict mode, functional components, custom hooks for logic
- Styling: Tailwind CSS v4 utility classes + @tailwindcss/typography, dark theme (neutral-900 base)
- Routing: react-router with query params (`/read?path=...` for comics, `/read-text?path=...` for text); HomePage uses keep-alive pattern (always mounted, hidden when in reader)
- State: Cover cache lifted to HomePage (frontend) + two-level Rust cache (memory HashMap + disk files keyed by SHA256); TTS state managed in Rust via Mutex

## Dependencies

- **Rust crates**: `zip` (ZIP reading), `natord` (natural sort), `base64` (image encoding), `sha2` (SHA256 for cover cache keys), `tauri-plugin-dialog` (folder picker + save dialog), `reqwest` (HTTP client for TTS)
- **npm packages**: `react-router` (routing), `@tauri-apps/plugin-dialog` (native dialog), `react-markdown` + `remark-gfm` (markdown rendering), `@tailwindcss/typography` (prose styling), `@tanstack/react-virtual` (virtual scrolling for comic grid)
- **Python packages** (optional): `ChatTTS`, `flask`, `requests`, `torch 2.10+cu128`, `torchaudio`, `numpy`, `transformers==4.52.1`, `huggingface-hub<1.0`
- **Index-TTS** (optional, separate venv): `indextts`, `torch==2.8.*`, `transformers>=5.0` — installed via `uv sync` in `python/index-tts/`
