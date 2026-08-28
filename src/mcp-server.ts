/**
 * Shared MCP server factory for Liongard.
 *
 * This module is **side-effect free** (importing it never starts a transport),
 * so it can be reused by every entrypoint:
 * - `index.ts` — stdio + Node HTTP transport
 * - `worker.ts` — Cloudflare Workers (Web Standard) transport
 *
 * All Liongard tools are exposed upfront (flat architecture) for universal MCP
 * client compatibility.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Domain imports
import {
  environmentTools,
  handleEnvironmentTool,
} from "./domains/environments.js";
import { agentTools, handleAgentTool } from "./domains/agents.js";
import {
  inspectionTools,
  handleInspectionTool,
} from "./domains/inspections.js";
import { systemTools, handleSystemTool } from "./domains/systems.js";
import { detectionTools, handleDetectionTool } from "./domains/detections.js";
import { metricTools, handleMetricTool } from "./domains/metrics.js";
import { timelineTools, handleTimelineTool } from "./domains/timeline.js";
import { inventoryTools, handleInventoryTool } from "./domains/inventory.js";
import { type LiongardCredentials } from "./utils/client.js";
import { registerResourceHandlers } from "./resources.js";

export type { LiongardCredentials };

// Server version. Kept as a literal (rather than reading package.json via
// createRequire(import.meta.url)) so this module loads identically under
// Node and the Cloudflare Workers runtime, where import.meta.url is undefined.
const SERVER_VERSION = "2.0.4";

/**
 * Available domains for navigation
 */
type Domain =
  | "environments"
  | "agents"
  | "inspections"
  | "systems"
  | "detections"
  | "metrics"
  | "timeline"
  | "inventory";

/**
 * Domain metadata for navigation
 */
const domainDescriptions: Record<Domain, string> = {
  environments:
    "Environment/company management - list, get, create environments, count, and view related entities",
  agents:
    "Agent management - list agents, bulk delete, and generate installers for on-premise data collection",
  inspections:
    "Inspection management - list inspectors and launchpoints, create launchpoints, and trigger inspection runs",
  systems:
    "System management - list and get infrastructure components discovered through inspections",
  detections:
    "Detection monitoring - list configuration changes and anomalies identified by inspections",
  metrics:
    "Metrics evaluation - list metrics, evaluate across systems, and evaluate per system",
  timeline:
    "Timeline view - chronological list of inspection events and configuration changes",
  inventory:
    "Asset inventory - manage identities (users/accounts) and device profiles discovered through inspections",
};

/**
 * Map from domain name to its tool definitions
 */
const domainToolMap: Record<Domain, Tool[]> = {
  environments: environmentTools,
  agents: agentTools,
  inspections: inspectionTools,
  systems: systemTools,
  detections: detectionTools,
  metrics: metricTools,
  timeline: timelineTools,
  inventory: inventoryTools,
};

/**
 * All domain tools, collected once at module load.
 */
const allDomainTools: Tool[] = Object.values(domainToolMap).flat();

/**
 * Navigation / discovery tool - helps the LLM find the right tools
 *
 * This is a stateless helper that describes available tools for a domain.
 * All domain tools are always listed in tools/list regardless of navigation
 * state, because many MCP clients (claude.ai connectors, mcp-remote) only
 * fetch the tool list once and do not support notifications/tools/list_changed.
 */
const navigateTool: Tool = {
  name: "liongard_navigate",
  description:
    "Discover available Liongard tools by domain. Returns tool names and descriptions for the selected domain. All tools are callable at any time — this is a help/discovery aid, not a prerequisite.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: [
          "environments",
          "agents",
          "inspections",
          "systems",
          "detections",
          "metrics",
          "timeline",
          "inventory",
        ],
        description: `The domain to explore:
- environments: ${domainDescriptions.environments}
- agents: ${domainDescriptions.agents}
- inspections: ${domainDescriptions.inspections}
- systems: ${domainDescriptions.systems}
- detections: ${domainDescriptions.detections}
- metrics: ${domainDescriptions.metrics}
- timeline: ${domainDescriptions.timeline}
- inventory: ${domainDescriptions.inventory}`,
      },
    },
    required: ["domain"],
  },
};

/**
 * Build a validated LiongardCredentials object from raw values.
 * Returns `{ creds }` on success or `{ error }` when api key/instance are missing.
 * Shared by every transport (Node HTTP headers, Workers headers, Workers env).
 */
export function buildCredentials(
  apiKey: string | undefined,
  instance: string | undefined
): { creds?: LiongardCredentials; error?: string } {
  if (!apiKey || !instance) {
    return {
      error:
        "Missing credentials: X-Liongard-API-Key / X-Liongard-Instance (or LIONGARD_API_KEY / LIONGARD_INSTANCE)",
    };
  }
  return { creds: { apiKey, instance } };
}

/**
 * Resolve per-request gateway credentials from a header accessor.
 *
 * Works with any transport: pass a getter that returns a (lowercased) header
 * value. Returns `{ creds }` on success, or `{ error }` when required headers
 * are missing.
 */
export function resolveGatewayCredentials(
  getHeader: (lowerName: string) => string | undefined
): { creds?: LiongardCredentials; error?: string } {
  return buildCredentials(
    getHeader("x-liongard-api-key"),
    getHeader("x-liongard-instance")
  );
}

/**
 * Create a new MCP Server instance with all tool handlers registered.
 * Called once for stdio, or per-request for HTTP / Workers transports.
 *
 * @param credentialOverrides - Optional credentials for gateway mode.
 *   When provided, a per-request client is created from these credentials
 *   instead of reading from process.env.
 */
export function createMcpServer(
  credentialOverrides?: LiongardCredentials
): Server {
  const server = new Server(
    {
      name: "liongard-mcp",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // MCP Apps (SEP-1865): serve the ui:// detection card via
  // resources/list + resources/read.
  registerResourceHandlers(server);

  /**
   * Handle ListTools requests - always returns ALL tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: [navigateTool, ...allDomainTools] };
  });

  /**
   * Handle CallTool requests
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Handle navigation / discovery helper
      if (name === "liongard_navigate") {
        const { domain } = args as { domain: Domain };
        const tools = domainToolMap[domain];

        if (!tools) {
          return {
            content: [
              {
                type: "text",
                text: `Unknown domain: ${domain}. Valid domains: ${Object.keys(domainToolMap).join(", ")}`,
              },
            ],
            isError: true,
          };
        }

        const toolSummary = tools
          .map((t) => `- ${t.name}: ${t.description}`)
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `${domainDescriptions[domain]}\n\nAvailable tools:\n${toolSummary}\n\nYou can call any of these tools directly.`,
            },
          ],
        };
      }

      // Route to appropriate domain handler
      const toolArgs = (args ?? {}) as Record<string, unknown>;

      if (name.startsWith("liongard_environments_")) {
        return await handleEnvironmentTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_agents_")) {
        return await handleAgentTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_inspections_")) {
        return await handleInspectionTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_systems_")) {
        return await handleSystemTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_detections_")) {
        return await handleDetectionTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_metrics_")) {
        return await handleMetricTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_timeline_")) {
        return await handleTimelineTool(name, toolArgs, credentialOverrides);
      }
      if (name.startsWith("liongard_inventory_")) {
        return await handleInventoryTool(name, toolArgs, credentialOverrides);
      }

      // Unknown tool
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}. Call conduit__my_access to see which tools are available to you.`,
          },
        ],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errCause = (error as { cause?: { message?: string; code?: string } })?.cause;
      const cause = errCause?.message || errCause?.code || "no cause";
      console.error(`[TOOL ERROR] ${request.params.name}: ${message} | cause: ${cause}`);
      return {
        content: [{ type: "text", text: `Error: ${message} (cause: ${cause})` }],
        isError: true,
      };
    }
  });

  return server;
}
