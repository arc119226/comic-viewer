import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TtsStatus } from "../types";

export function useTts() {
  const [status, setStatus] = useState<TtsStatus>("stopped");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAudioDataUri, setLastAudioDataUri] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startServer = useCallback(async () => {
    setError(null);
    try {
      await invoke("tts_start");
      setStatus("starting");
      pollingRef.current = setInterval(async () => {
        try {
          const s = await invoke<string>("tts_status");
          setStatus(s as TtsStatus);
          if (s === "ready" || s === "error") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            if (s === "error") {
              setError("TTS server failed to start");
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000);
    } catch (err) {
      console.error("Failed to start TTS server:", err);
      setStatus("error");
      setError(String(err));
    }
  }, []);

  const stopServer = useCallback(async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    try {
      await invoke("tts_stop");
    } catch {
      // Ignore stop errors
    }
    setStatus("stopped");
    setError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    setIsSpeaking(true);
    setError(null);
    try {
      console.log("[TTS] Sending speak request, text length:", text.length);
      const audioDataUri = await invoke<string>("tts_speak", { text });
      console.log(
        "[TTS] Got audio response, data URI length:",
        audioDataUri.length,
      );
      setLastAudioDataUri(audioDataUri);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioDataUri);
      audioRef.current = audio;

      audio.onplay = () => {
        console.log("[TTS] Audio playing");
        setIsPlaying(true);
      };
      audio.onended = () => {
        console.log("[TTS] Audio ended");
        setIsPlaying(false);
      };
      audio.onpause = () => setIsPlaying(false);
      audio.onerror = (e) => {
        console.error("[TTS] Audio playback error:", e);
        setError("Audio playback failed - invalid audio format");
        setIsPlaying(false);
      };

      await audio.play();
    } catch (err) {
      console.error("[TTS] speak failed:", err);
      setError(String(err));
    } finally {
      setIsSpeaking(false);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setLastAudioDataUri(null);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  }, []);

  const saveAudio = useCallback(async () => {
    if (!lastAudioDataUri) return;
    try {
      const savedPath = await invoke<string>("tts_save_audio", {
        audioDataUri: lastAudioDataUri,
      });
      console.log("[TTS] Audio saved to:", savedPath);
    } catch (err) {
      // "Save cancelled" is normal when user closes dialog
      if (String(err) !== "Save cancelled") {
        console.error("[TTS] Save failed:", err);
        setError(String(err));
      }
    }
  }, [lastAudioDataUri]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return {
    status,
    isSpeaking,
    isPlaying,
    error,
    lastAudioDataUri,
    startServer,
    stopServer,
    speak,
    stopAudio,
    togglePlayPause,
    saveAudio,
    clearError,
  };
}
