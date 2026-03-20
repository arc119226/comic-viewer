import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { useZoom } from "../hooks/useZoom";
import { useLazyLoad } from "../hooks/useLazyLoad";
import { useReadingProgress } from "../hooks/useReadingProgress";
import TopBar from "../components/TopBar";
import ZoomIndicator from "../components/ZoomIndicator";
import PageIndicator from "../components/PageIndicator";
import type { ComicInfo } from "../types";

export default function ReaderPage() {
  const [searchParams] = useSearchParams();
  const comicPath = searchParams.get("path") || "";
  const navigate = useNavigate();

  const [comicInfo, setComicInfo] = useState<ComicInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pageOffsetsRef = useRef<number[]>([]);
  const restoredRef = useRef(false);

  const { zoom } = useZoom(containerRef);
  const { pages, observeElement } = useLazyLoad(
    comicPath,
    comicInfo?.total_pages ?? 0
  );
  const { getProgress, saveProgress } = useReadingProgress(comicPath);

  // Load comic info on mount
  useEffect(() => {
    if (!comicPath) {
      navigate("/");
      return;
    }
    invoke<ComicInfo>("get_comic_info", { path: comicPath })
      .then(setComicInfo)
      .catch((err) => {
        console.error("Failed to load comic info:", err);
        navigate("/");
      });
  }, [comicPath, navigate]);

  // Rebuild page offset cache
  const updatePageOffsets = useCallback(() => {
    pageOffsetsRef.current = pageRefs.current.map(
      (el) => el?.offsetTop ?? 0
    );
  }, []);

  // Restore reading progress after pages are initialized
  useEffect(() => {
    if (restoredRef.current || !comicInfo || pages.length === 0) return;
    const savedPage = getProgress();
    if (savedPage > 0) {
      restoredRef.current = true;
      // Wait for layout to settle, then scroll to saved page
      requestAnimationFrame(() => {
        const el = pageRefs.current[savedPage];
        if (el) {
          scrollRef.current?.scrollTo({ top: el.offsetTop });
        }
      });
    } else {
      restoredRef.current = true;
    }
  }, [comicInfo, pages, getProgress]);

  // Track current page via scroll position (binary search) + save progress
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !comicInfo) return;

    function handleScroll() {
      const viewportMid = scrollEl!.scrollTop + scrollEl!.clientHeight / 2;
      const offsets = pageOffsetsRef.current;
      if (offsets.length === 0) return;

      let lo = 0;
      let hi = offsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= viewportMid) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      const page = lo + 1;
      setCurrentPage(page);
      saveProgress(lo); // throttled internally
    }

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [comicInfo, saveProgress]);

  // Update offsets when pages change (images load) or container resizes
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const observer = new ResizeObserver(() => {
      updatePageOffsets();
    });
    observer.observe(scrollEl);

    return () => observer.disconnect();
  }, [updatePageOffsets]);

  // Jump to a specific page
  const jumpToPage = useCallback(
    (page: number) => {
      const index = Math.max(0, Math.min(page - 1, (comicInfo?.total_pages ?? 1) - 1));
      const el = pageRefs.current[index];
      if (el) {
        scrollRef.current?.scrollTo({ top: el.offsetTop, behavior: "smooth" });
      }
    },
    [comicInfo]
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      switch (e.key) {
        case "Escape":
          navigate("/");
          break;
        case "Home":
          e.preventDefault();
          scrollEl.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "End":
          e.preventDefault();
          scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
          break;
        case "PageDown":
        case " ": // Space
          e.preventDefault();
          scrollEl.scrollBy({ top: scrollEl.clientHeight * 0.9, behavior: "smooth" });
          break;
        case "PageUp":
          e.preventDefault();
          scrollEl.scrollBy({ top: -scrollEl.clientHeight * 0.9, behavior: "smooth" });
          break;
        case "ArrowDown":
          if (!e.ctrlKey) {
            e.preventDefault();
            scrollEl.scrollBy({ top: scrollEl.clientHeight * 0.9, behavior: "smooth" });
          }
          break;
        case "ArrowUp":
          if (!e.ctrlKey) {
            e.preventDefault();
            scrollEl.scrollBy({ top: -scrollEl.clientHeight * 0.9, behavior: "smooth" });
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          jumpToPage(currentPage + 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          jumpToPage(currentPage - 1);
          break;
        case "f":
        case "F":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
          }
          break;
        case "F11":
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, currentPage, jumpToPage]);

  const setPageRef = useCallback(
    (el: HTMLDivElement | null, index: number) => {
      pageRefs.current[index] = el;
      observeElement(el, index);
    },
    [observeElement]
  );

  if (!comicInfo) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  const aspectRatio = `${comicInfo.page_width} / ${comicInfo.page_height}`;

  return (
    <div className="h-screen flex flex-col bg-neutral-950">
      <TopBar
        title={comicInfo.filename.replace(/\.zip$/i, "")}
        onBack={() => navigate("/")}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
        <div
          ref={containerRef}
          className="flex flex-col items-center"
          style={{
            transform: `scale(${zoom.scale})`,
            transformOrigin: `${zoom.originX}% ${zoom.originY}%`,
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              ref={(el) => setPageRef(el, i)}
              className="w-full max-w-4xl"
              style={{ aspectRatio }}
            >
              {page.src ? (
                <img
                  src={page.src}
                  alt={`Page ${i + 1}`}
                  className="w-full h-auto transition-opacity duration-300"
                  style={{ opacity: 0 }}
                  onLoad={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "1";
                    updatePageOffsets();
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                  {page.loading ? (
                    <p className="text-neutral-500">
                      Loading page {i + 1}...
                    </p>
                  ) : (
                    <p className="text-neutral-600">Page {i + 1}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <PageIndicator
        current={currentPage}
        total={comicInfo.total_pages}
        onJumpToPage={jumpToPage}
      />
      <ZoomIndicator scale={zoom.scale} />
    </div>
  );
}
