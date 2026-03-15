# EngineClone

> Reverse-engineer any company's translation engine in seconds.

Point at two URLs — source and translated — and get a complete, deployable localization engine that matches the brand voice, glossary, tone, and quality rules of the original. Uses [Lingo.dev](https://lingo.dev) for locale detection + baseline translation and NVIDIA-hosted LLMs for style extraction and cloned preview.

## Live Demo

```
/         → Clone any translation engine
/compare  → See pre-generated engines for Stripe, Linear, Vercel, Notion
```

## How It Works

1. **Crawl** — Fetches both source and translated URLs, extracts visible text nodes with DOM paths
2. **Align** — 3-pass algorithm matches source/target pairs (exact path → normalized → positional)
3. **Extract** — NVIDIA-hosted LLM analyzes aligned pairs and returns structured style metadata (brand voice, formality, tone, glossary candidates, instructions, scorers)
4. **Preview** — Two side-by-side translations: generic Lingo.dev vs. cloned engine
5. **Deploy** — Copyable MCP commands + downloadable JSON for Lingo.dev setup

## Tech Stack

- **Next.js 15** — App Router, TypeScript
- **lingo.dev SDK** — Locale recognition + baseline localization preview
- **OpenAI SDK + NVIDIA API** — Style extraction + cloned-style preview generation
- **Supabase** — Anonymous usage tracking (fire-and-forget inserts)
- **Cheerio** — HTML parsing and text extraction
- **Tailwind CSS 4** — Raw utility classes, dark theme

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/your-username/engine-clone
cd engine-clone
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

```env
LINGODOTDEV_API_KEY=your_key_here
NVIDIA_API_KEY=your_nvidia_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.2-3b-instruct
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Get your Lingo.dev API key at [lingo.dev/dashboard](https://lingo.dev/dashboard). Generate your NVIDIA API key from your NVIDIA API dashboard.

### 3. Supabase Setup (optional — for usage stats)

Run this in your Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS public.engine_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  company_name text,
  source_locale text,
  target_locale text,
  pair_count integer,
  glossary_count integer
);

ALTER TABLE public.engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON public.engine_runs FOR INSERT TO anon WITH CHECK (true);

CREATE OR REPLACE FUNCTION get_top_company()
RETURNS TABLE(name text, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT company_name as name, COUNT(*) as count
  FROM public.engine_runs
  WHERE company_name IS NOT NULL
  GROUP BY company_name ORDER BY count DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_top_locale()
RETURNS TABLE(locale text, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT target_locale as locale, COUNT(*) as count
  FROM public.engine_runs
  WHERE target_locale IS NOT NULL
  GROUP BY target_locale ORDER BY count DESC LIMIT 1;
$$;
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  lib/
    lingo.ts          — SDK singleton
    supabase.ts       — Supabase client
    types.ts          — Shared TypeScript interfaces
    crawler.ts        — HTML fetching and text extraction
    aligner.ts        — DOM-path alignment algorithm
    extractor.ts      — Style extraction via localizeObject
    engine-config.ts  — ExtractionResult → EngineConfig mapper
    mcp-deploy.ts     — MCP command generation and JSON export
  app/
    page.tsx          — Main extraction flow
    layout.tsx        — Root layout and metadata
    compare/page.tsx  — Static engine comparison
    api/
      crawl/          — Crawl + align endpoint
      extract/        — Extract + track endpoint
      preview/        — Generic vs. cloned preview
      stats/          — Usage statistics
  components/
    url-input-form
    extraction-stepper
    engine-display
    brand-voice-card
    glossary-table
    instructions-list
    scorer-badges
    translation-preview
    deploy-button
    comparison-table
data/
  sample-engines.json — Pre-generated engines (Stripe, Linear, Vercel, Notion)
```

## API Reference

### `POST /api/crawl`
```json
{ "sourceUrl": "...", "targetUrl": "...", "sourceLocale": "en", "targetLocale": "de" }
```
Returns: `{ pairs: AlignedPair[], sourceCount, targetCount }`

### `POST /api/extract`
```json
{ "pairs": [...], "sourceLocale": "en", "targetLocale": "de", "companyName": "..." }
```
Returns: `{ extraction: ExtractionResult, engineConfig: EngineConfig }`

### `POST /api/preview`
```json
{ "engineConfig": {...}, "targetLocale": "de" }
```
Returns: `{ samples: PreviewSample[], generic: string[], cloned: string[] }`

### `GET /api/stats`
Returns: `{ totalEngines, last24h, topCompany, topLocale }`

## Testing

Try these URL pairs:
- `stripe.com` → `stripe.com/de` (en → de)
- `linear.app` → `linear.app/de` (en → de)
- `vercel.com` → `vercel.com/de` (en → de)

## Built For

[Lingo.dev Hackathon](https://lingo.dev) — demonstrating API-native localization intelligence with zero external dependencies.


This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
