"use client";

export default function StarRating({
  rating,
  count,
  size = "sm",
}: {
  rating: number | null;
  count?: number;
  size?: "sm" | "md";
}) {
  if (rating === null || rating === undefined) {
    return <span className="text-xs text-slate-400">No reviews yet</span>;
  }
  const rounded = Math.round(rating * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded % 1 === 0.5;
  const text = size === "md" ? "text-base" : "text-xs";
  return (
    <span className={`inline-flex items-center gap-1 ${text}`}>
      <span aria-hidden className="tracking-tight text-amber-400">
        {"★".repeat(full)}
        {half ? "⯨" : ""}
        <span className="text-slate-300">{"★".repeat(5 - full - (half ? 1 : 0))}</span>
      </span>
      <span className="font-medium text-slate-700">{rating.toFixed(1)}</span>
      {typeof count === "number" && <span className="text-slate-400">({count})</span>}
    </span>
  );
}
