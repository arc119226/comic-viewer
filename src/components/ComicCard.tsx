import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import type { ComicEntry } from "../types";

interface Props {
  comic: ComicEntry;
}

export default function ComicCard({ comic }: Props) {
  const navigate = useNavigate();
  const [cover, setCover] = useState<string | null>(comic.cover_base64 || null);
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lazy load cover when card enters viewport
  useEffect(() => {
    if (cover) return;

    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          setLoading(true);
          invoke<string>("get_cover", { path: comic.path })
            .then((base64) => {
              if (base64) setCover(base64);
            })
            .catch((err) => console.error("Failed to load cover:", err))
            .finally(() => setLoading(false));
        }
      },
      { rootMargin: "200px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [comic.path, cover]);

  function handleClick() {
    navigate(`/read?path=${encodeURIComponent(comic.path)}`);
  }

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="cursor-pointer group rounded-lg overflow-hidden bg-neutral-800 hover:ring-2 hover:ring-blue-500 transition-all"
    >
      <div className="aspect-[2/3] bg-neutral-700 overflow-hidden">
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
