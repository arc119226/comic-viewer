interface Props {
  scale: number;
}

export default function ZoomIndicator({ scale }: Props) {
  const percent = Math.round(scale * 100);
  if (percent === 100) return null;

  return (
    <div className="fixed bottom-4 right-4 px-3 py-1 bg-black/70 text-white text-sm rounded-full pointer-events-none">
      {percent}%
    </div>
  );
}
