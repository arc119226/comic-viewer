"""
ChatTTS HTTP server for Comic Viewer TTS integration.

Endpoints:
  GET  /health  - Health check
  POST /tts     - Convert text to speech, returns base64 WAV audio

Usage:
  pip install -r requirements.txt
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
# DynamicCache compatibility patch
#
# In transformers v5, DynamicCache.get_max_cache_shape() returns -1 to mean
# "unlimited". ChatTTS expects None (the v4 convention from get_max_length()).
# The -1 gets passed as a length to torch.Tensor.narrow(), causing a crash.
# ---------------------------------------------------------------------------

try:
    from transformers.cache_utils import DynamicCache

    _orig_get_max_cache_shape = DynamicCache.get_max_cache_shape

    def _patched_get_max_cache_shape(self, layer_idx=0):
        val = _orig_get_max_cache_shape(self, layer_idx)
        return None if val is not None and val < 0 else val

    DynamicCache.get_max_cache_shape = _patched_get_max_cache_shape
    print("[TTS] Patched DynamicCache.get_max_cache_shape for transformers v5",
          flush=True)
except Exception:
    pass

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
_TTS_CHUNK_MAX = 200

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
        chat.load(compile=use_gpu)  # torch.compile only effective on CUDA

        if use_gpu:
            print(f"[TTS] Using GPU: {torch.cuda.get_device_name(0)}", flush=True)
        else:
            print("[TTS] Using CPU", flush=True)

        # Generate female speaker embedding (deterministic via seed)
        torch.manual_seed(_VOICE_SEED)
        _spk_emb = chat.sample_random_speaker()
        print(f"[TTS] Female voice loaded (seed {_VOICE_SEED})", flush=True)

    return chat


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
    engine = data.get("engine", "chattts")  # "chattts" or "edge-tts"
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

        # ---- ChatTTS (local model, offline) ----
        import wave

        import ChatTTS as ChatTTSModule
        import numpy as np

        chat_instance = get_chat()

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

        # Batch infer all chunks at once for better throughput
        # Note: do NOT skip refine_text — it handles Chinese prosody and pronunciation
        print(f"[TTS]   chunks: {[len(c) for c in chunks]} chars each", flush=True)
        wavs = chat_instance.infer(
            chunks,
            params_infer_code=params,
        )

        all_pcm: list[np.ndarray] = []
        for i, wav in enumerate(wavs):
            audio_data = np.clip(wav, -1.0, 1.0)
            pcm16 = (audio_data * 32767).astype(np.int16)
            all_pcm.append(pcm16)

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
    print("  ChatTTS: model will load on first use", flush=True)
    try:
        import edge_tts  # noqa: F401
        print("  Edge TTS: available", flush=True)
    except ImportError:
        print("  Edge TTS: not installed (pip install edge-tts)", flush=True)
    print(f"  Listening on http://127.0.0.1:9966", flush=True)

    app.run(host="127.0.0.1", port=9966)
