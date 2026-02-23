import { useNavigate } from "react-router";
import type { ComicEntry } from "../types";

interface Props {
  comic: ComicEntry;
}

export default function ComicCard({ comic }: Props) {
  const navigate = useNavigate();

  function handleClick() {
    navigate(`/read?path=${encodeURIComponent(comic.path)}`);
  }

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer group rounded-lg overflow-hidden bg-neutral-800 hover:ring-2 hover:ring-blue-500 transition-all"
    >
      <div className="aspect-[2/3] bg-neutral-700 overflow-hidden">
        {comic.cover_base64 ? (
          <img
            src={comic.cover_base64}
            alt={comic.filename}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-500">
            No Cover
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
