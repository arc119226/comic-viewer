# Comic Viewer

A desktop comic and novel viewer built with **Tauri v2** (Rust) + **React** + **TypeScript** + **Tailwind CSS**.

Browse local folders of ZIP comic files and text files (.md, .txt) with thumbnail previews, read comics in smooth vertical infinite-scroll mode with zoom, and read novels with adjustable font size and text-to-speech support.

## Features

### Comic Reading
- **Folder browsing** - Select a folder and see all `.zip` comics and text files displayed as a grid
- **Recursive scanning** - Automatically finds files in all subdirectories
- **Cover thumbnails** - First image in each ZIP is lazily extracted as the cover
- **Search & sort** - Filter by name, sort by name or path
- **Hover preview** - Full filename overlay on cover hover
- **Vertical infinite scroll** - Read comics in a single continuous page
- **Lazy loading** - Only images near the viewport are loaded, keeping memory usage low
- **Zoom** - Ctrl + scroll wheel (cursor-centered), Ctrl+0 / Ctrl++ / Ctrl+- shortcuts
- **Preloading** - Next 5 pages are preloaded for smoother reading

### Novel Reading
- **Text file support** - Read `.md` and `.txt` files with comfortable formatting
- **Markdown rendering** - Full GitHub Flavored Markdown support (headings, tables, code blocks, etc.)
- **Adjustable font size** - Increase/decrease font size with persistence across sessions
- **Text-to-speech** - Select text and click the floating button to hear it read aloud
- **Dual TTS engines** - Choose between Edge TTS (cloud, fast, no model download) and ChatTTS (local, customizable voice) via dropdown
- **Save audio** - Save generated speech as `.mp3` or `.wav` files via native save dialog
- **Voice tuning** - Web UI for testing different voice seeds and parameters

### General
- **Keyboard navigation** - Home (first page), End (last page), Esc (back to library)
- **Remember last folder** - Automatically reopens the last browsed folder on launch
- **Natural sort** - Files are ordered correctly (page2 before page10)

## Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 |
| Backend  | Tauri v2 (Rust)                   |
| Build    | Vite 7                            |
| IPC      | Tauri invoke / command            |
| TTS      | ChatTTS + Edge TTS (Python sidecar) |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (v1.77+)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload (Windows only)
- [Python](https://python.org/) (v3.11 ~ v3.13 recommended) - optional, for TTS feature

## Getting Started

```bash
# Clone the repo
git clone https://github.com/patt812/comic-viewer.git
cd comic-viewer

# Install frontend dependencies
npm install

# Run in development mode (with hot-reload)
npm run tauri dev

# Build for production
npm run tauri build
```

## Build & Package

### Step 1: Build the TTS server exe

The production installer bundles a standalone TTS server (Edge TTS only, ~14MB). Build it first:

```bash
cd python
pip install -r requirements-edge.txt pyinstaller
pyinstaller tts_server.spec
cp dist/tts_server.exe ../src-tauri/bin/tts_server.exe
cd ..
```

> **Note:** `src-tauri/bin/tts_server.exe` must exist before running `tauri build`. The exe is not committed to git — build it locally.

### Step 2: Build the installer

```bash
npm run tauri build
```

This compiles the Rust backend, builds the React frontend, bundles `tts_server.exe`, and packages everything into installers.

### Output (Windows)

| File | Location | Description |
|------|----------|-------------|
| **NSIS Installer** | `src-tauri/target/release/bundle/nsis/Comic Viewer_0.1.0_x64-setup.exe` | Recommended for distribution. Includes WebView2 bootstrapper. |
| **MSI Installer** | `src-tauri/target/release/bundle/msi/Comic Viewer_0.1.0_x64_en-US.msi` | Alternative installer format. |
| **Standalone EXE** | `src-tauri/target/release/comic-viewer.exe` | Not a proper installer. Requires [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) pre-installed. |

> **Note:** The NSIS `.exe` setup file is the easiest way to distribute — just send the file and double-click to install. WebView2 is automatically installed if not present.

### Bundled TTS

The packaged installer includes a standalone Edge TTS server — **no Python installation required** on the target machine. Edge TTS uses Microsoft's cloud service (requires internet).

For ChatTTS (local, offline), users need to install Python separately with `pip install -r python/requirements.txt`.

## TTS Setup (Optional)

Two TTS engines are available:

- **Edge TTS** — Cloud-based Microsoft TTS. Fast, no model download, supports many voices. Requires internet connection.
- **[ChatTTS](https://github.com/2noise/ChatTTS)** — Local high-quality Chinese/English speech synthesis. Customizable voice parameters. Requires ~1.5GB model download on first use.

### 1. Install Python dependencies

```bash
cd python
pip install -r requirements.txt
```

> **Python version:** 3.11 ~ 3.13 recommended. Python 3.14 also works - `tts_server.py` includes automatic compatibility patches for newer Python/library versions.

> **Edge TTS only?** If you only want Edge TTS (no ChatTTS), you can just install: `pip install flask edge-tts`

### 2. First run

```bash
python tts_server.py
```

The server starts on `http://127.0.0.1:9966`. Edge TTS works immediately. ChatTTS will automatically download model files (~1.5GB) to `python/asset/` on first use.

### 3. Use TTS in the app

1. Open a text file (.md / .txt) in the viewer
2. Click the speaker icon in the top bar to start the TTS server
3. Choose your TTS engine from the dropdown (Edge TTS or ChatTTS)
4. Select any text with your mouse
5. Click the floating "Read Aloud" button that appears
6. Use the bottom audio player to play/pause/stop/save

### 4. Voice tuning (Optional)

A separate Web UI is provided for testing different voice parameters:

```bash
cd python
python tts_webui.py
```

Open `http://127.0.0.1:9977` in your browser. Adjust:
- **Seed** - Different seeds produce different voices
- **Temperature** - Higher = more variation, lower = more stable (default: 0.3)
- **top_P** - Nucleus sampling threshold (default: 0.7)
- **top_K** - Top-K sampling (default: 20)
- **Speed** - Speaking rate, 1-9 (default: 5)

Once you find settings you like, update `_VOICE_SEED` and `InferCodeParams` in `python/tts_server.py`.

## Project Structure

```
comic-viewer/
├── src/                          # React frontend
│   ├── pages/
│   │   ├── HomePage.tsx          # Folder browser + search/sort + grid
│   │   ├── ReaderPage.tsx        # Vertical scroll reader + zoom
│   │   └── TextReaderPage.tsx    # Text/markdown reader + TTS
│   ├── components/
│   │   ├── ComicCard.tsx         # Cover card with lazy load + hover overlay
│   │   ├── ComicGrid.tsx         # Responsive grid layout
│   │   ├── TopBar.tsx            # Navigation bar
│   │   ├── ZoomIndicator.tsx     # Zoom level display
│   │   ├── PageIndicator.tsx     # Page number display
│   │   ├── TtsFloatingButton.tsx # "Read Aloud" button on text selection
│   │   ├── TtsAudioPlayer.tsx    # Audio playback + save controls
│   │   └── TtsStatusIndicator.tsx# TTS server status indicator
│   ├── hooks/
│   │   ├── useZoom.ts            # Zoom state + keyboard/wheel handlers
│   │   ├── useLazyLoad.ts        # IntersectionObserver-based loading
│   │   ├── useLastFolder.ts      # localStorage persistence
│   │   ├── useFontSize.ts        # Font size state with persistence
│   │   ├── useTextSelection.ts   # Mouse text selection detection
│   │   └── useTts.ts             # TTS server + audio + save management
│   ├── App.tsx                   # Router setup
│   ├── types.ts                  # TypeScript interfaces
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands.rs           # All Tauri commands
│   │   ├── lib.rs                # App builder + plugin registration
│   │   └── main.rs               # Desktop entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── python/                       # TTS sidecar (optional)
│   ├── tts_server.py             # ChatTTS + Edge TTS HTTP server (with compat patches)
│   ├── tts_webui.py              # Voice tuning Web UI
│   └── requirements.txt          # Python dependencies
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Rust Backend Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `scan_folder`    | Recursively scans a directory for .zip/.md/.txt files |
| `get_cover`      | Extracts the first image from a ZIP as cover     |
| `get_comic_info` | Returns total page count for a comic             |
| `load_page`      | Loads a single page by index as base64           |
| `load_text_file` | Reads a text file and returns its content        |
| `get_text_info`  | Returns metadata for a text file                 |
| `tts_start`      | Starts the TTS Python server                     |
| `tts_stop`       | Stops the TTS Python server                      |
| `tts_status`     | Returns TTS server status                        |
| `tts_speak`      | Converts text to speech, returns base64 audio    |
| `tts_save_audio` | Saves audio to file via native save dialog       |

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
