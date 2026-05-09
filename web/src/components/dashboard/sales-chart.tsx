import { formatRupiah } from "@/lib/format";

type Bucket = {
  date: string;
  orders: number;
  revenue_cents: number;
};

// SalesChart renders an inline SVG bar chart of daily revenue. No chart
// library — just a few path/rect calculations. Designed for ≤90 buckets
// (3 months max in MVP).
export function SalesChart({ data }: { data: Bucket[] }) {
  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500">
        Belum ada data dalam rentang ini.
      </p>
    );
  }

  const w = 800;
  const h = 220;
  const padTop = 16;
  const padBottom = 24;
  const padLeft = 56;
  const padRight = 12;
  const innerW = w - padLeft - padRight;
  const innerH = h - padTop - padBottom;

  const max = Math.max(...data.map((d) => d.revenue_cents), 1);
  const totalRevenue = data.reduce((s, d) => s + d.revenue_cents, 0);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const barW = innerW / data.length;

  // Y-axis: pick rounded gridlines (4 lines).
  const gridLines = 4;
  const ticks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = (max / gridLines) * i;
    const y = padTop + innerH - (v / max) * innerH;
    return { v, y };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Total revenue
          </p>
          <p className="font-display text-2xl font-semibold text-neutral-900">
            {formatRupiah(totalRevenue)}
          </p>
        </div>
        <p className="text-sm text-neutral-600">
          {totalOrders} order · {data.length} hari
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-2">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          className="block min-w-[600px]"
          role="img"
          aria-label="Grafik revenue per hari"
        >
          {/* Gridlines */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={w - padRight}
                y1={t.y}
                y2={t.y}
                stroke="var(--color-neutral-200)"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "" : "2 3"}
              />
              <text
                x={padLeft - 8}
                y={t.y + 3}
                textAnchor="end"
                className="fill-neutral-500 text-[10px]"
              >
                {t.v >= 1_000_000 / 100
                  ? `${(t.v / 100_000_000).toFixed(1)}jt`
                  : t.v >= 1_000 / 100
                    ? `${(t.v / 100_000).toFixed(0)}rb`
                    : t.v === 0
                      ? "0"
                      : (t.v / 100).toFixed(0)}
              </text>
            </g>
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const barH = (d.revenue_cents / max) * innerH;
            const x = padLeft + i * barW + barW * 0.1;
            const y = padTop + innerH - barH;
            const bw = barW * 0.8;
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={y}
                  width={bw}
                  height={barH}
                  rx={2}
                  className="fill-brand-500"
                />
                <title>
                  {d.date} — {formatRupiah(d.revenue_cents)} ({d.orders} order)
                </title>
              </g>
            );
          })}

          {/* X-axis labels — show first, middle, last to avoid clutter */}
          {[
            data[0],
            data[Math.floor(data.length / 2)],
            data[data.length - 1],
          ]
            .filter(Boolean)
            .map((d, idx, arr) => {
              const i = data.indexOf(d!);
              const x = padLeft + i * barW + barW / 2;
              return (
                <text
                  key={idx}
                  x={x}
                  y={h - 6}
                  textAnchor={
                    idx === 0
                      ? "start"
                      : idx === arr.length - 1
                        ? "end"
                        : "middle"
                  }
                  className="fill-neutral-500 text-[10px]"
                >
                  {formatShortDate(d!.date)}
                </text>
              );
            })}
        </svg>
      </div>
    </div>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}
