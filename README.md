# EngineClone

> Reverse-engineer any company's localization style into a deployable translation engine.

Stripe spent years tuning their German copy style. Atlassian, Salesforce, and Shopify did too.
EngineClone turns that visible but hard-to-extract translation behavior into a real engine config in seconds: brand voice, glossary, instructions, and scorer rules ready for deployment with ***one click***.

Built for the [Lingo.dev Hackathon](https://lingo.dev), with Lingo.dev for localization workflows and NVIDIA-hosted LLMs for extraction and style cloning.

## Why This Exists

Most teams do not fail at translation because of vocabulary. They fail on consistency:

- Wrong formality ("du" vs "Sie")
- Brand terms translated when they should not be
- Product terminology changing across screens
- Tone drifting between marketing and UI copy

EngineClone crawls source and translated pages, learns those hidden rules from real copy, and outputs a reusable engine config you can apply to your own product.

## Live App

- `/` -> Clone a translation engine from URL pairs
- `/compare` -> Compare benchmark engines for Atlassian, Salesforce, Shopify, Stripe

## Core Flow

1. Crawl
- Fetch source and translated pages
- Extract visible text nodes with DOM paths

2. Align
- 3-pass matcher: exact path -> normalized path -> positional fallback

3. Extract
- NVIDIA-hosted model returns structured style metadata
- Includes brand voice paragraph, formality, tone, glossary candidates, instructions, and scorers

4. Preview
- Side-by-side generic localization vs cloned engine output

5. Deploy
- Deterministic MCP runbook snippets + downloadable JSON config for Lingo.dev setup

## What Makes It Production-Ready

- Two-pass brand voice generation (primary extraction + targeted regeneration)
- Anti-copy safeguards to avoid parroting website announcement text
- Prompt-leak filtering for generic anchor phrases
- Evidence-based formality and tone normalization
- Deterministic deployment path (no LLM planning for deploy commands)
- Optional anonymous usage tracking via Supabase

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS 4
- lingo.dev SDK (locale handling + baseline localization)
- OpenAI SDK against NVIDIA API (extraction + cloned preview)
- Cheerio (HTML parsing)
- Supabase (optional usage stats)

## Benchmarks Included

The compare page is wired to real generated configs in `benchmark/`:

- Atlassian (`en -> de`)
- Salesforce (`en -> de`)
- Shopify (`en -> de`)
- Stripe (`en -> de`)

## Quick Start

### 1. Install

```bash
git clone https://github.com/your-username/engine-clone
cd engine-clone
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` and provide keys:

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

### 3. Run Dev Server

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

## Optional: Supabase Usage Stats

Run in Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS public.engine_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  source_url text,
  company_name text,
  source_locale text,
  target_locale text,
  glossary_count integer,
  instruction_count integer,
  non_translatable_count integer
);

ALTER TABLE public.engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert" ON public.engine_runs FOR INSERT TO anon WITH CHECK (true);

CREATE OR REPLACE FUNCTION get_top_company()
RETURNS TABLE(name text, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT company_name AS name, COUNT(*) AS count
  FROM public.engine_runs
  WHERE company_name IS NOT NULL
  GROUP BY company_name
  ORDER BY count DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_top_locale()
RETURNS TABLE(locale text, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT target_locale AS locale, COUNT(*) AS count
  FROM public.engine_runs
  WHERE target_locale IS NOT NULL
  GROUP BY target_locale
  ORDER BY count DESC
  LIMIT 1;
$$;
```

## API Surface

### POST `/api/crawl`

Request:

```json
{ "sourceUrl": "...", "targetUrl": "...", "sourceLocale": "en", "targetLocale": "de" }
```

Response:

```json
{
  "sourceUrl": "...",
  "targetUrl": "...",
  "sourceLocale": "en",
  "targetLocale": "de",
  "sourceNodes": [],
  "targetNodes": [],
  "alignedPairs": []
}
```

### POST `/api/extract`

Request:

```json
{ "alignedPairs": [], "sourceLocale": "en", "targetLocale": "de", "companyName": "Stripe" }
```

Response:

```json
{ "extraction": {}, "engineConfig": {} }
```

### POST `/api/preview`

Request:

```json
{ "engineConfig": {} }
```

Response:

```json
{ "sampleStrings": {}, "genericTranslations": {}, "clonedTranslations": {} }
```

### POST `/api/deploy`

Request:

```json
{ "engineConfig": {}, "apiKey": "LINGO_API_KEY" }
```

Response:

```json
{ "ok": true, "report": {}, "model": "deterministic-mcp", "mcpCalls": [], "requestId": "dep_..." }
```

### GET `/api/stats`

Response:

```json
{ "totalEngines": 0, "last24h": 0, "topCompany": null, "topLocale": null }
```

## Recommended Demo URL Pairs

- `stripe.com` -> `stripe.com/de`
- `shopify.com` -> `shopify.com/de`
- `atlassian.com` -> `atlassian.com/de`

## Project Structure

```text
src/
  app/
    page.tsx
    compare/page.tsx
    api/
      crawl/route.ts
      extract/route.ts
      preview/route.ts
      deploy/route.ts
      stats/route.ts
  components/
    brand-voice-card.tsx
    comparison-table.tsx
    deploy-button.tsx
    engine-display.tsx
    glossary-table.tsx
    instructions-list.tsx
    scorer-badges.tsx
    translation-preview.tsx
    extraction-stepper.tsx
    url-input-form.tsx
  lib/
    crawler.ts
    aligner.ts
    extractor.ts
    engine-config.ts
    lingo.ts
    nvidia.ts
    mcp-deploy.ts
    supabase.ts
    types.ts
benchmark/
  atlassian-engine-config.json
  salesforce-engine-config.json
  shopify-engine-config.json
  stripe-engine-config.json
```

## Built For

Lingo.dev Hackathon 2026.

"You just cloned years of localization behavior in under a minute" is the core product moment.
