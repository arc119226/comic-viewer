import type { ReactNode } from "react";

interface Props {
  title: string;
  onBack: () => void;
  rightContent?: ReactNode;
}

export default function TopBar({ title, onBack, rightContent }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
      <button
        onClick={onBack}
        className="px-3 py-1 text-sm bg-neutral-700 hover:bg-neutral-600 text-white rounded"
      >
        Back
      </button>
      <h2 className="text-lg font-medium text-white truncate flex-1">{title}</h2>
      {rightContent}
    </div>
  );
}
