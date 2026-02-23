const STORAGE_KEY = "comic-viewer-last-folder";

export function useLastFolder() {
  const getLastFolder = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
  };

  const setLastFolder = (path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
  };

  return { getLastFolder, setLastFolder };
}
