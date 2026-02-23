import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import type { ComicEntry } from "../types";

interface Props {
  comic: ComicEntry;
  cover: string | null;
  onCoverLoaded: (path: string, base64: string) => void;
}

export default function ComicCard({ comic, cover, onCoverLoaded }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lazy load cover when card enters viewport and no cached cover
  useEffect(() => {
    if (cover || loading) return;

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
  }, [comic.path, cover, loading, onCoverLoaded]);

  function handleClick() {
    navigate(`/read?path=${encodeURIComponent(comic.path)}`);
  }

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="cursor-pointer group rounded-lg overflow-hidden bg-neutral-800 hover:ring-2 hover:ring-blue-500 transition-all"
    >
      <div className="aspect-[2/3] bg-neutral-700 overflow-hidden relative">
        {cover ? (
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
            {comic.filename.replace(/\.zip$/i, "")}
          </p>
        </div>
      </div>
      <div className="p-2">
        <p
          className="text-sm text-neutral-200 truncate"
          title={comic.filename}
        >
          {comic.filename.replace(/\.zip$/i, "")}
        </p>
      </div>
    </div>
  );
}
