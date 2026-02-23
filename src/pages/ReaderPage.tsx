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

  // Track current page via scroll position
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !comicInfo) return;

    function handleScroll() {
      const scrollTop = scrollEl!.scrollTop;
      const viewportMid = scrollTop + scrollEl!.clientHeight / 2;

      for (let i = 0; i < pageRefs.current.length; i++) {
        const child = pageRefs.current[i];
        if (!child) continue;
        if (
          child.offsetTop <= viewportMid &&
          child.offsetTop + child.offsetHeight > viewportMid
        ) {
          setCurrentPage(i + 1);
          break;
        }
      }
    }

    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handleScroll);
  }, [comicInfo]);

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
              style={{ minHeight: "400px" }}
            >
              {page.src ? (
                <img
                  src={page.src}
                  alt={`Page ${i + 1}`}
                  className="w-full h-auto"
                />
              ) : (
                <div className="w-full h-[400px] flex items-center justify-center bg-neutral-900">
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
