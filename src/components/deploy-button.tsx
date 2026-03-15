"use client";

import { useState } from "react";
import {
  generateDeployRunbook,
  generateExportJSON,
  generateMCPCommands,
  generateMcpConfigSnippet,
  getLingoLinks,
  type McpClient,
} from "@/lib/mcp-deploy";
import type { EngineConfig } from "@/lib/types";

interface Props {
  engineConfig: EngineConfig;
}

export function DeployButton({ engineConfig }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"commands" | "json" | "snippet" | "runbook" | null>(null);
  const [client, setClient] = useState<McpClient>("copilot");
  const [apiKey, setApiKey] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<{
    ok: boolean;
    report: {
      success: boolean;
      engineId: string | null;
      summary: string;
      notes: string[];
    };
    model: string;
    requestId?: string;
    mcpCalls: Array<{
      name: string;
      success: boolean;
      error: string | null;
      output: string | null;
    }>;
  } | null>(null);

  const links = getLingoLinks();

  function handleCopyCommands() {
    const commands = generateMCPCommands(engineConfig);
    const text = commands.join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied("commands");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleCopySnippet() {
    navigator.clipboard.writeText(generateMcpConfigSnippet(client)).then(() => {
      setCopied("snippet");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleCopyRunbook() {
    navigator.clipboard.writeText(generateDeployRunbook(engineConfig)).then(() => {
      setCopied("runbook");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleCopyJSON() {
    const json = generateExportJSON(engineConfig);
    navigator.clipboard.writeText(json).then(() => {
      setCopied("json");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function handleAutoDeploy() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setDeployError("Please enter your Lingo API key.");
      return;
    }

    setDeploying(true);
    setDeployError(null);
    setDeployResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 320000);

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          apiKey: trimmed,
          engineConfig,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        ok?: boolean;
        requestId?: string;
        report?: {
          success: boolean;
          engineId: string | null;
          summary: string;
          notes: string[];
        };
        model?: string;
        mcpCalls?: Array<{
          name: string;
          success: boolean;
          error: string | null;
          output: string | null;
        }>;
      };

      if (!response.ok || !payload.report || !payload.model || !payload.mcpCalls) {
        const err = payload.error ?? "Auto deploy failed.";
        setDeployError(
          payload.requestId ? `${err} (request: ${payload.requestId})` : err
        );
        return;
      }

      setDeployResult({
        ok: Boolean(payload.ok),
        report: payload.report,
        model: payload.model,
        requestId: payload.requestId,
        mcpCalls: payload.mcpCalls,
      });
    } catch (error) {
      setDeployError(
        error instanceof Error
          ? error.name === "AbortError"
            ? "Auto deploy timed out from the browser side. Check backend logs using the request id, then retry."
            : error.message
          : "Auto deploy failed."
      );
    } finally {
      clearTimeout(timeout);
      setDeploying(false);
    }
  }

  function handleDownloadJSON() {
    const json = generateExportJSON(engineConfig);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${engineConfig.companyName}-engine-config.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex gap-3">
        <button
          onClick={() => setOpen(true)}
          className="flex-1 bg-[#e8ff47] text-[#0a0a0a] py-3 px-6 font-bold text-sm uppercase tracking-wider hover:bg-[#d4eb3c] transition-colors"
        >
          Deploy to Lingo.dev
        </button>
        <button
          onClick={handleDownloadJSON}
          className="border border-[#333] text-[#aaa] py-3 px-6 text-sm hover:border-[#555] hover:text-[#f0f0f0] transition-colors"
        >
          Download JSON
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111] border border-[#333] w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[#222]">
              <h3 className="font-bold text-lg">Deploy Engine to Lingo.dev</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-[#666] hover:text-[#f0f0f0] text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-[#0d0d0d] border border-[#222] border-l-4 border-l-[#47c8ff] p-4 space-y-3">
                <p className="text-xs font-mono text-[#666] uppercase tracking-widest">
                  Auto Deploy (Recommended)
                </p>
                <p className="text-sm text-[#ccc]">
                  Paste your Lingo API key once. EngineClone runs a tool-calling agent against
                  <span className="text-[#47c8ff] font-mono"> https://mcp.lingo.dev/account </span>
                  and applies brand voice, glossary, instructions, and scorers automatically.
                </p>

                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Lingo API key"
                    className="flex-1 bg-[#0a0a0a] border border-[#333] px-3 py-2 text-sm text-[#f0f0f0] placeholder:text-[#555]"
                  />
                  <button
                    onClick={handleAutoDeploy}
                    disabled={deploying}
                    className="px-4 py-2 text-sm font-mono bg-[#47c8ff] text-[#0a0a0a] hover:bg-[#7dd9ff] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {deploying ? "Deploying..." : "Auto Deploy"}
                  </button>
                </div>

                <p className="text-xs text-[#777]">
                  Key is used only for this deploy request and is not persisted by this app.
                </p>

                {deployError && (
                  <p className="text-sm text-[#ff8a8a]">{deployError}</p>
                )}

                {deployResult && (
                  <div className="border border-[#2a2a2a] bg-[#0a0a0a] p-3 space-y-2">
                    <p className={`text-sm ${deployResult.ok ? "text-[#7dffb0]" : "text-[#ffb17d]"}`}>
                      {deployResult.report.summary}
                    </p>
                    <p className="text-xs text-[#777]">Model: {deployResult.model}</p>
                    {deployResult.requestId && (
                      <p className="text-xs text-[#777]">Request: {deployResult.requestId}</p>
                    )}
                    {deployResult.report.engineId && (
                      <p className="text-xs text-[#9aa]">
                        Engine ID: <span className="font-mono text-[#e8ff47]">{deployResult.report.engineId}</span>
                      </p>
                    )}

                    {deployResult.report.notes.length > 0 && (
                      <div>
                        <p className="text-xs font-mono text-[#666] uppercase tracking-widest mb-1">
                          Notes
                        </p>
                        {deployResult.report.notes.map((note, i) => (
                          <p key={i} className="text-xs text-[#888]">
                            {note}
                          </p>
                        ))}
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-mono text-[#666] uppercase tracking-widest mb-1">
                        MCP Calls ({deployResult.mcpCalls.length})
                      </p>
                      {deployResult.mcpCalls.map((call, i) => (
                        <p key={i} className="text-xs text-[#888]">
                          <span className={call.success ? "text-[#7dffb0]" : "text-[#ff8a8a]"}>
                            {call.success ? "OK" : "ERR"}
                          </span>{" "}
                          {call.name}
                          {call.error ? ` - ${call.error}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-[#0d0d0d] border border-[#222] border-l-4 border-l-[#e8ff47] p-4">
                <p className="text-sm text-[#ccc]">
                  Direct OAuth-style account linking is not available in Lingo.dev docs.
                  The robust path is API-key based MCP setup, then engine configuration commands.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <a
                  href={links.dashboard}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[#333] bg-[#0a0a0a] p-3 text-sm text-[#ccc] hover:border-[#555]"
                >
                  1. Open Lingo Dashboard
                </a>
                <a
                  href={links.apiKeys}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[#333] bg-[#0a0a0a] p-3 text-sm text-[#ccc] hover:border-[#555]"
                >
                  2. Create API Key
                </a>
                <a
                  href={links.mcpDocs}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[#333] bg-[#0a0a0a] p-3 text-sm text-[#ccc] hover:border-[#555]"
                >
                  3. MCP Setup Docs
                </a>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
                    MCP Config Snippet
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={client}
                      onChange={(e) => setClient(e.target.value as McpClient)}
                      className="bg-[#0a0a0a] border border-[#333] text-[#ccc] text-xs px-2 py-1"
                    >
                      <option value="copilot">Copilot</option>
                      <option value="cursor">Cursor</option>
                      <option value="claude">Claude</option>
                    </select>
                    <button
                      onClick={handleCopySnippet}
                      className="text-xs font-mono text-[#47c8ff] hover:text-[#7dd9ff] border border-[#47c8ff30] hover:border-[#47c8ff] px-3 py-1 transition-colors"
                    >
                      {copied === "snippet" ? "Copied!" : "Copy Snippet"}
                    </button>
                  </div>
                </div>
                <pre className="bg-[#0a0a0a] border border-[#222] p-4 max-h-40 overflow-y-auto text-xs font-mono text-[#9aa]">
{generateMcpConfigSnippet(client)}
                </pre>
              </div>

              <div className="bg-[#0d0d0d] border border-[#222] p-4">
                <p className="text-xs font-mono text-[#666] uppercase tracking-widest mb-2">Runbook</p>
                <p className="text-sm text-[#aaa] mb-3">
                  Copy a full deployment runbook with links, setup, and ordered commands.
                </p>
                <button
                  onClick={handleCopyRunbook}
                  className="text-xs font-mono text-[#e8ff47] hover:text-[#d4eb3c] border border-[#e8ff4730] hover:border-[#e8ff47] px-3 py-1 transition-colors"
                >
                  {copied === "runbook" ? "Copied!" : "Copy Runbook"}
                </button>
              </div>

              <div className="bg-[#0d0d0d] border border-[#222] border-l-4 border-l-[#e8ff47] p-4">
                <p className="text-sm text-[#ccc]">
                  Then copy these engine commands into your AI coding assistant (Cursor, Copilot, Claude) with the{" "}
                  <span className="text-[#e8ff47] font-mono">
                    mcp.lingo.dev
                  </span>{" "}
                  server connected to configure your Lingo.dev engine.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
                    MCP Commands ({generateMCPCommands(engineConfig).length}{" "}
                    commands)
                  </span>
                  <button
                    onClick={handleCopyCommands}
                    className="text-xs font-mono text-[#e8ff47] hover:text-[#d4eb3c] border border-[#e8ff4730] hover:border-[#e8ff47] px-3 py-1 transition-colors"
                  >
                    {copied === "commands" ? "Copied!" : "Copy All"}
                  </button>
                </div>
                <div className="bg-[#0a0a0a] border border-[#222] p-4 max-h-60 overflow-y-auto">
                  {generateMCPCommands(engineConfig).map((cmd, i) => (
                    <p key={i} className="text-xs font-mono text-[#888] mb-2">
                      <span className="text-[#444] mr-2">{i + 1}.</span>
                      {cmd}
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
                    Or Copy Engine JSON
                  </span>
                  <button
                    onClick={handleCopyJSON}
                    className="text-xs font-mono text-[#47c8ff] hover:text-[#7dd9ff] border border-[#47c8ff30] hover:border-[#47c8ff] px-3 py-1 transition-colors"
                  >
                    {copied === "json" ? "Copied!" : "Copy JSON"}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <a
                  href={links.connectEngine}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 text-sm border border-[#333] text-[#aaa] hover:border-[#555] hover:text-[#f0f0f0] transition-colors"
                >
                  Connect Engine Guide
                </a>
                <button
                  onClick={handleDownloadJSON}
                  className="flex-1 border border-[#333] py-2 text-sm text-[#aaa] hover:border-[#555] hover:text-[#f0f0f0] transition-colors"
                >
                  Download JSON File
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-6 py-2 text-sm text-[#666] hover:text-[#aaa]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
