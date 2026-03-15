// ── Crawler Output ──
export interface TextNode {
  path: string;       // DOM path e.g. "body>main>section:nth-child(2)>h1"
  tag: string;        // e.g. "h1", "p", "a", "button"
  text: string;       // visible text content, trimmed
  index: number;      // order of appearance in document
}

export interface AlignedPair {
  sourcePath: string;
  sourceText: string;
  targetText: string;
  tag: string;
}

export interface CrawlResult {
  sourceUrl: string;
  targetUrl: string;
  sourceLocale: string;
  targetLocale: string;
  sourceNodes: TextNode[];
  targetNodes: TextNode[];
  alignedPairs: AlignedPair[];
}

// ── Extraction Output (what the LLM returns via Lingo.dev) ──
export interface ExtractionResult {
  brandVoice: string;         // free-form brand voice text for Lingo.dev
  formality: string;          // e.g. "informal (du)" or "formal (Sie)"
  tone: string;               // e.g. "Direct, technical, concise"
  nonTranslatables: Array<{
    term: string;
    reason: string;
  }>;
  customTranslations: Array<{
    sourceTerm: string;
    targetTerm: string;
    hint: string;
  }>;
  instructions: Array<{
    name: string;
    text: string;
  }>;
  scorers: Array<{
    name: string;
    instruction: string;
    type: "boolean" | "percentage";
  }>;
}

// ── Engine Config (ready for Lingo.dev) ──
export interface EngineConfig {
  sourceLocale: string;
  targetLocale: string;
  companyName: string;
  brandVoice: {
    targetLocale?: string;
    text: string;
    formality?: string;
    tone?: string;
  };
  glossaryItems: Array<{
    sourceLocale: string;
    targetLocale: string;
    sourceText: string;
    targetText: string;
    type: "custom_translation" | "non_translatable";
    hint?: string;
  }>;
  instructions: Array<{
    name: string;
    targetLocale: string;
    text: string;
  }>;
  scorers: Array<{
    name: string;
    instruction: string;
    type: "boolean" | "percentage";
    sourceLocale: string;
    targetLocale: string;
  }>;
}

// ── Preview Result ──
export interface PreviewResult {
  sampleStrings: Record<string, string>;          // original English strings
  genericTranslations: Record<string, string>;    // default Lingo.dev translation
  clonedTranslations: Record<string, string>;     // translation with extracted engine rules
}

// ── Stats (for marketing) ──
export interface UsageStats {
  totalEngines: number;
  last24h: number;
  topCompany: { name: string; count: number } | null;
  topLocale: { locale: string; count: number } | null;
}

// ── API Request/Response Types ──
export interface CrawlRequest {
  sourceUrl: string;
  targetUrl: string;
  sourceLocale: string;
  targetLocale: string;
}

export interface ExtractRequest {
  alignedPairs: AlignedPair[];
  sourceLocale: string;
  targetLocale: string;
  companyName: string;
}

export interface PreviewRequest {
  engineConfig: EngineConfig;
}
