import { useRef, useState, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ComicEntry } from "../types";
import ComicCard from "./ComicCard";

interface Props {
  comics: ComicEntry[];
  coverCache: Record<string, string>;
  onCoverLoaded: (path: string, base64: string) => void;
}

const GAP = 16; // gap-4 = 16px

// Match Tailwind breakpoints: default 2, sm 3, md 4, lg 5, xl 6
function getColumnCount(width: number): number {
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

export default function ComicGrid({ comics, coverCache, onCoverLoaded }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width and update column count
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setContainerWidth(width);
      setCols(getColumnCount(width));
    });

    observer.observe(el);
    // Initial measurement
    const width = el.clientWidth;
    setContainerWidth(width);
    setCols(getColumnCount(width));

    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(comics.length / cols);

  // Calculate row height: card width * 1.5 (aspect 2:3) + label area (~40px) + gap
  const cardWidth = cols > 0 && containerWidth > 0
    ? (containerWidth - GAP * (cols - 1)) / cols
    : 200;
  const rowHeight = cardWidth * 1.5 + 40 + GAP;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  });

  const getComicsForRow = useCallback(
    (rowIndex: number) => {
      const start = rowIndex * cols;
      return comics.slice(start, start + cols);
    },
    [comics, cols]
  );

  if (comics.length === 0) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <p className="text-neutral-500">
          No files found. Select a folder containing .zip, .md, or .txt files.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowComics = getComicsForRow(virtualRow.index);
          return (
            <div
              key={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gap: `${GAP}px`,
                }}
              >
                {rowComics.map((comic) => (
                  <ComicCard
                    key={comic.path}
                    comic={comic}
                    cover={coverCache[comic.path] || null}
                    onCoverLoaded={onCoverLoaded}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
