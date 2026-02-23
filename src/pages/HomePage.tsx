import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLastFolder } from "../hooks/useLastFolder";
import ComicGrid from "../components/ComicGrid";
import type { ComicEntry } from "../types";

type SortOption = "name-asc" | "name-desc" | "path-asc" | "path-desc";

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export default function HomePage() {
  const [comics, setComics] = useState<ComicEntry[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [coverCache, setCoverCache] = useState<Record<string, string>>({});
  const { getLastFolder, setLastFolder } = useLastFolder();

  // Track version to invalidate cache when folder changes
  const folderVersion = useRef(0);

  const loadFolder = useCallback(
    async (path: string) => {
      folderVersion.current += 1;
      setScanning(true);
      setFolderPath(path);
      setLastFolder(path);
      setComics([]);
      setCoverCache({});
      setSearch("");
      try {
        const entries = await invoke<ComicEntry[]>("scan_folder", { path });
        setComics(entries);
      } catch (err) {
        console.error("Failed to scan folder:", err);
      } finally {
        setScanning(false);
      }
    },
    [setLastFolder]
  );

  // Auto-load last folder on mount
  useEffect(() => {
    const last = getLastFolder();
    if (last) {
      loadFolder(last);
    }
  }, []);

  async function handleSelectFolder() {
    const selected = await open({ directory: true, recursive: false });
    if (selected) {
      loadFolder(selected as string);
    }
  }

  const onCoverLoaded = useCallback((path: string, base64: string) => {
    setCoverCache((prev) => ({ ...prev, [path]: base64 }));
  }, []);

  const filteredAndSorted = useMemo(() => {
    let result = comics;

    // Filter by search
    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((c) => c.filename.toLowerCase().includes(query));
    }

    // Sort
    const sorted = [...result];
    switch (sort) {
      case "name-asc":
        sorted.sort((a, b) => naturalCompare(a.filename, b.filename));
        break;
      case "name-desc":
        sorted.sort((a, b) => naturalCompare(b.filename, a.filename));
        break;
      case "path-asc":
        sorted.sort((a, b) => naturalCompare(a.path, b.path));
        break;
      case "path-desc":
        sorted.sort((a, b) => naturalCompare(b.path, a.path));
        break;
    }

    return sorted;
  }, [comics, search, sort]);

  return (
    <div className="min-h-screen bg-neutral-900 p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Comic Viewer</h1>
        <div className="flex items-center gap-3">
          {scanning && (
            <p className="text-neutral-400 text-sm">Scanning...</p>
          )}
          <button
            onClick={handleSelectFolder}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Select Folder
          </button>
        </div>
      </header>

      {folderPath && (
        <p className="text-neutral-400 text-sm mb-4 truncate">{folderPath}</p>
      )}

      {comics.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 max-w-sm px-3 py-2 bg-neutral-800 text-white rounded-lg border border-neutral-700 focus:border-blue-500 focus:outline-none placeholder-neutral-500"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-3 py-2 bg-neutral-800 text-white rounded-lg border border-neutral-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
            <option value="path-asc">Path A → Z</option>
            <option value="path-desc">Path Z → A</option>
          </select>
          <p className="text-neutral-500 text-sm whitespace-nowrap">
            {filteredAndSorted.length}
            {search.trim() ? ` / ${comics.length}` : ""} comics
          </p>
        </div>
      )}

      <ComicGrid
        comics={filteredAndSorted}
        coverCache={coverCache}
        onCoverLoaded={onCoverLoaded}
      />
    </div>
  );
}
