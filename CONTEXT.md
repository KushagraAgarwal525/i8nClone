# EngineClone — Build Context & Progress Log

## Project Goal
Build EngineClone: reverse-engineer any company's localization style into a Lingo.dev engine, preview it, and deploy it into the user's Lingo account with low manual effort.

## Repository Root
`c:\Users\kusha\Code\engine-clone`

## Current Architecture (2026-03-15)

### Runtime Responsibilities
- Crawling + alignment: local deterministic pipeline (`crawler.ts`, `aligner.ts`)
- Extraction + cloned preview synthesis: NVIDIA OpenAI-compatible chat (`nvidia.ts`)
- Generic preview + locale recognition: Lingo.dev SDK (`lingo.ts`)
- Deploy to user account: deterministic MCP execution against `https://mcp.lingo.dev/account`

### Credentials
- `LINGODOTDEV_API_KEY`: server key for recognize + generic preview
- `NVIDIA_API_KEY`: server key for extraction and cloned preview generation
- User Lingo key: entered in deploy modal and sent only to deploy route for MCP account actions
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: stats only

### Deploy Strategy
- Auto deploy is deterministic (no LLM planning loop)
- Route: `src/app/api/deploy/route.ts`
- Sequence:
  1. connect MCP
  2. create/find engine
  3. create brand voice
  4. create glossary items
  5. create instructions
  6. create scorers
- Scorer creation can auto-select provider/model from `models_list` if env scorer config is missing

## Recent Major Changes

1. Replaced fragile model-driven deploy orchestration with deterministic MCP execution.
2. Added structured request-scoped logs for deploy (`requestId`, phase events, timing, tool-level status).
3. Added timeout guards around MCP connect and MCP tool calls.
4. Added scorer auto-selection from `models_list` when scorer env vars are absent.
5. Added brand voice fallback generation to avoid deploying empty/unknown voice text.
6. Improved extractor fallback to generate paragraph-style brand voice when model output is sparse.

## Known Risk Areas

1. Extraction model output occasionally omits rich brand voice paragraph.
   - Mitigation: paragraph fallback in extractor + engine config fallback + deploy-time normalization.
2. Repeated deploys can duplicate entities.
   - Future improvement: idempotent upsert behavior for glossary/instructions/scorers.
3. MCP API schemas can evolve.
   - Mitigation: `listTools` + schema-driven tool usage and verbose deploy logs.

## Current Status

- App builds successfully (`npm run build` passing).
- Auto deploy is now operational in deterministic mode.
- Compare page and stats routes are present and build-clean.
- Deploy logs are now suitable for production debugging.

## File Inventory (Key)

```
src/
  app/
    api/
      crawl/route.ts
      extract/route.ts
      preview/route.ts
      stats/route.ts
      deploy/route.ts
  lib/
    crawler.ts
    aligner.ts
    extractor.ts
    nvidia.ts
    lingo.ts
    engine-config.ts
    mcp-deploy.ts
    types.ts
  components/
    deploy-button.tsx
    engine-display.tsx
    brand-voice-card.tsx
    glossary-table.tsx
    instructions-list.tsx
    scorer-badges.tsx
    translation-preview.tsx
    comparison-table.tsx
data/
  sample-engines.json
```

## Quick Ops Notes

- If deploy fails, use the `requestId` shown in UI and grep server logs for `[auto-deploy]`.
- If scorers are skipped, check logs for `deploy.scorers.auto_model` and `deploy.scorers.skipped`.
- If brand voice looks generic, inspect extractor output first, then deploy fallback warnings.
