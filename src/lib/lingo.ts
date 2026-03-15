import { LingoDotDevEngine } from "lingo.dev/sdk";

// Lazy singleton — defers initialization until first use so build-time
// module evaluation doesn't fail when LINGODOTDEV_API_KEY is not set.
let _instance: LingoDotDevEngine | null = null;

export function getLingo(): LingoDotDevEngine {
  if (!_instance) {
    _instance = new LingoDotDevEngine({
      apiKey: process.env.LINGODOTDEV_API_KEY!,
    });
  }
  return _instance;
}

