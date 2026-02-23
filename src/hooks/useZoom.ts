import { useState, useCallback, useEffect } from "react";

export interface ZoomState {
  scale: number;
  originX: number;
  originY: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

export function useZoom(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState<ZoomState>({
    scale: 1,
    originX: 50,
    originY: 50,
  });

  const zoomTo = useCallback(
    (newScale: number, clientX?: number, clientY?: number) => {
      const clamped = clamp(newScale, MIN_ZOOM, MAX_ZOOM);
      if (
        containerRef.current &&
        clientX !== undefined &&
        clientY !== undefined
      ) {
        const rect = containerRef.current.getBoundingClientRect();
        const originX = ((clientX - rect.left) / rect.width) * 100;
        const originY = ((clientY - rect.top) / rect.height) * 100;
        setZoom({ scale: clamped, originX, originY });
      } else {
        setZoom((prev) => ({ ...prev, scale: clamped }));
      }
    },
    [containerRef]
  );

  // Ctrl+Scroll wheel handler
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => {
        const newScale = clamp(prev.scale + delta, MIN_ZOOM, MAX_ZOOM);
        const rect = el!.getBoundingClientRect();
        const originX = ((e.clientX - rect.left) / rect.width) * 100;
        const originY = ((e.clientY - rect.top) / rect.height) * 100;
        return { scale: newScale, originX, originY };
      });
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef]);

  // Keyboard shortcuts: Ctrl+0, Ctrl++, Ctrl+-
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey) return;
      if (e.key === "0") {
        e.preventDefault();
        setZoom((prev) => ({ ...prev, scale: 1 }));
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((prev) => ({
          ...prev,
          scale: clamp(prev.scale + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM),
        }));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((prev) => ({
          ...prev,
          scale: clamp(prev.scale - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM),
        }));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { zoom, zoomTo };
}
