import { useState, useEffect, useCallback } from "react";

interface SelectionState {
  text: string;
  x: number;
  y: number;
  position: "above" | "below";
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionState | null>(null);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 0 && sel!.rangeCount > 0) {
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Detect drag direction (anchor → focus)
        let draggedDown = false;
        const anchor = sel!.anchorNode;
        const focus = sel!.focusNode;
        if (anchor && focus) {
          if (anchor === focus) {
            draggedDown = sel!.anchorOffset <= sel!.focusOffset;
          } else {
            draggedDown =
              (anchor.compareDocumentPosition(focus) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
              0;
          }
        }

        const BUTTON_HEIGHT = 40;
        const MARGIN = 10;
        let y: number;
        let position: "above" | "below";

        if (draggedDown) {
          y = rect.bottom + MARGIN;
          position = "below";
          if (y + BUTTON_HEIGHT > window.innerHeight) {
            y = rect.top - MARGIN;
            position = "above";
          }
        } else {
          y = rect.top - MARGIN;
          position = "above";
          if (y - BUTTON_HEIGHT < 0) {
            y = rect.bottom + MARGIN;
            position = "below";
          }
        }

        const x = Math.max(
          50,
          Math.min(rect.left + rect.width / 2, window.innerWidth - 50),
        );

        setSelection({ text, x, y, position });
      } else {
        setSelection(null);
      }
    }, 10);
  }, []);

  const handleMouseDown = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [handleMouseUp, handleMouseDown]);

  const clearSelection = useCallback(() => setSelection(null), []);

  return { selection, clearSelection };
}
