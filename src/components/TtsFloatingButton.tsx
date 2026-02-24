interface Props {
  x: number;
  y: number;
  position: "above" | "below";
  loading: boolean;
  onClick: () => void;
}

export default function TtsFloatingButton({
  x,
  y,
  position,
  loading,
  onClick,
}: Props) {
  return (
    <button
      onMouseDown={(e) => {
        // Prevent document mousedown from clearing the text selection
        // before onClick fires
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={loading}
      className={`fixed z-50 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm rounded-full shadow-lg transition-colors -translate-x-1/2 ${position === "above" ? "-translate-y-full" : ""}`}
      style={{ left: x, top: y }}
    >
      {loading ? (
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Converting...
        </span>
      ) : (
        "朗读"
      )}
    </button>
  );
}
