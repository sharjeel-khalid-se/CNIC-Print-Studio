# CNIC Print Studio

CNIC Print Studio is a Next.js web app to print Pakistani CNIC cards in exact dimensions (85.6 x 54 mm). It lets users upload front and back images, crop accurately, preview layout by paper size, and export a duplex-ready PDF for clean and aligned printing.

## Features
- Upload CNIC front & back images
- Manual crop tool with Auto Detect (85.6 × 54mm ratio)
- Page size: A4, A5, A6
- Full page preview with all slots visible (active + inactive placeholders)
- Quantity selector (up to max slots per page)
- PDF download — 2 pages (fronts + backs), duplex-ready
- Dark theme, mobile-friendly

## SEO
- Complete metadata for title, description, keywords, canonical URL, Open Graph, and Twitter cards
- Auto-generated `/robots.txt` via Next.js metadata routes
- Auto-generated `/sitemap.xml` via Next.js metadata routes

Set your production domain in an environment variable:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Without this value, SEO URLs default to `http://localhost:3000`.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000

## How to Print

1. Upload front and back CNIC images
2. Use crop tool to trim to CNIC area (or Auto Detect)
3. Select page size (A4 recommended)
4. Select quantity
5. Click **Download PDF**
6. Open PDF → Print → Enable **Two-sided / Duplex** → **Flip on short edge**
7. Cut out with scissors!

## PDF Structure
- Page 1: All front copies (correctly placed)
- Page 2: All back copies (X-mirrored for duplex alignment)

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- jsPDF (PDF generation)
- IBM Plex Sans + Mono fonts
