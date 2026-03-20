import { useState } from "react";

interface Props {
  current: number;
  total: number;
  onJumpToPage?: (page: number) => void;
}

export default function PageIndicator({ current, total, onJumpToPage }: Props) {
  const [editing, setEditing] = useState(false);

  function handleSubmit(value: string) {
    const page = parseInt(value, 10);
    if (!isNaN(page) && page >= 1 && page <= total && onJumpToPage) {
      onJumpToPage(page);
    }
    setEditing(false);
  }

  return (
    <div className="fixed bottom-4 left-4 px-3 py-1 bg-black/70 text-white text-sm rounded-full select-none">
      {editing ? (
        <input
          type="number"
          min={1}
          max={total}
          defaultValue={current}
          autoFocus
          className="w-16 bg-transparent text-white text-sm text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit(e.currentTarget.value);
            } else if (e.key === "Escape") {
              setEditing(false);
            }
            e.stopPropagation(); // prevent reader keyboard shortcuts
          }}
          onBlur={(e) => handleSubmit(e.currentTarget.value)}
        />
      ) : (
        <span
          onClick={() => onJumpToPage && setEditing(true)}
          className={onJumpToPage ? "cursor-pointer hover:text-blue-300" : "pointer-events-none"}
        >
          {current} / {total}
        </span>
      )}
    </div>
  );
}
