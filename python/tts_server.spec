# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for building tts_server.exe (Edge TTS only).

Usage:
    cd python
    pip install -r requirements-edge.txt pyinstaller
    pyinstaller tts_server.spec
    # Output: dist/tts_server.exe
"""

from PyInstaller.utils.hooks import collect_data_files

# Collect SSL certificates (needed for Edge TTS HTTPS connections)
certifi_datas = collect_data_files("certifi")

a = Analysis(
    ["tts_server.py"],
    pathex=[],
    binaries=[],
    datas=certifi_datas,
    hiddenimports=[
        # edge-tts and its async HTTP dependencies
        "aiohttp",
        "certifi",
        "edge_tts",
        "edge_tts.communicate",
        "edge_tts.list_voices",
        # Flask
        "flask",
        "flask.json",
        "jinja2",
        "markupsafe",
        "werkzeug",
        "werkzeug.serving",
        # asyncio on Windows
        "asyncio",
        "asyncio.windows_events",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude ChatTTS and heavy ML dependencies (not needed for Edge TTS)
        "ChatTTS",
        "torch",
        "torchaudio",
        "numpy",
        "transformers",
        "pybase16384",
        "scipy",
        "pandas",
        "matplotlib",
        "PIL",
        "cv2",
        "pytest",
        "unittest",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="tts_server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    icon=None,
)
