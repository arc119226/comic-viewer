import type { ComicEntry } from "../types";
import ComicCard from "./ComicCard";

interface Props {
  comics: ComicEntry[];
  coverCache: Record<string, string>;
  onCoverLoaded: (path: string, base64: string) => void;
}

export default function ComicGrid({ comics, coverCache, onCoverLoaded }: Props) {
  if (comics.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-neutral-500">
          No files found. Select a folder containing .zip, .md, or .txt files.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {comics.map((comic) => (
        <ComicCard
          key={comic.path}
          comic={comic}
          cover={coverCache[comic.path] || null}
          onCoverLoaded={onCoverLoaded}
        />
      ))}
    </div>
  );
}
