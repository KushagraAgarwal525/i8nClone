import type { EngineConfig } from "./types";

export type McpClient = "copilot" | "cursor" | "claude";

export function getLingoLinks() {
  return {
    dashboard: "https://lingo.dev/en/orgs/~",
    apiKeys: "https://lingo.dev/en/docs/api-keys",
    mcpDocs: "https://lingo.dev/en/docs/mcp",
    connectEngine: "https://lingo.dev/en/connect-your-engine",
  };
}

export function generateMcpConfigSnippet(client: McpClient): string {
  const base = {
    lingo: {
      type: "http",
      url: "https://mcp.lingo.dev/account",
      headers: {
        "x-api-key": "YOUR_LINGO_API_KEY",
      },
    },
  };

  if (client === "copilot") {
    return JSON.stringify(base, null, 2);
  }

  if (client === "cursor") {
    return JSON.stringify(base, null, 2);
  }

  // claude
  return JSON.stringify(base, null, 2);
}

export function generateDeployRunbook(config: EngineConfig): string {
  const links = getLingoLinks();
  const commands = generateMCPCommands(config);

  return [
    "ENGINECLONE -> LINGO DEPLOY RUNBOOK",
    "",
    "1) Open your Lingo dashboard and create/copy an API key:",
    `   ${links.dashboard}`,
    `   ${links.apiKeys}`,
    "",
    "2) Configure MCP in your coding assistant with https://mcp.lingo.dev/account and x-api-key header.",
    `   Docs: ${links.mcpDocs}`,
    "",
    `3) In your assistant, run these ${commands.length} commands:`,
    ...commands.map((cmd, i) => `   ${i + 1}. ${cmd}`),
    "",
    "4) Verify by running a translation via API/CLI using your engineId.",
    `   ${links.connectEngine}`,
  ].join("\n");
}

/**
 * Generate natural language MCP commands the user can paste into their AI
 * coding assistant (with Lingo.dev MCP server connected) to deploy the engine.
 */
export function generateMCPCommands(config: EngineConfig): string[] {
  const commands: string[] = [];

  commands.push(
    `Create a localization engine named \"${config.companyName}-${config.sourceLocale}-to-${config.targetLocale}\" if it does not exist, then use it for all following operations.`
  );

  commands.push(
    `Set the ${config.targetLocale} brand voice to: "${config.brandVoice.text}"`
  );

  for (const item of config.glossaryItems) {
    if (item.type === "non_translatable") {
      commands.push(
        `Mark "${item.sourceText}" as non-translatable for ${item.sourceLocale} to ${item.targetLocale}.`
      );
    } else {
      commands.push(
        `Add a glossary entry: translate "${item.sourceText}" to "${item.targetText}" for ${item.sourceLocale} to ${item.targetLocale}.`
      );
    }
  }

  for (const inst of config.instructions) {
    commands.push(
      `Add an instruction for ${inst.targetLocale}: ${inst.text}`
    );
  }

  for (const scorer of config.scorers) {
    commands.push(
      `Create a ${scorer.type} scorer for ${scorer.sourceLocale} to ${scorer.targetLocale} that checks: ${scorer.instruction}`
    );
  }

  return commands;
}

export function generateExportJSON(config: EngineConfig): string {
  return JSON.stringify(config, null, 2);
}
