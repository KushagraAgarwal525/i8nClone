import { NextRequest, NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { EngineConfig } from "@/lib/types";

interface DeployRequest {
  apiKey?: string;
  engineConfig?: EngineConfig;
}

interface AutoDeployReport {
  success: boolean;
  engineId: string | null;
  summary: string;
  notes: string[];
}

interface DeployToolCall {
  name: string;
  success: boolean;
  error: string | null;
  output: string | null;
}

type LogLevel = "INFO" | "WARN" | "ERROR";

const DEPLOY_TOTAL_TIMEOUT_MS = 180_000;
const MCP_CONNECT_TIMEOUT_MS = 15_000;
const MCP_CALL_TIMEOUT_MS = 25_000;

const PREFERRED_SCORER_MODELS: Array<{ provider: string; model: string }> = [
  { provider: "openai", model: "gpt-4.1-mini" },
  { provider: "openai", model: "gpt-4o-mini" },
  { provider: "anthropic", model: "claude-3.5-haiku" },
  { provider: "google", model: "gemini-2.5-flash" },
  { provider: "mistralai", model: "mistral-small-3.1-24b-instruct" },
];

function createRequestId() {
  return `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function redactApiKey(key?: string) {
  if (!key) return "missing";
  if (key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

function logDeploy(
  requestId: string,
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>
) {
  const payload = {
    ts: new Date().toISOString(),
    requestId,
    level,
    event,
    ...(data ? { data } : {}),
  };

  if (level === "ERROR") {
    console.error("[auto-deploy]", JSON.stringify(payload));
    return;
  }

  if (level === "WARN") {
    console.warn("[auto-deploy]", JSON.stringify(payload));
    return;
  }

  console.log("[auto-deploy]", JSON.stringify(payload));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function sanitizeEngineName(config: EngineConfig) {
  const base = `${config.companyName}-${config.sourceLocale}-to-${config.targetLocale}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "engineclone-generated";
}

function normalizeBrandVoiceText(config: EngineConfig): string {
  const raw = (config.brandVoice.text ?? "").trim();
  if (raw && !/^unknown$/i.test(raw)) {
    return raw;
  }

  const formality = (config.brandVoice.formality ?? "neutral").trim();
  const tone = (config.brandVoice.tone ?? "clear, concise, product-oriented").trim();
  const topRules = config.instructions
    .slice(0, 2)
    .map((inst) => inst.text)
    .filter(Boolean)
    .join(" ");

  return [
    `Use a ${formality} register for ${config.targetLocale} with a ${tone} tone.`,
    "Prefer short, direct UI phrasing and keep terminology consistent across product surfaces.",
    topRules || "Preserve key product terms and avoid unnecessary stylistic variation.",
  ].join(" ");
}

type ModelEntry = {
  provider?: string;
  model?: string;
};

function pickScorerModelFromCatalog(payload: unknown): { provider: string; model: string } | null {
  if (!Array.isArray(payload)) return null;

  const entries = payload
    .filter((item): item is ModelEntry => Boolean(item && typeof item === "object"))
    .map((item) => ({
      provider: typeof item.provider === "string" ? item.provider : "",
      model: typeof item.model === "string" ? item.model : "",
    }))
    .filter((item) => item.provider && item.model);

  for (const preferred of PREFERRED_SCORER_MODELS) {
    const found = entries.find(
      (entry) => entry.provider === preferred.provider && entry.model === preferred.model
    );
    if (found) return { provider: found.provider, model: found.model };
  }

  const acceptable = entries.find((entry) =>
    ["openai", "anthropic", "google", "mistralai", "qwen", "z-ai"].includes(entry.provider)
  );
  if (acceptable) return { provider: acceptable.provider, model: acceptable.model };

  return entries[0] ? { provider: entries[0].provider, model: entries[0].model } : null;
}

function extractToolPayload(result: {
  structuredContent?: unknown;
  content?: unknown;
}) {
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent;
  }

  if (Array.isArray(result.content)) {
    const textParts = result.content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean);

    if (textParts.length === 1) {
      try {
        return JSON.parse(textParts[0]);
      } catch {
        return textParts[0];
      }
    }

    if (textParts.length > 1) {
      return textParts.join("\n");
    }
  }

  return result.content ?? null;
}

function findEngineId(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(/eng_[A-Za-z0-9]+/);
    return match ? match[0] : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const id = findEngineId(item);
      if (id) return id;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string" && /^eng_[A-Za-z0-9]+$/.test(obj.id)) {
      return obj.id;
    }

    for (const nested of Object.values(obj)) {
      const id = findEngineId(nested);
      if (id) return id;
    }
  }

  return null;
}

function findEngineIdByName(value: unknown, engineName: string): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = findEngineIdByName(item, engineName);
      if (id) return id;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name : null;
    const id = typeof obj.id === "string" ? obj.id : null;

    if (name === engineName && id && /^eng_[A-Za-z0-9]+$/.test(id)) {
      return id;
    }

    for (const nested of Object.values(obj)) {
      const nestedId = findEngineIdByName(nested, engineName);
      if (nestedId) return nestedId;
    }
  }

  return null;
}

async function callMcpTool(
  params: {
    client: Client;
    requestId: string;
    deployToolCalls: DeployToolCall[];
    name: string;
    args: Record<string, unknown>;
  }
) {
  const { client, requestId, deployToolCalls, name, args } = params;

  logDeploy(requestId, "INFO", "mcp.call.start", { toolName: name });

  try {
    const result = await withTimeout(
      client.callTool({ name, arguments: args }),
      MCP_CALL_TIMEOUT_MS,
      `MCP callTool(${name})`
    );

    const payload = extractToolPayload({
      structuredContent: (result as { structuredContent?: unknown }).structuredContent,
      content: (result as { content?: unknown }).content,
    });

    const isError = Boolean((result as { isError?: boolean }).isError);
    const output = JSON.stringify(payload)?.slice(0, 5000) ?? null;

    deployToolCalls.push({
      name,
      success: !isError,
      error: isError ? output ?? "Tool returned isError" : null,
      output,
    });

    logDeploy(requestId, isError ? "WARN" : "INFO", "mcp.call.done", {
      toolName: name,
      isError,
    });

    return { isError, payload };
  } catch (error) {
    const err = serializeError(error);
    deployToolCalls.push({
      name,
      success: false,
      error: err.message,
      output: null,
    });

    logDeploy(requestId, "ERROR", "mcp.call.error", {
      toolName: name,
      ...err,
    });

    throw error;
  }
}

export async function POST(req: NextRequest) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  let transport: StreamableHTTPClientTransport | null = null;
  let mcpClient: Client | null = null;

  try {
    logDeploy(requestId, "INFO", "request.received");

    const body = (await req.json()) as DeployRequest;
    const apiKey = body.apiKey?.trim();
    const engineConfig = body.engineConfig;

    logDeploy(requestId, "INFO", "request.parsed", {
      hasApiKey: Boolean(apiKey),
      apiKey: redactApiKey(apiKey),
      companyName: engineConfig?.companyName,
      sourceLocale: engineConfig?.sourceLocale,
      targetLocale: engineConfig?.targetLocale,
      glossaryCount: engineConfig?.glossaryItems?.length,
      instructionCount: engineConfig?.instructions?.length,
      scorerCount: engineConfig?.scorers?.length,
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing Lingo API key.", requestId },
        { status: 400 }
      );
    }

    if (!engineConfig) {
      return NextResponse.json(
        { error: "Missing engine config.", requestId },
        { status: 400 }
      );
    }

    const deployDeadline = Date.now() + DEPLOY_TOTAL_TIMEOUT_MS;
    const deployToolCalls: DeployToolCall[] = [];

    mcpClient = new Client({
      name: "engineclone-auto-deploy-deterministic",
      version: "1.0.0",
    });

    transport = new StreamableHTTPClientTransport(
      new URL("https://mcp.lingo.dev/account"),
      {
        requestInit: {
          headers: {
            "x-api-key": apiKey,
          },
        },
      }
    );

    logDeploy(requestId, "INFO", "mcp.connect.start", {
      timeoutMs: MCP_CONNECT_TIMEOUT_MS,
    });

    await withTimeout(
      mcpClient.connect(transport),
      MCP_CONNECT_TIMEOUT_MS,
      "MCP connect"
    );

    logDeploy(requestId, "INFO", "mcp.connect.ok");

    const toolsResult = await withTimeout(
      mcpClient.listTools({}),
      MCP_CALL_TIMEOUT_MS,
      "MCP listTools"
    );

    const availableTools = toolsResult.tools.map((tool) => tool.name);
    logDeploy(requestId, "INFO", "mcp.tools.loaded", {
      count: availableTools.length,
    });

    const requiredTools = [
      "engines_create",
      "organizations_listEngines",
      "brandVoices_create",
      "glossaryItems_create",
      "instructions_create",
      "scorers_create",
    ];

    const missingRequired = requiredTools.filter((tool) => !availableTools.includes(tool));
    if (missingRequired.length) {
      logDeploy(requestId, "WARN", "mcp.tools.missing", { missingRequired });
    }

    const engineName = sanitizeEngineName(engineConfig);
    logDeploy(requestId, "INFO", "deploy.engine.prepare", { engineName });

    const createEngine = await callMcpTool({
      client: mcpClient,
      requestId,
      deployToolCalls,
      name: "engines_create",
      args: {
        name: engineName,
        sourceLocales: [engineConfig.sourceLocale],
        targetLocales: [engineConfig.targetLocale],
      },
    });

    let engineId = findEngineId(createEngine.payload);

    if (!engineId) {
      const listEngines = await callMcpTool({
        client: mcpClient,
        requestId,
        deployToolCalls,
        name: "organizations_listEngines",
        args: {},
      });

      engineId =
        findEngineIdByName(listEngines.payload, engineName) ??
        findEngineId(listEngines.payload);
    }

    if (!engineId) {
      throw new Error("Failed to resolve engine ID after engine creation.");
    }

    logDeploy(requestId, "INFO", "deploy.engine.ready", { engineId });

    const notes: string[] = [];

    const brandVoiceText = normalizeBrandVoiceText(engineConfig);

    await callMcpTool({
      client: mcpClient,
      requestId,
      deployToolCalls,
      name: "brandVoices_create",
      args: {
        ownerEngineId: engineId,
        targetLocale: engineConfig.targetLocale,
        text: brandVoiceText,
      },
    });

    if (brandVoiceText !== (engineConfig.brandVoice.text ?? "").trim()) {
      notes.push("Brand voice was missing/unknown, so a fallback voice was generated from extracted metadata.");
      logDeploy(requestId, "WARN", "deploy.brand_voice.fallback", {
        targetLocale: engineConfig.targetLocale,
      });
    }

    let glossaryCreated = 0;
    let glossaryFailed = 0;
    for (const item of engineConfig.glossaryItems) {
      if (Date.now() > deployDeadline) {
        throw new Error("Deterministic deploy timed out.");
      }

      try {
        await callMcpTool({
          client: mcpClient,
          requestId,
          deployToolCalls,
          name: "glossaryItems_create",
          args: {
            ownerEngineId: engineId,
            sourceLocale: item.sourceLocale,
            targetLocale: item.targetLocale,
            sourceText: item.sourceText,
            targetText: item.targetText,
            type: item.type,
            ...(item.hint ? { hint: item.hint } : {}),
          },
        });
        glossaryCreated += 1;
      } catch {
        glossaryFailed += 1;
      }
    }

    let instructionsCreated = 0;
    let instructionsFailed = 0;
    for (const instruction of engineConfig.instructions) {
      if (Date.now() > deployDeadline) {
        throw new Error("Deterministic deploy timed out.");
      }

      try {
        await callMcpTool({
          client: mcpClient,
          requestId,
          deployToolCalls,
          name: "instructions_create",
          args: {
            ownerEngineId: engineId,
            name: instruction.name,
            text: instruction.text,
            targetLocale: instruction.targetLocale,
          },
        });
        instructionsCreated += 1;
      } catch {
        instructionsFailed += 1;
      }
    }

    let scorerProvider = process.env.LINGO_SCORER_PROVIDER;
    let scorerModel = process.env.LINGO_SCORER_MODEL;

    let scorersCreated = 0;
    let scorersFailed = 0;

    if (!scorerProvider || !scorerModel) {
      try {
        const modelCatalog = await callMcpTool({
          client: mcpClient,
          requestId,
          deployToolCalls,
          name: "models_list",
          args: {},
        });

        const pick = pickScorerModelFromCatalog(modelCatalog.payload);
        if (pick) {
          scorerProvider = pick.provider;
          scorerModel = pick.model;
          logDeploy(requestId, "INFO", "deploy.scorers.auto_model", {
            scorerProvider,
            scorerModel,
          });
          notes.push(`Auto-selected scorer model: ${scorerProvider}/${scorerModel}.`);
        }
      } catch (error) {
        logDeploy(requestId, "WARN", "deploy.scorers.auto_model.error", {
          ...serializeError(error),
        });
      }
    }

    if (!scorerProvider || !scorerModel) {
      notes.push("Skipped scorer creation: no scorer model available. Set LINGO_SCORER_PROVIDER and LINGO_SCORER_MODEL to force one.");
      logDeploy(requestId, "WARN", "deploy.scorers.skipped", {
        reason: "Missing scorer provider/model even after models_list auto-selection",
      });
    } else {
      for (const scorer of engineConfig.scorers) {
        if (Date.now() > deployDeadline) {
          throw new Error("Deterministic deploy timed out.");
        }

        try {
          await callMcpTool({
            client: mcpClient,
            requestId,
            deployToolCalls,
            name: "scorers_create",
            args: {
              sourceLocale: scorer.sourceLocale,
              targetLocale: scorer.targetLocale,
              name: scorer.name,
              instruction: scorer.instruction,
              type: scorer.type,
              provider: scorerProvider,
              model: scorerModel,
            },
          });
          scorersCreated += 1;
        } catch {
          scorersFailed += 1;
        }
      }
    }

    notes.push(
      `Brand voice created for ${engineConfig.targetLocale}.`,
      `Glossary created: ${glossaryCreated}, failed: ${glossaryFailed}.`,
      `Instructions created: ${instructionsCreated}, failed: ${instructionsFailed}.`,
      `Scorers created: ${scorersCreated}, failed: ${scorersFailed}.`
    );

    const report: AutoDeployReport = {
      success: true,
      engineId,
      summary: "Deterministic MCP deploy completed.",
      notes,
    };

    logDeploy(requestId, "INFO", "deploy.complete", {
      ok: report.success,
      engineId,
      mcpCalls: deployToolCalls.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: report.success,
      report,
      model: "deterministic-mcp",
      mcpCalls: deployToolCalls,
      requestId,
    });
  } catch (error) {
    logDeploy(requestId, "ERROR", "deploy.failed", {
      ...serializeError(error),
      durationMs: Date.now() - startedAt,
    });

    const message = error instanceof Error ? error.message : "Auto deploy failed.";
    return NextResponse.json({ error: message, requestId }, { status: 500 });
  } finally {
    if (transport) {
      await withTimeout(
        transport.terminateSession().catch(() => {}),
        3000,
        "MCP terminateSession"
      ).catch(() => {});
    }

    if (mcpClient) {
      await withTimeout(mcpClient.close().catch(() => {}), 3000, "MCP close").catch(
        () => {}
      );
    }

    logDeploy(requestId, "INFO", "mcp.disconnect.done");
  }
}
