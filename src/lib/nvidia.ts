import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.2-3b-instruct";

let client: OpenAI | null = null;

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("Missing NVIDIA_API_KEY for NVIDIA model access");
  }
  return key;
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: getApiKey(),
      baseURL: process.env.NVIDIA_BASE_URL ?? DEFAULT_BASE_URL,
    });
  }
  return client;
}

export function getNvidiaModel(): string {
  return process.env.NVIDIA_MODEL ?? DEFAULT_MODEL;
}

export async function nvidiaChat(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    retries?: number;
    step?: string;
  },
): Promise<string> {
  const maxTokens = options?.maxTokens ?? 2048;
  const temperature = options?.temperature ?? 0.2;
  const topP = options?.topP ?? 0.7;
  const retries = options?.retries ?? 2;
  const step = options?.step ?? "nvidia-chat";

  for (let attempt = 0; ; attempt++) {
    try {
      const completion = await getClient().chat.completions.create({
        model: getNvidiaModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: false,
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from NVIDIA model");
      return typeof content === "string" ? content : JSON.stringify(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (attempt >= retries) {
        throw new Error(`NVIDIA step '${step}' failed: ${msg}`);
      }
      const transient = /(500|503|429|timeout|temporar|overload|rate limit)/i.test(msg);
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
