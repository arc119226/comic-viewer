import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PageData {
  src: string | null;
  loading: boolean;
}

export function useLazyLoad(comicPath: string, totalPages: number) {
  const [pages, setPages] = useState<PageData[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<Set<number>>(new Set());

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

    // Cleanup observer on comic change
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [comicPath, totalPages]);

  const loadPage = useCallback(
    async (index: number) => {
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
    [comicPath]
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
                  loadPage(pageIndex);
                }
              }
            });
          },
          {
            rootMargin: "200% 0px",
          }
        );
      }

      element.dataset.pageIndex = String(index);
      observerRef.current.observe(element);
    },
    [loadPage]
  );

  return { pages, observeElement };
}
