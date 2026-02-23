interface Props {
  isPlaying: boolean;
  canSave: boolean;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onSave: () => void;
}

export default function TtsAudioPlayer({
  isPlaying,
  canSave,
  onTogglePlayPause,
  onStop,
  onSave,
}: Props) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-full shadow-lg border border-neutral-700">
      <button
        onClick={onTogglePlayPause}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <polygon points="2,0 14,7 2,14" />
          </svg>
        )}
      </button>
      <button
        onClick={onStop}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
        title="Stop"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <rect x="1" y="1" width="10" height="10" rx="1" />
        </svg>
      </button>
      {canSave && (
        <button
          onClick={onSave}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-700 hover:bg-green-700 text-white transition-colors"
          title="Save audio"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M7 1v8M3 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="2" y="11" width="10" height="1.5" rx="0.5" />
          </svg>
        </button>
      )}
      <span className="text-xs text-neutral-400 ml-1">
        {isPlaying ? "Playing..." : "Paused"}
      </span>
    </div>
  );
}
