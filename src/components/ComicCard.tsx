import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import type { ComicEntry } from "../types";

interface Props {
  comic: ComicEntry;
  cover: string | null;
  onCoverLoaded: (path: string, base64: string) => void;
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  md: { label: "MD", color: "bg-green-600" },
  txt: { label: "TXT", color: "bg-blue-600" },
};

export default function ComicCard({ comic, cover, onCoverLoaded }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const isTextFile = comic.file_type === "md" || comic.file_type === "txt";

  // Lazy load cover when card enters viewport (only for ZIP files)
  useEffect(() => {
    if (isTextFile || cover || loading) return;

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          setLoading(true);
          invoke<string>("get_cover", { path: comic.path })
            .then((base64) => {
              if (base64) onCoverLoaded(comic.path, base64);
            })
            .catch((err) => console.error("Failed to load cover:", err))
            .finally(() => setLoading(false));
        }
      },
      { rootMargin: "200px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [comic.path, comic.file_type, cover, loading, onCoverLoaded, isTextFile]);

  function handleClick() {
    if (isTextFile) {
      navigate(`/read-text?path=${encodeURIComponent(comic.path)}`);
    } else {
      navigate(`/read?path=${encodeURIComponent(comic.path)}`);
    }
  }

  // Strip file extension for display
  const displayName = comic.filename.replace(/\.(zip|md|txt)$/i, "");

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="cursor-pointer group rounded-lg overflow-hidden bg-neutral-800 hover:ring-2 hover:ring-blue-500 transition-all"
    >
      <div className="aspect-[2/3] bg-neutral-700 overflow-hidden relative">
        {isTextFile ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-neutral-400">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            {TYPE_BADGE[comic.file_type] && (
              <span
                className={`px-2 py-0.5 text-xs text-white rounded ${TYPE_BADGE[comic.file_type].color}`}
              >
                {TYPE_BADGE[comic.file_type].label}
              </span>
            )}
          </div>
        ) : cover ? (
          <img
            src={cover}
            alt={comic.filename}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500">
            {loading ? (
              <div className="w-6 h-6 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              "No Cover"
            )}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-xs text-white break-words leading-snug">
            {displayName}
          </p>
        </div>
      </div>
      <div className="p-2">
        <p
          className="text-sm text-neutral-200 truncate"
          title={comic.filename}
        >
          {displayName}
        </p>
      </div>
    </div>
  );
}
