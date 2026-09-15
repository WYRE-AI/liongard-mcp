/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the detection card:
 *   1. the renderable tool advertises the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. liongard_detections_get results carry the normalized `_card` payload
 *      the iframe renders from, with system/environment ids resolved to labels
 *
 * Wire-level checks drive the Cloudflare Worker fetch handler (the same
 * Server + transport as production); buildDetectionCard is unit-tested
 * directly.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import worker, { type Env } from "../worker.js";
import {
  applyBrandInjection,
  buildDetectionCard,
  DETECTION_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from "../card.builder.js";
import { listResources, readResource } from "../resources.js";
import { DETECTION_CARD_HTML } from "../generated/detection-card-html.js";

const mockDetectionsGet = vi.fn();
const mockSystemsGet = vi.fn();
const mockEnvironmentsGet = vi.fn();

vi.mock("@wyre-technology/node-liongard", () => ({
  LiongardClient: class {
    detections = { get: mockDetectionsGet, list: vi.fn() };
    systems = { get: mockSystemsGet };
    environments = { get: mockEnvironmentsGet };
  },
}));

const MCP_HEADERS = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};

const ENV_CREDS: Env = { LIONGARD_API_KEY: "key", LIONGARD_INSTANCE: "acme" };

async function mcp(body: unknown, env: Env = {}): Promise<Response> {
  return worker.fetch(
    new Request("http://worker.local/mcp", {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(body),
    }),
    env
  );
}

const RENDERABLE_TOOLS = ["liongard_detections_get"];

const openDetection = {
  ID: 9182,
  Type: "Configuration Change",
  Severity: "High",
  SystemID: 42,
  EnvironmentID: 7,
  Description: "Domain admin group membership changed: added user svc-backup",
  DetectedOn: "2026-07-16T08:30:00.000Z",
  ResolvedOn: null,
  Status: "Open",
};

/** Direct client mock for buildDetectionCard unit tests. */
function directClient(overrides: Partial<Record<"systems" | "environments", unknown>> = {}) {
  return {
    systems: { get: vi.fn(async () => ({ ID: 42, Name: "AD-DC01" })) },
    environments: { get: vi.fn(async () => ({ ID: 7, Name: "Acme Corp" })) },
    ...overrides,
  } as never;
}

describe("MCP Apps detection card", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("tool _meta advertisement", () => {
    it.each(RENDERABLE_TOOLS)("%s links the card via _meta", async (name) => {
      const res = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result?: { tools?: { name: string; _meta?: Record<string, unknown> }[] };
      };
      const tool = body.result?.tools?.find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.["ui/resourceUri"]).toBe(DETECTION_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        DETECTION_CARD_RESOURCE_URI
      );
    });

    it("no other tools carry UI metadata", async () => {
      const res = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const body = (await res.json()) as {
        result?: { tools?: { name: string; _meta?: Record<string, unknown> }[] };
      };
      const others = (body.result?.tools ?? []).filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe("ui:// resource", () => {
    it("is listed with the MCP Apps MIME type", async () => {
      const res = await mcp({ jsonrpc: "2.0", id: 3, method: "resources/list", params: {} });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result?: { resources?: { uri: string; mimeType?: string }[] };
      };
      const card = body.result?.resources?.find(
        (r) => r.uri === DETECTION_CARD_RESOURCE_URI
      );
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it("reads back as profile=mcp-app HTML containing the card app", async () => {
      const res = await mcp({
        jsonrpc: "2.0",
        id: 4,
        method: "resources/read",
        params: { uri: DETECTION_CARD_RESOURCE_URI },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result?: { contents?: { uri: string; mimeType?: string; text?: string }[] };
      };
      const content = body.result?.contents?.[0];
      expect(content?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content?.text).toBe(DETECTION_CARD_HTML);
      expect(content?.text).toContain("card__bar");
      // The serve-time injection marker survives the vite build, exactly once.
      expect(content?.text?.match(/BRAND_INJECT/g)).toHaveLength(1);
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content?.text).not.toContain('src="./detection-card.ts"');
    });

    it("serves neutral defaults with no vendor identity or external fetches", () => {
      const { text } = readResource(DETECTION_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain("00c9db"); // WYRE cyan
      expect(text).not.toContain("ede947"); // WYRE yellow
      expect(text).not.toContain("fonts.googleapis.com"); // no external fetches
      expect(text).toContain("--brand-primary: #2563eb");
      expect(text).toContain("--brand-accent: #e5e7eb");
    });

    it("injects MCP_BRAND_* env branding at serve time", async () => {
      vi.stubEnv("MCP_BRAND_NAME", "Acme MSP");
      vi.stubEnv("MCP_BRAND_PRIMARY_COLOR", "#ff0000");
      const res = await mcp({
        jsonrpc: "2.0",
        id: 5,
        method: "resources/read",
        params: { uri: DETECTION_CARD_RESOURCE_URI },
      });
      const body = (await res.json()) as {
        result?: { contents?: { text?: string }[] };
      };
      const text = body.result?.contents?.[0]?.text ?? "";
      expect(text).toContain(
        '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
      );
      expect(text).not.toContain("BRAND_INJECT");
    });

    it("rejects unknown resource URIs", async () => {
      const res = await mcp({
        jsonrpc: "2.0",
        id: 6,
        method: "resources/read",
        params: { uri: "ui://liongard/nope.html" },
      });
      const body = (await res.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/Unknown resource/);
    });

    it("lists exactly one resource", () => {
      expect(listResources()).toHaveLength(1);
      expect(listResources()[0].uri).toBe(DETECTION_CARD_RESOURCE_URI);
    });
  });

  describe("liongard_detections_get result", () => {
    it("carries the normalized _card payload alongside the raw detection", async () => {
      mockDetectionsGet.mockResolvedValue(openDetection);
      mockSystemsGet.mockResolvedValue({ ID: 42, Name: "AD-DC01" });
      mockEnvironmentsGet.mockResolvedValue({ ID: 7, Name: "Acme Corp" });
      const res = await mcp(
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "liongard_detections_get", arguments: { id: openDetection.ID } },
        },
        ENV_CREDS
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        result?: {
          isError?: boolean;
          content?: { text?: string }[];
          structuredContent?: Record<string, unknown>;
        };
      };
      expect(body.result?.isError).toBeFalsy();
      // SEP-1865: content is now a short text summary; the full detection
      // (including _card) lives in structuredContent.
      expect(body.result?.content?.[0]?.text).toBe(
        'Retrieved detection "Configuration Change".'
      );
      const payload = body.result?.structuredContent ?? {};
      // Model-visible payload unchanged apart from _card.
      expect(payload.ID).toBe(openDetection.ID);
      expect(payload.SystemID).toBe(openDetection.SystemID);
      expect(payload.Description).toBe(openDetection.Description);
      expect(payload._card).toEqual({
        id: 9182,
        title: "Configuration Change",
        severity: "High",
        status: "Open",
        description: openDetection.Description,
        system: "AD-DC01",
        environment: "Acme Corp",
        detectedOn: "2026-07-16T08:30:00.000Z",
      });
    });

    it("drops the card (not the result) when the payload is not card-shaped", async () => {
      mockDetectionsGet.mockResolvedValue({ ID: 1 }); // no Type → no card
      const res = await mcp(
        {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "liongard_detections_get", arguments: { id: 1 } },
        },
        ENV_CREDS
      );
      const body = (await res.json()) as {
        result?: {
          isError?: boolean;
          content?: { text?: string }[];
          structuredContent?: Record<string, unknown>;
        };
      };
      expect(body.result?.isError).toBeFalsy();
      const payload = body.result?.structuredContent ?? {};
      expect(payload.ID).toBe(1);
      expect(payload._card).toBeUndefined();
    });
  });

  describe("applyBrandInjection", () => {
    it("replaces the marker with an inline window.__BRAND__ script", () => {
      const out = applyBrandInjection(DETECTION_CARD_HTML, {
        name: "Acme MSP",
        primaryColor: "#ff0000",
      });
      expect(out).not.toContain("BRAND_INJECT");
      expect(out).toContain(
        'window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}'
      );
    });

    it("escapes < so brand values cannot break out of the script tag", () => {
      const out = applyBrandInjection(DETECTION_CARD_HTML, {
        name: "</script><script>alert(1)",
      });
      expect(out).not.toContain("</script><script>alert(1)");
      expect(out).toContain("\\u003c/script>\\u003cscript>alert(1)");
    });

    it("returns the HTML byte-identical for an empty brand", () => {
      expect(applyBrandInjection(DETECTION_CARD_HTML, {})).toBe(DETECTION_CARD_HTML);
      expect(applyBrandInjection(DETECTION_CARD_HTML, { name: "" })).toBe(
        DETECTION_CARD_HTML
      );
    });
  });

  describe("buildDetectionCard", () => {
    it("resolves SystemID / EnvironmentID into display labels", async () => {
      const card = await buildDetectionCard(openDetection, directClient());
      expect(card?.system).toBe("AD-DC01");
      expect(card?.environment).toBe("Acme Corp");
    });

    it("falls back to #id labels when lookups fail (best-effort)", async () => {
      const failing = directClient({
        systems: { get: vi.fn(async () => Promise.reject(new Error("Liongard 500"))) },
        environments: { get: vi.fn(async () => Promise.reject(new Error("Liongard 500"))) },
      });
      const card = await buildDetectionCard(openDetection, failing);
      expect(card?.system).toBe("#42");
      expect(card?.environment).toBe("#7");
      // The rest of the card still renders.
      expect(card?.title).toBe("Configuration Change");
      expect(card?.severity).toBe("High");
    });

    it("includes resolvedOn for resolved detections", async () => {
      const card = await buildDetectionCard(
        { ...openDetection, Status: "Resolved", ResolvedOn: "2026-07-17T10:00:00.000Z" },
        directClient()
      );
      expect(card?.status).toBe("Resolved");
      expect(card?.resolvedOn).toBe("2026-07-17T10:00:00.000Z");
    });

    it("truncates long descriptions", async () => {
      const card = await buildDetectionCard(
        { ...openDetection, Description: "x".repeat(2000) },
        directClient()
      );
      expect(card?.description).toHaveLength(500);
    });

    it("omits labels for absent ids", async () => {
      const card = await buildDetectionCard(
        { ID: 1, Type: "Anomaly" },
        directClient()
      );
      expect(card).toEqual({ id: 1, title: "Anomaly" });
    });

    it("returns null for payloads that are not a detection", async () => {
      expect(await buildDetectionCard(undefined, directClient())).toBeNull();
      expect(await buildDetectionCard({}, directClient())).toBeNull();
      expect(await buildDetectionCard({ ID: 1 }, directClient())).toBeNull();
      expect(await buildDetectionCard({ Type: "no id" }, directClient())).toBeNull();
    });
  });
});
