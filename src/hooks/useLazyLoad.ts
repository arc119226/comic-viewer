import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const PRELOAD_AHEAD = 5;

interface PageData {
  src: string | null;
  loading: boolean;
}

export function useLazyLoad(comicPath: string, totalPages: number) {
  const [pages, setPages] = useState<PageData[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<Set<number>>(new Set());
  const loadedRef = useRef<Set<number>>(new Set());

  // Initialize page slots when comic changes
  useEffect(() => {
    if (totalPages === 0) {
      setPages([]);
      return;
    }
    setPages(
      Array.from({ length: totalPages }, () => ({
        src: null,
        loading: false,
      }))
    );
    loadingRef.current.clear();
    loadedRef.current.clear();

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [comicPath, totalPages]);

  const loadPage = useCallback(
    async (index: number) => {
      if (index < 0 || index >= totalPages) return;
      if (loadedRef.current.has(index)) return;
      if (loadingRef.current.has(index)) return;
      loadingRef.current.add(index);

      setPages((prev) => {
        if (index >= prev.length) return prev;
        const next = [...prev];
        next[index] = { ...next[index], loading: true };
        return next;
      });

      try {
        const base64 = await invoke<string>("load_page", {
          path: comicPath,
          index,
        });
        loadedRef.current.add(index);
        setPages((prev) => {
          if (index >= prev.length) return prev;
          const next = [...prev];
          next[index] = { src: base64, loading: false };
          return next;
        });
      } catch (err) {
        console.error(`Failed to load page ${index}:`, err);
        setPages((prev) => {
          if (index >= prev.length) return prev;
          const next = [...prev];
          next[index] = { src: null, loading: false };
          return next;
        });
      } finally {
        loadingRef.current.delete(index);
      }
    },
    [comicPath, totalPages]
  );

  // Load a page and preload the next PRELOAD_AHEAD pages
  const loadWithPreload = useCallback(
    (index: number) => {
      for (let i = index; i <= Math.min(index + PRELOAD_AHEAD, totalPages - 1); i++) {
        loadPage(i);
      }
    },
    [loadPage, totalPages]
  );

  const observeElement = useCallback(
    (element: HTMLElement | null, index: number) => {
      if (!element) return;

      if (!observerRef.current) {
        observerRef.current = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const pageIndex = Number(
                  (entry.target as HTMLElement).dataset.pageIndex
                );
                if (!isNaN(pageIndex)) {
                  loadWithPreload(pageIndex);
                }
              }
            });
          },
          {
            rootMargin: "100% 0px",
          }
        );
      }

      element.dataset.pageIndex = String(index);
      observerRef.current.observe(element);
    },
    [loadWithPreload]
  );

  return { pages, observeElement };
}
