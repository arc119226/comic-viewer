import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLastFolder } from "../hooks/useLastFolder";
import ComicGrid from "../components/ComicGrid";
import type { ComicEntry } from "../types";

export default function HomePage() {
  const [comics, setComics] = useState<ComicEntry[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const { getLastFolder, setLastFolder } = useLastFolder();

  const loadFolder = useCallback(
    async (path: string) => {
      setScanning(true);
      setFolderPath(path);
      setLastFolder(path);
      setComics([]);
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

  return (
    <div className="min-h-screen bg-neutral-900 p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Comic Viewer</h1>
        <div className="flex items-center gap-3">
          {scanning && (
            <p className="text-neutral-400 text-sm">Scanning...</p>
          )}
          {!scanning && comics.length > 0 && (
            <p className="text-neutral-500 text-sm">{comics.length} comics</p>
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

      <ComicGrid comics={comics} />
    </div>
  );
}
