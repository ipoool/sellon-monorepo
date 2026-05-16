# SellOn — Brand Style Guide

Use this file when creating visual briefs, directing creative design, or doing image generation for SellOn.

---

## Visual Identity Overview

**Style**: Clean Modern SaaS
**Mood**: Professional, trustworthy, modern — warm but serious

SellOn is a platform that handles sellers' financial transactions. Design must build trust, not just attract attention. Cluttered or overly playful visuals will undermine the perception of the product's reliability.

Visual keywords: **clean, crisp, modern, trustworthy, accessible**

---

## Color Palette

### Primary Brand Colors

| Name | Hex / OKLCH | Usage |
|---|---|---|
| **Emerald Teal** | `#10b981` (approx, OKLCH hue 145) | Primary brand — CTA, highlights, active accents |
| **Emerald Deep** | `#059669` | Hover state, visual emphasis, badges |
| **Emerald Light** | `#d1fae5` | Card backgrounds, subtle highlights, chips |

### Neutral Colors

| Name | Hex | Usage |
|---|---|---|
| **Slate 900** | `#0f172a` | Primary text, dark headings |
| **Slate 700** | `#334155` | Body text, labels |
| **Slate 400** | `#94a3b8` | Placeholder text, secondary content |
| **Slate 100** | `#f1f5f9` | Page backgrounds, neutral surfaces |
| **White** | `#ffffff` | Cards, modals, overlays |

### Accent Colors (use sparingly)

| Name | Hex | Usage |
|---|---|---|
| **Amber** | `#f59e0b` | Warning badges, promo highlights, attention |
| **Rose** | `#f43f5e` | Error states, "sold out" badges, urgency |
| **Sky Blue** | `#0ea5e9` | Informational, tooltips, secondary links |

### Color Rules
- Emerald Teal is the only dominant brand color — use it consistently
- Gradients are allowed if subtle (dark emerald to light emerald), not rainbow gradients
- No more than 3 colors in a single composition (excluding black/white/grey)
- Dark backgrounds: use Slate 900 or Slate 800 as the base

---

## Typography

### Fonts

| Role | Font | Weight |
|---|---|---|
| **Display / Hero heading** | Plus Jakarta Sans | ExtraBold (800) |
| **Heading** | Plus Jakarta Sans | Bold (700) |
| **Subheading** | Plus Jakarta Sans | SemiBold (600) |
| **Body** | Plus Jakarta Sans | Regular (400) |
| **Caption / Label** | Plus Jakarta Sans | Medium (500) |
| **UI elements / Badge** | Plus Jakarta Sans | SemiBold (600) |

### Type Rules
- Always Plus Jakarta Sans — do not mix with other fonts
- Headings always dark (Slate 900) unless on a dark background
- Never use weights below Regular (400) for body text
- Letter spacing: normal for body, slightly wider for all-caps labels
- Line height: 1.5 for body, 1.2–1.3 for headings

### Type Scale (social creatives reference, 1080px canvas)

| Element | Size |
|---|---|
| Hero headline | 72–96px |
| Sub-headline | 48–60px |
| Body / Caption | 28–36px |
| Badge / Label | 20–24px |
| Brand mark | 28–36px |

---

## Logo & Brand Mark

- **Name rendering**: Always "SellOn" — capital S, capital O (not "sellon", not "SELLON", not "Sellon")
- **Icon**: No dedicated icon at this time — use the "SellOn" wordmark only
- **Wordmark color**: Emerald Teal on light backgrounds; White on dark backgrounds
- **Placement**: Top-left or bottom-center of creatives
- **Minimum size**: Never smaller than 24px height
- **Clear space**: At least 16px padding on all sides around the logo
- **Do not**: Rotate the logo, change its color outside the rules above, add drop shadows or outlines to the wordmark

---

## Graphic Elements

### Shapes
- Rounded rectangles as primary containers (border radius 8–16px)
- Chips/badges with rounded corners for status labels and categories
- Thin divider lines (1px, Slate 200) to separate content sections
- Progress bars and step indicators for "how it works" narratives

### Texture & Effects
- Subtle dot grid pattern (very light, 5–8% opacity) as optional background texture
- Subtle gradient on hero sections: dark emerald to light emerald, or slate to white
- Soft box shadow (`shadow-card`): no hard shadow, no harsh offset
- Light blur overlay on modals/dialogs

### Icon Style
- Outline icons (Lucide style — stroke weight 1.5–2px)
- Consistent sizing per context: 16px (inline), 20px (UI buttons), 24px (standalone)
- Color: Slate 600 for neutral icons, Emerald Teal for active/highlighted icons
- Do not use filled icons except for status indicators (success checkmark, error X)

### Illustrations (if needed)
- Flat minimal illustration style — not comic, not isometric
- Characters: simplified, friendly, representative of Indonesian sellers
- Colors: follow the brand palette — emerald as the dominant color
- No heavy outlines — thin or no outlines at all

---

## Dos and Don'ts

### Do
- Use generous white space — layouts that "breathe" feel more premium
- Anchor with Emerald Teal as the primary visual focal point
- Use clear text hierarchy (heading → subheading → body → caption)
- Use soft shadows (not hard offset) for depth
- Ensure every element has a purpose — no empty decoration

### Don't

| Avoid | Reason |
|---|---|
| Hard drop shadow (offset, no blur) | Looks comic/retro, not on-brand |
| Orange, purple, or neon yellow as primary colors | Outside the brand palette |
| Fredoka, Nunito, or rounded comic fonts | Too playful for a transaction platform |
| Heavy element outlines (3–5px stroke) | Neubrutalism style, not SellOn |
| Halftone dots, speed lines, starburst graphics | Too comic/energetic |
| Plain white background with no visual hierarchy | Feels empty and unpolished |
| More than 3 colors in a single composition | Compositions become noisy and unfocused |
| Overly expressive or cartoon characters | Not professional for a financial context |

---

## Image Generation Base Prompt Snippet

Include this in every image generation prompt to anchor the SellOn visual style:

```
clean modern SaaS aesthetic, professional and trustworthy design,
emerald teal color (#10b981) as primary brand color with white and light slate backgrounds,
Plus Jakarta Sans typography, rounded corners, soft box shadows,
minimal flat illustration style, no hard outlines, no comic style,
no rainbow gradients, subtle dot grid texture overlay optional,
high whitespace, clean hierarchy, no clutter
```

---

## Quick Reference

```
PRIMARY       #10b981 (Emerald Teal)   #059669 (Emerald Deep)   #d1fae5 (Emerald Light)
NEUTRAL       #0f172a (Slate 900)      #334155 (Slate 700)      #f1f5f9 (Slate 100)
ACCENT        #f59e0b (Amber)          #f43f5e (Rose)           #0ea5e9 (Sky)
FONTS         Plus Jakarta Sans — 400/500/600/700/800 only
STYLE         Clean · Minimal · Soft shadow · Rounded · White space heavy
MOOD          Professional · Trustworthy · Accessible · Modern SaaS
```
