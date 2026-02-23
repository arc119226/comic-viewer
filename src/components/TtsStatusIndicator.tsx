import type { TtsStatus } from "../types";

interface Props {
  status: TtsStatus;
  onClick: () => void;
}

const STATUS_COLORS: Record<TtsStatus, string> = {
  stopped: "bg-neutral-500",
  starting: "bg-yellow-500 animate-pulse",
  ready: "bg-green-500",
  error: "bg-red-500",
};

const STATUS_LABELS: Record<TtsStatus, string> = {
  stopped: "TTS Off",
  starting: "TTS Starting...",
  ready: "TTS Ready",
  error: "TTS Error",
};

export default function TtsStatusIndicator({ status, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-neutral-700 transition-colors"
      title={
        status === "stopped"
          ? "Click to start TTS server"
          : status === "ready"
            ? "Click to stop TTS server"
            : STATUS_LABELS[status]
      }
    >
      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
      <span className="text-xs text-neutral-400">{STATUS_LABELS[status]}</span>
    </button>
  );
}
