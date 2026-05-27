---
name: feedback-auto-generate-image-for-posts
description: When user requests "single post content" or "content carousel", always generate the image via nanobanana automatically as part of the workflow
metadata:
  type: feedback
---

When the user asks to create a **single post content** or **content carousel**, always generate the image via `mcp__nanobanana__generate_image` automatically — do not skip it or wait to be asked.

**Why:** User confirmed on 2026-05-17 that image generation should be a default step in the content creation workflow, not an optional add-on. They said "next time jika saya mention buatkan single post content atau content carousel, gunakan nano banana untuk generate imagenya."

**How to apply:**
- Read `_context/sellon_brand_style_guide.md` and `social-creatives/STYLE-GUIDE.md` before generating
- Write a creative brief first (concept, layout, copy elements), then construct the nanobanana prompt using the base prompt snippet from the style guide
- Always include the brand base prompt snippet from `social-creatives/STYLE-GUIDE.md`
- Save output to `nanobanana/` folder
- Apply negative prompt: "hard drop shadow, halftone dots, speed lines, starburst, rainbow gradient, orange dominant color, neon colors, comic style font, heavy outlines, neubrutalism, corporate stock photo, cluttered layout, more than 3 colors"
- Use `resolution: 4k` and `thinking_level: high` for best quality
