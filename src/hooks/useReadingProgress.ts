import { useCallback, useRef } from "react";

const STORAGE_KEY = "comic-reading-progress";

interface ProgressMap {
  [comicPath: string]: number; // page index (0-based)
}

function loadProgressMap(): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function useReadingProgress(comicPath: string) {
  const lastSavedRef = useRef(0);

  const getProgress = useCallback((): number => {
    const map = loadProgressMap();
    return map[comicPath] ?? 0;
  }, [comicPath]);

  // Throttled save: only write if value changed and at least 1s since last save
  const saveProgress = useCallback(
    (pageIndex: number) => {
      const now = Date.now();
      if (now - lastSavedRef.current < 1000) return;
      lastSavedRef.current = now;

      const map = loadProgressMap();
      map[comicPath] = pageIndex;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    },
    [comicPath]
  );

  return { getProgress, saveProgress };
}
