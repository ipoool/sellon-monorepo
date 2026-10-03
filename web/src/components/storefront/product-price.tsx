import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  priceCents: number;
  /** "Harga coret" — the pre-discount price. 0 or absent = no discount. */
  compareAtCents?: number;
  /** Typography for the real price; each storefront template has its own scale. */
  className?: string;
  /** Lay the struck price under the real one instead of beside it. */
  stacked?: boolean;
  /** Show the "-10%" chip. Off in the densest grids, where it crowds the card. */
  showBadge?: boolean;
  /** Prefix such as "Mulai" for products whose variants differ in price. */
  prefix?: string;
};

/**
 * The one place a storefront price is rendered.
 *
 * Six catalog templates plus the product page each printed `formatRupiah(...)`
 * inline, so adding the discount display in one of them would have left the
 * other six silently without it.
 *
 * A discount is shown ONLY when the compare-at price genuinely exceeds the
 * real one. A seller who types something lower (or equal) gets no strike
 * rather than a "saving" of zero or less — the API rejects that input, and
 * this is the second half of the same rule for rows written before it existed.
 */
export function ProductPrice({
  priceCents,
  compareAtCents = 0,
  className,
  stacked = false,
  showBadge = false,
  prefix,
}: Props) {
  const hasDiscount = compareAtCents > priceCents && priceCents >= 0;
  const percentOff = hasDiscount
    ? Math.round(((compareAtCents - priceCents) / compareAtCents) * 100)
    : 0;

  const price = (
    <span className={cn("font-display font-semibold", className)}>
      {prefix ? `${prefix} ` : ""}
      {formatRupiah(priceCents)}
    </span>
  );

  if (!hasDiscount) return price;

  return (
    <span
      className={cn(
        "flex gap-x-1.5",
        stacked ? "flex-col items-start" : "flex-wrap items-baseline",
      )}
    >
      {price}
      <span className="flex items-baseline gap-1.5">
        <s className="text-xs text-neutral-400">
          {formatRupiah(compareAtCents)}
        </s>
        {/* Rounded to a whole percent: "-10%" is what catches the eye, and a
            buyer has no use for "-9.7%". Suppressed below 1% so a token
            discount cannot advertise itself as "-0%". */}
        {showBadge && percentOff >= 1 && (
          <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-danger">
            -{percentOff}%
          </span>
        )}
      </span>
    </span>
  );
}
