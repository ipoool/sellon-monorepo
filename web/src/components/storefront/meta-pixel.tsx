"use client";

import Script from "next/script";

// Per-store Meta Pixel. Rendered in the storefront layout only when the seller
// has enabled Meta tracking (server only exposes meta_pixel_id then). Loads the
// fbq base script + fires the initial PageView. Product/cart/checkout/purchase
// events are fired by trackMeta() from the relevant pages — deduped server-side
// with the Conversions API via a shared eventID.
export function MetaPixel({ pixelId }: { pixelId: string }) {
  // The id lands inside an inline script body, so anything but digits would be
  // executable JS running on the platform (or seller custom-domain) origin,
  // where the seller session cookie lives. The API validates on write; this is
  // the second gate for rows saved before that existed.
  if (!pixelId || !/^[0-9]{6,20}$/.test(pixelId)) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', ${JSON.stringify(pixelId)});
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
