import Link from "next/link";
import { ArrowRight, ExternalLink, Star, Store } from "lucide-react";

import { Container } from "@/components/layout/container";

export type ShowcaseStore = {
  slug: string;
  name: string;
  logo_url: string;
  banner_url: string;
  category: string;
  city: string;
  theme_hue: number;
  product_count: number;
};

/**
 * "Toko yang sudah jalan di SellOn" — the home page's proof section.
 *
 * Every card is a real store with at least one paid order, and every card
 * links to that store's live public storefront so a visitor can verify the
 * claim instead of trusting it. This replaces the invented statistics and
 * testimonial names the page used to carry (see PRODUCT.md).
 *
 * Renders nothing when the list is empty: a proof section with no proof is
 * worse than no section.
 */
export function StoreShowcase({ stores }: { stores: ShowcaseStore[] }) {
  if (stores.length === 0) return null;

  return (
    <section className="py-12 lg:py-14">
      <Container>
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="inline-flex items-center gap-2 font-display text-base font-bold text-neutral-900 sm:text-lg">
            <Star className="size-4 fill-warning text-warning" aria-hidden />
            Toko yang sudah jalan di SellOn
          </h2>
        </div>

        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {stores.slice(0, 4).map((s) => (
            <li key={s.slug}>
              <Link
                href={`/${s.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated"
              >
                {/* Cover: the seller's own banner when they have one, else a
                    wash in their own theme hue — so even a bannerless store
                    reads as theirs rather than as a grey placeholder. */}
                <div
                  className="h-20 bg-cover bg-center"
                  style={
                    s.banner_url
                      ? { backgroundImage: `url(${s.banner_url})` }
                      : {
                          background: `linear-gradient(135deg, oklch(0.94 0.06 ${s.theme_hue}), oklch(0.97 0.025 ${s.theme_hue}))`,
                        }
                  }
                />
                <div className="p-3.5">
                  {/* Logo rides the cover's edge but stays in flow, so it can
                      never sit on top of the store name. */}
                  <div className="-mt-9 mb-2.5 flex items-end gap-2.5">
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-soft">
                      {s.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.logo_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Store className="size-4 text-brand-600" aria-hidden />
                      )}
                    </span>
                    <span className="mb-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                      BUKA
                    </span>
                  </div>

                  <h3 className="truncate text-sm font-bold text-neutral-900">
                    {s.name}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                    {[s.category, s.city].filter(Boolean).join(" · ") ||
                      `${s.product_count} produk`}
                  </p>
                  <span className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand-600">
                    Kunjungi toko
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                    <ExternalLink className="size-3 opacity-60" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

      </Container>
    </section>
  );
}
