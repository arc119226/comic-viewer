import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLastFolder } from "../hooks/useLastFolder";
import ComicGrid from "../components/ComicGrid";
import type { ComicEntry } from "../types";

export default function HomePage() {
  const [comics, setComics] = useState<ComicEntry[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { getLastFolder, setLastFolder } = useLastFolder();

  const loadFolder = useCallback(
    async (path: string) => {
      setLoading(true);
      setFolderPath(path);
      setLastFolder(path);
      try {
        const entries = await invoke<ComicEntry[]>("scan_folder", { path });
        setComics(entries);
      } catch (err) {
        console.error("Failed to scan folder:", err);
      } finally {
        setLoading(false);
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

  return (
    <div className="min-h-screen bg-neutral-900 p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Comic Viewer</h1>
        <button
          onClick={handleSelectFolder}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Select Folder
        </button>
      </header>

      {folderPath && (
        <p className="text-neutral-400 text-sm mb-4 truncate">{folderPath}</p>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-neutral-400">Scanning...</p>
        </div>
      ) : (
        <ComicGrid comics={comics} />
      )}
    </div>
  );
}
