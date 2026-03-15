# EngineClone — Build Context & Progress Log

## Project Goal
Build EngineClone: reverse-engineer any company's localization style into a Lingo.dev engine, preview it, and deploy it into the user's Lingo account with minimal manual work.

## Repository Root
`c:\Users\kusha\Code\engine-clone`

## Current Architecture (2026-03-16)

### Runtime Responsibilities
- Crawl + alignment: deterministic local pipeline (`src/lib/crawler.ts`, `src/lib/aligner.ts`)
- Extraction + cloned preview generation: NVIDIA OpenAI-compatible API (`src/lib/nvidia.ts`)
- Generic preview + locale recognition: Lingo.dev SDK (`src/lib/lingo.ts`)
- Deploy to user account: deterministic MCP execution over `https://mcp.lingo.dev/account` (`src/app/api/deploy/route.ts`)

### Credentials
- `LINGODOTDEV_API_KEY`: server-side key for recognize + generic preview path
- `NVIDIA_API_KEY`: server-side key for extraction + cloned preview generation
- User Lingo key: entered in deploy modal and posted to deploy route for account-scoped MCP operations
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anonymous stats tracking

### Deploy Strategy
- Deterministic MCP flow (no model planning loop)
- Route sequence:
  1. connect MCP
  2. create/find engine
  3. create brand voice
  4. create glossary items
  5. create instructions
  6. create scorers
- Scorers can auto-select provider/model from `models_list` if env model is absent

## Latest Changes (Most Recent)

1. Benchmark page now uses real benchmark outputs directly from `benchmark/`:
   - `benchmark/atlassian-engine-config.json`
   - `benchmark/salesforce-engine-config.json`
   - `benchmark/shopify-engine-config.json`
   - `benchmark/stripe-engine-config.json`
   - Wired in `src/app/compare/page.tsx` with updated copy labeling these as actual generated configs.

2. UI polish updates (hackathon-focused) while preserving existing color scheme:
   - Enhanced hero framing and progress context on home page.
   - Better back/start-new actions.
   - Compare page improved with clearer back navigation and stronger CTA layout.

3. Extraction hardening to reduce poor and repetitive outputs:
   - Increased pair sample size for extraction context (`MAX_PAIRS=22`).
   - Added stronger brand voice quality checks (length, sentence count, anti-generic checks).
   - Added second-pass NVIDIA brand voice generation before fallback.
   - Added anti-announcement and anti-copy checks to reject event/news-style copied paragraphs.
   - Added overlap checks against sampled target strings to reject near-copy brand voice text.

4. Prompt leakage mitigation for instructions/scorers:
   - Filtered template-like leaked phrases (e.g., literal `du/dein/dich` scorer prompt examples).
   - Removed highly copyable prompt examples from extraction instruction/scorer quality section.

5. Formality/tone anti-repeat normalization:
   - Added evidence-based inference from aligned pairs for formality (`du` vs `Sie`) and tone signals.
   - De-prioritized generic anchor labels (`neutral-professional`, `concise, technical, direct`) unless supported.

## Known Risk Areas

1. Extraction quality still depends on sampled pair quality.
   - Mitigation: stronger dedupe/ranking, anti-copy checks, second-pass brand voice generation.

2. Some runs can still produce contradictory style signals (e.g., `du` and `Sie` hints).
   - Current status: mitigated but not yet fully conflict-resolved by explicit contradiction pruning.

3. Repeated deploys can duplicate entities.
   - Future work: idempotent upsert semantics for glossary/instructions/scorers.

4. MCP tool schema/API evolution risk.
   - Mitigation: list tools at runtime + structured request-scoped deploy logs.

## Current Status

- `npm run build` passes cleanly.
- Deterministic auto deploy works and is no longer blocked on model tool-planning timeouts.
- Compare/benchmark view now reflects real benchmark JSON outputs (not sample placeholders).
- Extractor now has anti-template, anti-copy, and anti-announcement protections.

## Key Files

```
src/
  app/
    api/
      crawl/route.ts
      extract/route.ts
      preview/route.ts
      deploy/route.ts
      stats/route.ts
    compare/page.tsx
    page.tsx
  components/
    deploy-button.tsx
    engine-display.tsx
    comparison-table.tsx
    brand-voice-card.tsx
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
    nvidia.ts
    lingo.ts
    engine-config.ts
    mcp-deploy.ts
    supabase.ts
    types.ts
benchmark/
  atlassian-engine-config.json
  salesforce-engine-config.json
  shopify-engine-config.json
  stripe-engine-config.json
```

## Quick Ops Notes

- Deploy failures: use UI requestId and search backend logs for `[auto-deploy]`.
- Scorer issues: check `deploy.scorers.auto_model` and `deploy.scorers.skipped` log events.
- Brand voice issues: inspect extractor output first, then deploy fallback notes.
- Benchmark page source of truth is `benchmark/*.json` (via `src/app/compare/page.tsx`).
