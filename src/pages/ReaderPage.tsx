import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { useZoom } from "../hooks/useZoom";
import { useLazyLoad } from "../hooks/useLazyLoad";
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

  const { zoom } = useZoom(containerRef);
  const { pages, observeElement } = useLazyLoad(
    comicPath,
    comicInfo?.total_pages ?? 0
  );

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

  // Track current page via scroll position (binary search)
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !comicInfo) return;

    function handleScroll() {
      const viewportMid = scrollEl!.scrollTop + scrollEl!.clientHeight / 2;
      const offsets = pageOffsetsRef.current;
      if (offsets.length === 0) return;

      // Binary search: find the last page whose offsetTop <= viewportMid
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
      setCurrentPage(lo + 1);
    }

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [comicInfo]);

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

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        navigate("/");
      } else if (e.key === "Home") {
        e.preventDefault();
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (e.key === "End") {
        e.preventDefault();
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

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
                  className="w-full h-auto"
                  onLoad={updatePageOffsets}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center bg-neutral-900"
                >
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

      <PageIndicator current={currentPage} total={comicInfo.total_pages} />
      <ZoomIndicator scale={zoom.scale} />
    </div>
  );
}
