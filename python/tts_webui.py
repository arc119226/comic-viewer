"""
ChatTTS Voice Tuning Web UI

Usage:
  cd D:\\gitcode\\comic-viewer\\python
  python tts_webui.py

Then open http://127.0.0.1:9977 in your browser.
"""

# Import tts_server first to trigger all compatibility patches
# (base16384 shim, transformers v5 encode_plus, DynamicCache fix)
import tts_server  # noqa: F401

import base64
import io
import random
import wave

import ChatTTS as ChatTTSModule
import numpy as np
import torch
from flask import Flask, jsonify, request

app = Flask(__name__)
chat = None


def get_chat():
    global chat
    if chat is None:
        chat = ChatTTSModule.Chat()
        use_gpu = torch.cuda.is_available()
        chat.load(compile=use_gpu)
        if use_gpu:
            print(f"[WebUI] Using GPU: {torch.cuda.get_device_name(0)}", flush=True)
        else:
            print("[WebUI] Using CPU", flush=True)
    return chat


HTML_PAGE = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ChatTTS Voice Tuning</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e; color: #eee; min-height: 100vh;
    display: flex; justify-content: center; padding: 30px 16px;
  }
  .container { max-width: 700px; width: 100%; }
  h1 { text-align: center; margin-bottom: 24px; font-size: 1.6em; color: #e0e0ff; }

  .card {
    background: #16213e; border-radius: 12px; padding: 24px;
    margin-bottom: 16px; border: 1px solid #0f3460;
  }
  label { display: block; font-size: 0.9em; color: #a0a0c0; margin-bottom: 6px; }
  textarea {
    width: 100%; height: 80px; background: #0f3460; border: 1px solid #1a3a6e;
    border-radius: 8px; color: #eee; padding: 10px; font-size: 0.95em;
    resize: vertical; outline: none;
  }
  textarea:focus { border-color: #4a9eff; }

  .param-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    margin-bottom: 12px;
  }
  .param-group { margin-bottom: 12px; }
  .param-label {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.9em; color: #a0a0c0; margin-bottom: 4px;
  }
  .param-value {
    background: #0f3460; border: 1px solid #1a3a6e; border-radius: 4px;
    padding: 2px 8px; color: #4a9eff; font-weight: bold; font-size: 0.85em;
    min-width: 48px; text-align: center;
  }
  input[type="range"] {
    width: 100%; height: 6px; -webkit-appearance: none; appearance: none;
    background: #0f3460; border-radius: 3px; outline: none;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px;
    border-radius: 50%; background: #4a9eff; cursor: pointer;
  }

  .seed-row {
    display: flex; gap: 10px; align-items: center;
  }
  input[type="number"] {
    flex: 1; background: #0f3460; border: 1px solid #1a3a6e;
    border-radius: 8px; color: #eee; padding: 8px 12px; font-size: 1em;
    outline: none;
  }
  input[type="number"]:focus { border-color: #4a9eff; }

  .btn {
    padding: 10px 20px; border: none; border-radius: 8px;
    font-size: 0.95em; cursor: pointer; transition: all 0.2s;
    font-weight: 600;
  }
  .btn-secondary {
    background: #0f3460; color: #4a9eff;
  }
  .btn-secondary:hover { background: #1a4a80; }
  .btn-primary {
    background: #4a9eff; color: #fff; width: 100%; padding: 14px;
    font-size: 1.1em; margin-top: 8px;
  }
  .btn-primary:hover { background: #3a8eef; }
  .btn-primary:disabled {
    background: #2a4a6e; color: #666; cursor: not-allowed;
  }

  .audio-section {
    text-align: center; margin-top: 12px;
  }
  audio { width: 100%; margin-top: 8px; }

  .status {
    text-align: center; padding: 12px; font-size: 0.9em; color: #a0a0c0;
  }
  .status.error { color: #ff6b6b; }
  .status.loading { color: #ffd93d; }

  .params-display {
    background: #0f3460; border-radius: 8px; padding: 12px 16px;
    font-family: 'Consolas', 'Monaco', monospace; font-size: 0.85em;
    color: #4a9eff; white-space: pre-wrap; word-break: break-all;
    user-select: all; cursor: pointer; position: relative;
  }
  .params-display:hover::after {
    content: '點擊複製'; position: absolute; top: 4px; right: 8px;
    font-size: 0.75em; color: #a0a0c0;
  }

  .history { margin-top: 12px; }
  .history-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; background: #0f3460; border-radius: 8px;
    margin-bottom: 6px; cursor: pointer; transition: background 0.2s;
  }
  .history-item:hover { background: #1a4a80; }
  .history-item .seed-tag {
    background: #4a9eff; color: #fff; padding: 2px 8px;
    border-radius: 4px; font-size: 0.8em; font-weight: bold;
  }
  .history-item audio { flex: 1; height: 32px; }
</style>
</head>
<body>
<div class="container">
  <h1>ChatTTS Voice Tuning</h1>

  <!-- Text Input -->
  <div class="card">
    <label>測試文字</label>
    <textarea id="text">你好，我是語音助手，很高興認識你。今天天氣真好，我們一起出去走走吧。</textarea>
  </div>

  <!-- Parameters -->
  <div class="card">
    <div class="param-group">
      <label>Voice Seed</label>
      <div class="seed-row">
        <input type="number" id="seed" value="2" min="0" max="99999">
        <button class="btn btn-secondary" onclick="randomSeed()">隨機</button>
      </div>
    </div>

    <div class="param-row">
      <div class="param-group">
        <div class="param-label">
          <span>Temperature</span>
          <span class="param-value" id="tempVal">0.30</span>
        </div>
        <input type="range" id="temperature" min="0.01" max="1.0" step="0.01" value="0.3"
               oninput="document.getElementById('tempVal').textContent=parseFloat(this.value).toFixed(2)">
      </div>
      <div class="param-group">
        <div class="param-label">
          <span>top_P</span>
          <span class="param-value" id="topPVal">0.70</span>
        </div>
        <input type="range" id="topP" min="0.1" max="0.95" step="0.01" value="0.7"
               oninput="document.getElementById('topPVal').textContent=parseFloat(this.value).toFixed(2)">
      </div>
    </div>

    <div class="param-row">
      <div class="param-group">
        <div class="param-label">
          <span>top_K</span>
          <span class="param-value" id="topKVal">20</span>
        </div>
        <input type="range" id="topK" min="1" max="50" step="1" value="20"
               oninput="document.getElementById('topKVal').textContent=this.value">
      </div>
      <div class="param-group">
        <div class="param-label">
          <span>Speed</span>
          <span class="param-value" id="speedVal">5</span>
        </div>
        <input type="range" id="speed" min="1" max="9" step="1" value="5"
               oninput="document.getElementById('speedVal').textContent=this.value">
      </div>
    </div>

    <button class="btn btn-primary" id="genBtn" onclick="generate()">
      生成語音
    </button>
  </div>

  <!-- Status & Audio -->
  <div class="card">
    <div class="status" id="status">準備就緒，請點擊「生成語音」</div>
    <div class="audio-section" id="audioSection" style="display:none">
      <audio id="audioPlayer" controls></audio>
    </div>
  </div>

  <!-- Current Params Display -->
  <div class="card">
    <label>當前參數（點擊複製，貼給 Claude）</label>
    <div class="params-display" id="paramsDisplay" onclick="copyParams()">
seed=2, temperature=0.3, top_P=0.7, top_K=20, speed=5
    </div>
  </div>

  <!-- History -->
  <div class="card">
    <label>歷史記錄</label>
    <div class="history" id="history">
      <div class="status">還沒有生成記錄</div>
    </div>
  </div>
</div>

<script>
function randomSeed() {
  document.getElementById('seed').value = Math.floor(Math.random() * 10000);
}

function updateParamsDisplay() {
  const seed = document.getElementById('seed').value;
  const temp = parseFloat(document.getElementById('temperature').value).toFixed(2);
  const topP = parseFloat(document.getElementById('topP').value).toFixed(2);
  const topK = document.getElementById('topK').value;
  const speed = document.getElementById('speed').value;
  document.getElementById('paramsDisplay').textContent =
    `seed=${seed}, temperature=${temp}, top_P=${topP}, top_K=${topK}, speed=${speed}`;
}

function copyParams() {
  const text = document.getElementById('paramsDisplay').textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    const el = document.getElementById('paramsDisplay');
    const orig = el.textContent;
    el.textContent = '已複製！';
    setTimeout(() => { el.textContent = orig; }, 800);
  });
}

let historyItems = [];

async function generate() {
  const btn = document.getElementById('genBtn');
  const status = document.getElementById('status');
  const audioSection = document.getElementById('audioSection');
  const audioPlayer = document.getElementById('audioPlayer');

  const text = document.getElementById('text').value.trim();
  const seed = parseInt(document.getElementById('seed').value);
  const temperature = parseFloat(document.getElementById('temperature').value);
  const topP = parseFloat(document.getElementById('topP').value);
  const topK = parseInt(document.getElementById('topK').value);
  const speed = parseInt(document.getElementById('speed').value);

  if (!text) { status.textContent = '請輸入測試文字'; status.className = 'status error'; return; }

  btn.disabled = true;
  btn.textContent = '生成中...請稍候';
  status.textContent = `正在用 seed=${seed} 生成語音...`;
  status.className = 'status loading';
  audioSection.style.display = 'none';

  updateParamsDisplay();

  try {
    const resp = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, seed, temperature, top_P: topP, top_K: topK, speed })
    });
    const data = await resp.json();
    if (data.error) {
      status.textContent = '錯誤: ' + data.error;
      status.className = 'status error';
      return;
    }

    const audioSrc = 'data:audio/wav;base64,' + data.audio;
    audioPlayer.src = audioSrc;
    audioSection.style.display = 'block';
    audioPlayer.play();
    status.textContent = `seed=${seed} 生成完成！`;
    status.className = 'status';

    // Add to history
    addHistory(seed, temperature, topP, topK, speed, audioSrc);

  } catch (e) {
    status.textContent = '請求失敗: ' + e.message;
    status.className = 'status error';
  } finally {
    btn.disabled = false;
    btn.textContent = '生成語音';
  }
}

function addHistory(seed, temp, topP, topK, speed, audioSrc) {
  historyItems.unshift({ seed, temp, topP, topK, speed, audioSrc });
  if (historyItems.length > 20) historyItems.pop();

  const container = document.getElementById('history');
  container.innerHTML = '';
  historyItems.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span class="seed-tag">seed ${item.seed}</span>
      <span style="font-size:0.75em;color:#a0a0c0">
        t=${item.temp} P=${item.topP} K=${item.topK} spd=${item.speed}
      </span>
      <audio src="${item.audioSrc}" controls style="flex:1;height:32px"></audio>
    `;
    container.appendChild(div);
  });
}
</script>
</body>
</html>"""


@app.route("/")
def index():
    return HTML_PAGE


@app.route("/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()
    seed = int(data.get("seed", 2))
    temperature = float(data.get("temperature", 0.3))
    top_P = float(data.get("top_P", 0.7))
    top_K = int(data.get("top_K", 20))
    speed = int(data.get("speed", 5))

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        chat_instance = get_chat()

        # Generate speaker embedding from seed
        torch.manual_seed(seed)
        spk_emb = chat_instance.sample_random_speaker()

        # Build inference params
        params = ChatTTSModule.Chat.InferCodeParams(
            spk_emb=spk_emb,
            temperature=temperature,
            top_P=top_P,
            top_K=top_K,
            prompt=f"[speed_{speed}]",
        )

        print(f"[WebUI] Generating: seed={seed} temp={temperature} "
              f"top_P={top_P} top_K={top_K} speed={speed}", flush=True)

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
        return jsonify({"audio": audio_b64, "format": "wav", "seed": seed})

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[WebUI] Error: {tb}", flush=True)
        return jsonify({"error": str(e), "traceback": tb}), 500


if __name__ == "__main__":
    print("=" * 50, flush=True)
    print("ChatTTS Voice Tuning Web UI", flush=True)
    print("Open http://127.0.0.1:9977 in your browser", flush=True)
    print("=" * 50, flush=True)
    print("Loading model...", flush=True)
    get_chat()
    print("Model loaded. Ready!", flush=True)
    app.run(host="127.0.0.1", port=9977)
