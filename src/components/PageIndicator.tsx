interface Props {
  current: number;
  total: number;
}

export default function PageIndicator({ current, total }: Props) {
  return (
    <div className="fixed bottom-4 left-4 px-3 py-1 bg-black/70 text-white text-sm rounded-full pointer-events-none">
      {current} / {total}
    </div>
  );
}
