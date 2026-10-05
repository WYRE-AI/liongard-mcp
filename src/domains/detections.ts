/**
 * Detections domain tools for Liongard MCP Server
 *
 * Detections are configuration changes and anomalies identified
 * by Liongard's inspection analysis engine.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getClient, type LiongardCredentials } from "../utils/client.js";
import {
  buildDetectionCard,
  DETECTION_CARD_META,
  type DetectionCard,
} from "../card.builder.js";

/**
 * Detection domain tool definitions
 */
export const detectionTools: Tool[] = [
  {
    name: "liongard_detections_list",
    description:
      "List detections in Liongard via POST /api/v2/detections. Defaults to the last 30 days; pass startDate/endDate (ISO-8601) to override the date range. Returns a paginated envelope with `Data` and `Pagination`.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (1-indexed, default: 1)",
        },
        pageSize: {
          type: "number",
          description: "Number of items per page (default: 25)",
        },
        startDate: {
          type: "string",
          description:
            "Optional ISO-8601 start of date range. Defaults to 30 days ago if omitted.",
        },
        endDate: {
          type: "string",
          description:
            "Optional ISO-8601 end of date range. Defaults to now if omitted.",
        },
        filters: {
          type: "array",
          description:
            "Optional Liongard Filters array (e.g. by EnvironmentID, Severity).",
          items: { type: "object" },
        },
      },
    },
  },
  {
    name: "liongard_detections_get",
    description:
      "Get detailed information about a specific detection by its ID via GET /api/v1/detections/{id}.",
    _meta: DETECTION_CARD_META,
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The unique detection ID",
        },
      },
      required: ["id"],
    },
  },
];

/**
 * Handle detection domain tool calls
 */
export async function handleDetectionTool(
  name: string,
  args: Record<string, unknown>,
  credentials?: LiongardCredentials
): Promise<{
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  const client = await getClient(credentials);

  switch (name) {
    case "liongard_detections_list": {
      const params = args as {
        page?: number;
        pageSize?: number;
        startDate?: string;
        endDate?: string;
        filters?: Array<Record<string, unknown>>;
      };
      try {
        const response = await client.detections.list({
          page: params.page,
          pageSize: params.pageSize,
          startDate: params.startDate,
          endDate: params.endDate,
          filters: params.filters,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error listing detections: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "liongard_detections_get": {
      const { id } = args as { id: number };
      try {
        const detection = await client.detections.get(id);
        // MCP Apps: attach the normalized payload the ui:// detection card
        // renders from. Best-effort — a null card just means no UI surface.
        let card: DetectionCard | null = null;
        try {
          card = await buildDetectionCard(detection, client);
        } catch {
          /* card building never fails the tool result */
        }
        const payload = card ? { ...detection, _card: card } : detection;
        // SEP-1865: content/structuredContent separation — a short text
        // summary goes in `content`, the full detection (including _card)
        // moves to `structuredContent`. No fields are dropped, only relocated.
        const title = card?.title ?? `detection ${id}`;
        return {
          content: [{ type: "text", text: `Retrieved detection "${title}".` }],
          structuredContent: payload as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error getting detection ${id}: ${message}` }],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [
          { type: "text", text: `Unknown detection tool: ${name}` },
        ],
        isError: true,
      };
  }
}
