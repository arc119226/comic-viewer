import { useState } from "react";

const STORAGE_KEY = "comic-viewer-font-size";
const DEFAULT_SIZE = 18;
const MIN_SIZE = 12;
const MAX_SIZE = 32;
const STEP = 2;

export function useFontSize() {
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : DEFAULT_SIZE;
  });

  const increase = () => {
    setFontSize((prev) => {
      const next = Math.min(prev + STEP, MAX_SIZE);
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const decrease = () => {
    setFontSize((prev) => {
      const next = Math.max(prev - STEP, MIN_SIZE);
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const reset = () => {
    setFontSize(DEFAULT_SIZE);
    localStorage.setItem(STORAGE_KEY, String(DEFAULT_SIZE));
  };

  return { fontSize, increase, decrease, reset };
}
