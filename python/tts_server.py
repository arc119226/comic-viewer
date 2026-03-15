"""
TTS HTTP server for Comic Viewer (Edge TTS + optional ChatTTS).

Endpoints:
  GET  /health      - Health check
  POST /tts         - Convert text to speech (engine: "edge-tts" or "chattts")
  POST /test_voice  - Test ChatTTS voice seeds (requires ChatTTS)

Usage:
  pip install -r requirements.txt   # Full install (ChatTTS + Edge TTS)
  pip install flask edge-tts         # Edge TTS only (lightweight)
  python tts_server.py
"""

import os
import sys
import types

# ---------------------------------------------------------------------------
# Pure-Python base16384 shim
#
# pybase16384's Cython and CFFI backends both require compiled C extensions
# that may not be available on newer Python versions (e.g. 3.14).
# ChatTTS only uses two functions: encode_to_string and decode_from_string.
# We provide a pure-Python implementation of the base16384 algorithm here
# and inject it into sys.modules so ChatTTS can import it transparently.
# ---------------------------------------------------------------------------

_B14_BASE = 0x4E00          # Unicode offset for encoded characters
_B14_PAD_BASE = 0x3D00      # Padding marker base (0x3D = '=')
# Number of encoded chars for a partial group of R bytes (1-6)
_B14_RESIDUE_CHARS = {1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4}


def _b14_encode_to_string(data: bytes) -> str:
    """Encode bytes to a base16384 string.

    Every 7 input bytes produce 4 Unicode characters in U+4E00..U+8DFF.
    A partial tail of R bytes (1-6) is padded and followed by a marker char.
    """
    if not data:
        return ""

    chars = []
    bits = 0
    n_bits = 0

    for byte in data:
        bits = (bits << 8) | byte
        n_bits += 8
        while n_bits >= 14:
            n_bits -= 14
            chars.append(chr(((bits >> n_bits) & 0x3FFF) + _B14_BASE))
            bits &= (1 << n_bits) - 1

    residue = len(data) % 7
    if residue > 0 and n_bits > 0:
        # Pad remaining bits with zeros to fill a 14-bit slot
        chars.append(chr(((bits << (14 - n_bits)) & 0x3FFF) + _B14_BASE))
        chars.append(chr(_B14_PAD_BASE + residue))

    return "".join(chars)


def _b14_decode_from_string(data: str) -> bytes:
    """Decode a base16384 string back to the original bytes."""
    if not data:
        return b""

    # Check for padding marker at the end
    residue = 0
    last_ord = ord(data[-1])
    if _B14_PAD_BASE < last_ord <= _B14_PAD_BASE + 6:
        residue = last_ord - _B14_PAD_BASE
        data = data[:-1]

    bits = 0
    n_bits = 0
    result = bytearray()

    for ch in data:
        bits = (bits << 14) | ((ord(ch) - _B14_BASE) & 0x3FFF)
        n_bits += 14
        while n_bits >= 8:
            n_bits -= 8
            result.append((bits >> n_bits) & 0xFF)
            bits &= (1 << n_bits) - 1

    if residue > 0:
        # The partial group may have decoded extra zero-padded bytes; truncate
        rem_chars = _B14_RESIDUE_CHARS[residue]
        n_full = (len(data) - rem_chars) // 4
        expected = n_full * 7 + residue
        result = result[:expected]

    return bytes(result)


def _install_pybase16384_shim():
    """Inject a pure-Python pybase16384 module into sys.modules."""
    mod = types.ModuleType("pybase16384")
    mod.__version__ = "0.3.4-pure"
    mod.encode_to_string = _b14_encode_to_string
    mod.decode_from_string = _b14_decode_from_string
    # Also provide the lower-level names that __init__.py normally exports,
    # in case anything else tries to import them.
    mod.encode = lambda data: _b14_encode_to_string(data).encode("utf-16-be")
    mod.decode = lambda data: _b14_decode_from_string(data.decode("utf-16-be"))
    mod.encode_from_string = lambda s, write_head=False: _b14_encode_to_string(
        s.encode()
    ).encode("utf-16-be")
    mod.decode_from_bytes = lambda data: _b14_decode_from_string(
        data.decode("utf-16-be")
    ).decode()
    mod.encode_string = lambda s: _b14_encode_to_string(s.encode())
    mod.decode_string = lambda s: _b14_decode_from_string(s).decode()
    # Remove any leftover sub-modules from a failed real import attempt
    for key in [k for k in sys.modules if k.startswith("pybase16384")]:
        del sys.modules[key]
    sys.modules["pybase16384"] = mod


# Try to import the real pybase16384; fall back to our shim if it fails
try:
    import pybase16384 as _test_b14
    # Quick smoke test to ensure the backend actually works
    _test_b14.encode_to_string(b"\x00")
    del _test_b14
except Exception:
    print("[TTS] pybase16384 native backend unavailable, using pure-Python shim",
          flush=True)
    _install_pybase16384_shim()

# ---------------------------------------------------------------------------
# Transformers v5 compatibility patch
#
# transformers >=5.0 removed the public `encode_plus` method from tokenizers.
# ChatTTS 0.2.x still calls `tokenizer.encode_plus(...)`.
# We patch it back as an alias for `__call__` so ChatTTS works unchanged.
# ---------------------------------------------------------------------------

try:
    from transformers import PreTrainedTokenizerFast

    if not hasattr(PreTrainedTokenizerFast, "encode_plus"):

        def _compat_encode_plus(
            self,
            text,
            text_pair=None,
            add_special_tokens=True,
            padding=False,
            truncation=False,
            max_length=None,
            stride=0,
            is_split_into_words=False,
            pad_to_multiple_of=None,
            return_tensors=None,
            return_token_type_ids=None,
            return_attention_mask=None,
            return_overflowing_tokens=False,
            return_special_tokens_mask=False,
            return_offsets_mapping=False,
            return_length=False,
            verbose=True,
            **kwargs,
        ):
            """Compatibility shim: encode_plus removed in transformers v5."""
            padding_strategy, truncation_strategy, max_length, kwargs = (
                self._get_padding_truncation_strategies(
                    padding=padding,
                    truncation=truncation,
                    max_length=max_length,
                    pad_to_multiple_of=pad_to_multiple_of,
                    verbose=verbose,
                    **kwargs,
                )
            )
            return self._encode_plus(
                text=text,
                text_pair=text_pair,
                add_special_tokens=add_special_tokens,
                padding_strategy=padding_strategy,
                truncation_strategy=truncation_strategy,
                max_length=max_length,
                stride=stride,
                is_split_into_words=is_split_into_words,
                pad_to_multiple_of=pad_to_multiple_of,
                return_tensors=return_tensors,
                return_token_type_ids=return_token_type_ids,
                return_attention_mask=return_attention_mask,
                return_overflowing_tokens=return_overflowing_tokens,
                return_special_tokens_mask=return_special_tokens_mask,
                return_offsets_mapping=return_offsets_mapping,
                return_length=return_length,
                verbose=verbose,
                **kwargs,
            )

        PreTrainedTokenizerFast.encode_plus = _compat_encode_plus
        print("[TTS] Patched tokenizer.encode_plus for transformers v5 compat",
              flush=True)
except Exception:
    pass

# ---------------------------------------------------------------------------
# DynamicCache compatibility patches
#
# ChatTTS's GPT model (gpt.py) was written against a newer transformers API.
# transformers 4.52.1's DynamicCache may lack some attributes/behaviors:
#
# 1. get_max_cache_shape() signature changed: the original takes only (self),
#    but ChatTTS passes extra args. Also it returns -1 meaning "unlimited" in
#    some versions — ChatTTS expects None. We normalize the signature and value.
#
# 2. ChatTTS accesses cache.layers (a list of per-layer cache entries) which
#    doesn't exist in transformers 4.52.x. We add it as an alias for key_cache
#    via both __init__ wrapper and __getattr__ fallback.
#
# 3. ChatTTS uses get_max_length() as a deprecated fallback, which also doesn't
#    exist. We provide it via __getattr__.
# ---------------------------------------------------------------------------

def _patch_dynamic_cache():
    """Patch DynamicCache for ChatTTS compatibility.

    1. get_max_cache_shape() returns -1 in some versions meaning "unlimited".
       ChatTTS expects None (the v4 convention). The -1 gets passed as a length
       to torch.Tensor.narrow(), causing a crash.

    2. ChatTTS accesses cache.layers (a list of per-layer cache entries) which
       doesn't exist in transformers 4.52.x. We add it via both:
       - A __init__ wrapper that sets self.layers = self.key_cache
       - A __getattr__ fallback for cases where __init__ is bypassed
    """
    try:
        from transformers.cache_utils import DynamicCache, Cache

        # Patch 1: get_max_cache_shape -1 → None
        if not getattr(DynamicCache.get_max_cache_shape, "_patched", False):
            _orig = DynamicCache.get_max_cache_shape

            def _patched_get_max_cache_shape(self, *args, **kwargs):
                try:
                    val = _orig(self)
                except TypeError:
                    val = None
                return None if val is not None and val < 0 else val

            _patched_get_max_cache_shape._patched = True
            DynamicCache.get_max_cache_shape = _patched_get_max_cache_shape

        # Patch 2a: Wrap DynamicCache.__init__ to set self.layers
        if not getattr(DynamicCache.__init__, "_layers_patched", False):
            _orig_init = DynamicCache.__init__

            def _patched_init(self, *args, **kwargs):
                _orig_init(self, *args, **kwargs)
                self.layers = self.key_cache

            _patched_init._layers_patched = True
            DynamicCache.__init__ = _patched_init

        # Patch 2b: Also add __getattr__ fallback on Cache base class.
        # This catches cases where DynamicCache is instantiated without
        # calling __init__ (e.g. via __new__ + manual setup).
        if not getattr(Cache, "_layers_getattr_patched", False):
            _orig_getattr = getattr(Cache, "__getattr__", None)

            def _cache_getattr(self, name):
                if name == "layers":
                    return self.key_cache
                if name == "get_max_length":
                    # Deprecated alias used by older ChatTTS code as fallback
                    return lambda: None
                if _orig_getattr is not None:
                    return _orig_getattr(self, name)
                raise AttributeError(
                    f"'{type(self).__name__}' object has no attribute '{name}'"
                )

            Cache.__getattr__ = _cache_getattr
            Cache._layers_getattr_patched = True

        return True
    except Exception:
        return False

if _patch_dynamic_cache():
    print("[TTS] Patched DynamicCache for ChatTTS compatibility", flush=True)

# ---------------------------------------------------------------------------
# Detect ChatTTS availability
# ---------------------------------------------------------------------------

_CHATTTS_AVAILABLE = False
try:
    import ChatTTS as _test_chattts
    _CHATTTS_AVAILABLE = True
    del _test_chattts
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Detect Index-TTS availability (runs in separate venv via subprocess)
# ---------------------------------------------------------------------------

_INDEXTTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index-tts")
_INDEXTTS_VENV_PYTHON = os.path.join(_INDEXTTS_DIR, ".venv", "Scripts", "python.exe")

# uv-created venvs use a trampoline shim; the pyvenv.cfg `home` key points
# to the real interpreter.  On Windows the `home` path may be an app-execution
# alias (reparse point into an MSIX sandbox) that fails under certain parent
# processes (e.g. Tauri/Rust child process).  We build a list of candidate
# Python paths, probe-test each at startup, and use the first one that works.
import subprocess as _sp

def _resolve_venv_pythons(venv_dir: str, venv_python: str) -> list[str]:
    """Return candidate Python interpreter paths (best-first) for a uv venv.

    On Windows, uv installed via MSIX apps (e.g. Claude Desktop) stores Python
    at ``AppData\\Roaming\\uv\\...`` which is actually an app-execution alias
    redirecting to ``AppData\\Local\\Packages\\{id}\\LocalCache\\Roaming\\uv\\...``.
    Both os.path.realpath() and the uv trampoline may fail to resolve this alias
    when running as a child of Tauri/Rust.  We try multiple resolution strategies
    and probe-test each candidate to find one that actually works.
    """
    candidates: list[str] = []
    cfg = os.path.join(venv_dir, "pyvenv.cfg")
    home = None
    try:
        with open(cfg, encoding="utf-8-sig") as f:
            for line in f:
                parts = line.split("=", 1)
                if len(parts) == 2 and parts[0].strip() == "home":
                    home = parts[1].strip()
                    break
    except FileNotFoundError:
        print(f"  [resolve] pyvenv.cfg not found: {cfg}", flush=True)

    if home:
        real = os.path.join(home, "python.exe")
        print(f"  [resolve] pyvenv.cfg home={home}", flush=True)

        # Strategy 1: os.path.realpath() may resolve MSIX alias
        resolved = os.path.realpath(real)
        if resolved != real:
            print(f"  [resolve] realpath  ={resolved}", flush=True)
            candidates.append(resolved)

        # Strategy 2: Manually resolve MSIX AppData\Roaming → LocalCache\Roaming
        # MSIX apps redirect AppData\Roaming to
        # AppData\Local\Packages\{PackageFamilyName}\LocalCache\Roaming
        roaming = os.path.join(os.path.expanduser("~"), "AppData", "Roaming")
        if real.startswith(roaming + os.sep):
            local_pkgs = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Packages")
            if os.path.isdir(local_pkgs):
                rel = real[len(roaming):]  # e.g. \uv\python\...\python.exe
                try:
                    for pkg in os.listdir(local_pkgs):
                        msix_path = os.path.join(
                            local_pkgs, pkg, "LocalCache", "Roaming"
                        ) + rel
                        if os.path.isfile(msix_path) and msix_path not in candidates:
                            print(f"  [resolve] MSIX found={msix_path}", flush=True)
                            candidates.append(msix_path)
                except OSError:
                    pass

        # Strategy 3: the pyvenv.cfg path itself (may be an alias but worth trying)
        if real not in candidates:
            candidates.append(real)

    # Strategy 4: venv shim (uv trampoline — real exe but may also fail if it
    # internally resolves to the same broken alias path)
    if venv_python not in candidates:
        candidates.append(venv_python)

    return candidates


def _probe_python(candidates: list[str]) -> str | None:
    """Probe-test candidates and return the first one that actually works."""
    for py in candidates:
        try:
            r = _sp.run(
                [py, "-c", "import sys; print(sys.version_info[:2])"],
                capture_output=True, text=True, timeout=10,
                encoding="utf-8", errors="replace",
            )
            if r.returncode == 0:
                print(f"  [resolve] probe OK : {py}", flush=True)
                return py
            print(f"  [resolve] probe rc={r.returncode}: {py}", flush=True)
        except OSError as e:
            print(f"  [resolve] probe ERR: {py} -> {e}", flush=True)
        except _sp.TimeoutExpired:
            print(f"  [resolve] probe timeout: {py}", flush=True)
    return None


_INDEXTTS_VENV_DIR = os.path.join(_INDEXTTS_DIR, ".venv")
_INDEXTTS_PYTHON_CANDIDATES = _resolve_venv_pythons(_INDEXTTS_VENV_DIR, _INDEXTTS_VENV_PYTHON)
_INDEXTTS_VERIFIED_PYTHON = _probe_python(_INDEXTTS_PYTHON_CANDIDATES)
_INDEXTTS_AVAILABLE = _INDEXTTS_VERIFIED_PYTHON is not None

# ---------------------------------------------------------------------------

import asyncio
import base64
import io

import re

from flask import Flask, request, jsonify

app = Flask(__name__)
chat = None
_spk_emb = None  # Female speaker embedding, generated once at model load

# ---------------------------------------------------------------------------
# Edge TTS support
# ---------------------------------------------------------------------------

# Default Edge TTS voice (Traditional Chinese female)
_EDGE_TTS_VOICE = "zh-TW-HsiaoChenNeural"


def _edge_tts_synthesize(text: str, voice: str = _EDGE_TTS_VOICE) -> bytes:
    """Synthesize text to MP3 bytes using edge-tts (Microsoft Edge free TTS)."""
    import edge_tts

    async def _run():
        communicate = edge_tts.Communicate(text, voice)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        return b"".join(chunks)

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run())
    finally:
        loop.close()

# Maximum characters per TTS chunk. ChatTTS works best with short segments;
# longer inputs are split at sentence boundaries and inferred separately.
_TTS_CHUNK_MAX = 100

# Female voice seed (known good female voice)
_VOICE_SEED = 5098


def get_chat():
    """Lazy-load ChatTTS model on first use with GPU auto-detect."""
    global chat, _spk_emb
    if chat is None:
        import ChatTTS
        import torch

        use_gpu = torch.cuda.is_available()
        chat = ChatTTS.Chat()
        # compile=False: torch.compile requires Triton which is not available on Windows
        # source='huggingface': rvcmd (default downloader) crashes on Windows
        chat.load(compile=False, source="huggingface")

        if use_gpu:
            print(f"[TTS] Using GPU: {torch.cuda.get_device_name(0)}", flush=True)
        else:
            print("[TTS] Using CPU", flush=True)

        # Generate female speaker embedding (deterministic via seed)
        torch.manual_seed(_VOICE_SEED)
        _spk_emb = chat.sample_random_speaker()
        print(f"[TTS] Female voice loaded (seed {_VOICE_SEED})", flush=True)

    return chat


# ---------------------------------------------------------------------------
# Index-TTS subprocess helper (runs in its own venv to avoid dep conflicts)
# ---------------------------------------------------------------------------

_DEFAULT_VOICE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voices", "default.wav")


def _indextts_infer(text: str, voice_path: str, output_path: str) -> None:
    """Run Index-TTS inference via subprocess in its own venv.

    Uses the probe-verified Python interpreter found at startup.
    """
    # Ensure the helper Python script exists
    helper_py = os.path.join(_INDEXTTS_DIR, "_run_infer.py")
    if not os.path.isfile(helper_py):
        with open(helper_py, "w", encoding="utf-8") as f:
            f.write(
                "import sys, os\n"
                f"os.chdir(r'{_INDEXTTS_DIR}')\n"
                "from indextts.infer import IndexTTS\n"
                "tts = IndexTTS(model_dir='checkpoints', cfg_path='checkpoints/config.yaml')\n"
                "tts.infer(audio_prompt=sys.argv[1], text=sys.argv[2], output_path=sys.argv[3])\n"
            )

    site_pkgs = os.path.join(_INDEXTTS_VENV_DIR, "Lib", "site-packages")
    env = os.environ.copy()
    # Remove Python env vars that could conflict with the venv's Python 3.10
    for key in ("PYTHONHOME", "PYTHONPATH", "PYTHONEXECUTABLE",
                "_MEIPASS", "_MEIPASS2", "_PYI_SPLASH_IPC"):
        env.pop(key, None)
    env["PYTHONPATH"] = site_pkgs
    env["PYTHONIOENCODING"] = "utf-8"

    python_exe = _INDEXTTS_VERIFIED_PYTHON
    print(f"[TTS] Index-TTS subprocess: python={python_exe}", flush=True)
    result = _sp.run(
        [python_exe, helper_py, voice_path, text, output_path],
        cwd=_INDEXTTS_DIR,
        capture_output=True,
        text=True,
        timeout=600,
        env=env,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Index-TTS failed: {result.stderr[-500:] if result.stderr else 'unknown error'}"
        )


def _split_text(text: str, max_len: int = _TTS_CHUNK_MAX) -> list[str]:
    """Split *text* into chunks of roughly *max_len* chars at sentence boundaries.

    Tries to break at Chinese/English sentence-ending punctuation first,
    then at commas / clause breaks, and finally hard-cuts if a segment is
    still too long.
    """
    if len(text) <= max_len:
        return [text]

    # Split on sentence-ending punctuation (keep the delimiter with the chunk)
    parts = re.split(r"(?<=[。！？.!?\n])", text)
    chunks: list[str] = []
    current = ""

    for part in parts:
        if not part:
            continue
        if len(current) + len(part) <= max_len:
            current += part
        else:
            if current:
                chunks.append(current)
            # If this single part exceeds max_len, split further at commas
            if len(part) > max_len:
                sub_parts = re.split(r"(?<=[，,、；;：:\s])", part)
                for sp in sub_parts:
                    if not sp:
                        continue
                    if len(current) + len(sp) <= max_len:
                        current += sp
                    else:
                        if current:
                            chunks.append(current)
                        # Hard-cut if still too long
                        while len(sp) > max_len:
                            chunks.append(sp[:max_len])
                            sp = sp[max_len:]
                        current = sp
            else:
                current = part

    if current:
        chunks.append(current)

    return [c for c in chunks if c.strip()]


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/test_voice", methods=["POST"])
def test_voice():
    """Test different voice seeds. POST {"seed": 3333, "text": "..."}"""
    if not _CHATTTS_AVAILABLE:
        return jsonify({"error": "ChatTTS is not available in this build"}), 400

    import wave

    import ChatTTS as ChatTTSModule
    import numpy as np
    import torch

    data = request.get_json(silent=True) or {}
    seed = data.get("seed", 3333)
    text = data.get("text", "你好，我是語音助手，很高興認識你。")

    try:
        chat_instance = get_chat()
        torch.manual_seed(seed)
        test_spk = chat_instance.sample_random_speaker()
        params = ChatTTSModule.Chat.InferCodeParams(
            spk_emb=test_spk, temperature=0.3, top_P=0.7, top_K=20,
        )
        wavs = chat_instance.infer([text], params_infer_code=params)
        audio_data = np.clip(wavs[0], -1.0, 1.0)
        pcm16 = (audio_data * 32767).astype(np.int16)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(pcm16.tobytes())
        audio_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        print(f"[TTS] Test voice seed={seed} OK", flush=True)
        return jsonify({"audio": audio_b64, "format": "wav", "seed": seed})
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route("/tts", methods=["POST"])
def tts():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()
    engine = data.get("engine", "chattts")  # "chattts", "edge-tts", or "index-tts"
    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        # ---- Edge TTS (cloud-based, fast, no model needed) ----
        if engine == "edge-tts":
            voice = data.get("voice", _EDGE_TTS_VOICE)
            print(f"[TTS] Edge TTS: {len(text)} chars, voice={voice}", flush=True)
            mp3_bytes = _edge_tts_synthesize(text, voice)
            audio_b64 = base64.b64encode(mp3_bytes).decode("utf-8")
            return jsonify({"audio": audio_b64, "format": "mp3"})

        # ---- Index-TTS (local voice cloning, runs in separate venv) ----
        if engine == "index-tts":
            if not _INDEXTTS_AVAILABLE:
                return jsonify({
                    "error": "Index-TTS is not available. "
                             "Set up with: cd python && git clone https://github.com/index-tts/index-tts.git "
                             "&& cd index-tts && uv sync --all-extras"
                }), 400

            import tempfile

            voice_path = data.get("voice_path", _DEFAULT_VOICE_PATH)
            if not os.path.isfile(voice_path):
                return jsonify({
                    "error": f"Voice reference file not found: {voice_path}. "
                             f"Place a WAV file at {_DEFAULT_VOICE_PATH} or pick one in the UI."
                }), 400

            print(f"[TTS] Index-TTS: {len(text)} chars, voice={os.path.basename(voice_path)}",
                  flush=True)

            tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
            os.close(tmp_fd)
            try:
                _indextts_infer(text, voice_path, tmp_path)
                with open(tmp_path, "rb") as f:
                    wav_bytes = f.read()
                audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")
                return jsonify({"audio": audio_b64, "format": "wav"})
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        # ---- ChatTTS (local model, offline) ----
        if not _CHATTTS_AVAILABLE:
            return jsonify({
                "error": "ChatTTS is not available. Use Edge TTS, "
                         "or install Python + requirements.txt for ChatTTS."
            }), 400

        import wave

        import ChatTTS as ChatTTSModule
        import numpy as np

        chat_instance = get_chat()

        # Clean text for ChatTTS: remove characters it can't handle
        text = re.sub(r"\r\n?", "\n", text)          # normalize line endings
        text = text.replace("\u3000", " ")             # full-width space → normal space
        text = re.sub(r"[^\S ]+", " ", text)           # collapse whitespace to space
        text = re.sub(r"[""''「」『』【】]", "", text)  # remove fancy quotes/brackets
        text = re.sub(r"[a-zA-Z0-9]+", lambda m: " " + m.group() + " ", text)  # pad alphanumeric
        text = re.sub(r"([。！？!?]){2,}", r"\1", text)  # deduplicate ending punctuation
        text = re.sub(r"\s+", " ", text).strip()       # collapse multiple spaces

        # Split long text into manageable chunks for faster, more reliable inference
        chunks = _split_text(text)
        print(f"[TTS] ChatTTS: {len(chunks)} chunk(s), total {len(text)} chars",
              flush=True)

        # Build inference params with female voice
        params = ChatTTSModule.Chat.InferCodeParams(
            spk_emb=_spk_emb,
            temperature=0.42,
            top_P=0.40,
            top_K=28,
            prompt="[speed_5]",
        )

        # Infer one chunk at a time with retry to avoid batch failures
        print(f"[TTS]   chunks: {[len(c) for c in chunks]} chars each", flush=True)
        all_pcm: list[np.ndarray] = []
        max_retries = 3
        for ci, chunk in enumerate(chunks):
            wav_ok = None
            for attempt in range(max_retries):
                result = chat_instance.infer(
                    [chunk],
                    skip_refine_text=True,
                    params_infer_code=params,
                )
                if result and len(result) > 0 and result[0] is not None and len(result[0]) > 0:
                    wav_ok = result[0]
                    break
                print(f"[TTS]   chunk {ci} attempt {attempt+1}/{max_retries} failed, retrying...",
                      flush=True)
            if wav_ok is None:
                print(f"[TTS]   chunk {ci} skipped after {max_retries} retries", flush=True)
                continue
            audio_data = np.clip(wav_ok, -1.0, 1.0)
            pcm16 = (audio_data * 32767).astype(np.int16)
            all_pcm.append(pcm16)

        if not all_pcm:
            return jsonify({"error": "ChatTTS failed to generate audio for all chunks"}), 500

        # Concatenate all chunks
        combined = np.concatenate(all_pcm) if len(all_pcm) > 1 else all_pcm[0]

        # Encode as WAV using stdlib wave module
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(24000)
            wf.writeframes(combined.tobytes())
        audio_bytes = buf.getvalue()
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        return jsonify({"audio": audio_b64, "format": "wav"})
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[TTS] Error: {tb}", flush=True)
        return jsonify({"error": str(e), "traceback": tb}), 500


if __name__ == "__main__":
    print("TTS server starting...", flush=True)
    if _CHATTTS_AVAILABLE:
        print("  ChatTTS: available (model loads on first use)", flush=True)
    else:
        print("  ChatTTS: not installed (Edge TTS only mode)", flush=True)
    try:
        import edge_tts  # noqa: F401
        print("  Edge TTS: available", flush=True)
    except ImportError:
        print("  Edge TTS: not installed (pip install edge-tts)", flush=True)
    if _INDEXTTS_AVAILABLE:
        print(f"  Index-TTS: available (venv at {_INDEXTTS_DIR})", flush=True)
        print(f"  Index-TTS python: {_INDEXTTS_VERIFIED_PYTHON}", flush=True)
    else:
        print(f"  Index-TTS: not found (expected venv at {_INDEXTTS_DIR})", flush=True)
    print(f"  Listening on http://127.0.0.1:9966", flush=True)

    app.run(host="127.0.0.1", port=9966)
