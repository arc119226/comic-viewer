import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFontSize } from "../hooks/useFontSize";
import { useTextSelection } from "../hooks/useTextSelection";
import { useTts } from "../hooks/useTts";
import TopBar from "../components/TopBar";
import TtsStatusIndicator from "../components/TtsStatusIndicator";
import TtsFloatingButton from "../components/TtsFloatingButton";
import TtsAudioPlayer from "../components/TtsAudioPlayer";
import type { TextInfo, TtsEngine } from "../types";

export default function TextReaderPage() {
  const [searchParams] = useSearchParams();
  const filePath = searchParams.get("path") || "";
  const navigate = useNavigate();

  const [textInfo, setTextInfo] = useState<TextInfo | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const { fontSize, increase, decrease, reset } = useFontSize();
  const { selection, clearSelection } = useTextSelection();
  const tts = useTts();

  // Load file info and content on mount
  useEffect(() => {
    if (!filePath) {
      navigate("/");
      return;
    }
    setLoading(true);
    Promise.all([
      invoke<TextInfo>("get_text_info", { path: filePath }),
      invoke<string>("load_text_file", { path: filePath }),
    ])
      .then(([info, text]) => {
        setTextInfo(info);
        setContent(text);
      })
      .catch((err) => {
        console.error("Failed to load text file:", err);
        navigate("/");
      })
      .finally(() => setLoading(false));
  }, [filePath, navigate]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        navigate("/");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const handleTtsToggle = () => {
    if (tts.status === "stopped" || tts.status === "error") {
      tts.startServer();
    } else if (tts.status === "ready") {
      tts.stopServer();
    }
  };

  const handleSpeak = () => {
    if (selection?.text) {
      tts.speak(selection.text);
      clearSelection();
    }
  };

  if (loading || !textInfo) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  const isMarkdown = textInfo.file_type === "md";

  return (
    <div className="h-screen flex flex-col bg-neutral-950">
      <TopBar
        title={textInfo.filename.replace(/\.(md|txt)$/i, "")}
        onBack={() => navigate("/")}
        rightContent={
          <div className="flex items-center gap-2">
            {tts.status === "ready" && (
              <select
                value={tts.engine}
                onChange={(e) => tts.setEngine(e.target.value as TtsEngine)}
                className="text-xs bg-neutral-800 text-neutral-300 border border-neutral-700 rounded px-2 py-1 focus:outline-none focus:border-neutral-500"
              >
                <option value="edge-tts">Edge TTS</option>
                <option value="chattts">ChatTTS</option>
              </select>
            )}
            <TtsStatusIndicator status={tts.status} onClick={handleTtsToggle} />
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <article
          className="max-w-3xl mx-auto px-8 py-6 text-neutral-200 leading-relaxed"
          style={{ fontSize: `${fontSize}px` }}
        >
          {isMarkdown ? (
            <div className="prose prose-invert prose-neutral max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans">{content}</pre>
          )}
        </article>
      </div>

      {/* Font size controls */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-1 bg-neutral-800 rounded-full shadow-lg border border-neutral-700 px-2 py-1">
        <button
          onClick={decrease}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-neutral-700 text-neutral-300 text-sm transition-colors"
          title="Decrease font size"
        >
          A-
        </button>
        <button
          onClick={reset}
          className="px-2 h-7 flex items-center justify-center rounded hover:bg-neutral-700 text-neutral-400 text-xs transition-colors"
          title="Reset font size"
        >
          {fontSize}px
        </button>
        <button
          onClick={increase}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-neutral-700 text-neutral-300 text-sm transition-colors"
          title="Increase font size"
        >
          A+
        </button>
      </div>

      {/* TTS floating button on text selection */}
      {selection && tts.status === "ready" && (
        <TtsFloatingButton
          x={selection.x}
          y={selection.y}
          position={selection.position}
          loading={tts.isSpeaking}
          onClick={handleSpeak}
        />
      )}

      {/* Audio player — show when audio data exists (playing or paused) */}
      {tts.lastAudioDataUri && (
        <TtsAudioPlayer
          isPlaying={tts.isPlaying}
          canSave={!!tts.lastAudioDataUri}
          onTogglePlayPause={tts.togglePlayPause}
          onStop={tts.stopAudio}
          onSave={tts.saveAudio}
        />
      )}

      {/* TTS error toast */}
      {tts.error && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-2xl px-4 py-3 bg-red-900/95 text-red-200 text-sm rounded-lg shadow-lg border border-red-800">
          <div className="flex items-start gap-2">
            <span className="break-all whitespace-pre-wrap">{tts.error}</span>
            <button
              onClick={tts.clearError}
              className="text-red-400 hover:text-red-200 shrink-0 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Speaking indicator */}
      {tts.isSpeaking && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-blue-900/90 text-blue-200 text-sm rounded-lg shadow-lg border border-blue-800">
          <span className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
          Converting speech...
        </div>
      )}
    </div>
  );
}
