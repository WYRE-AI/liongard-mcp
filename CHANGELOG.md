## [Unreleased]

### Added

- **Interactive detection card via MCP Apps (SEP-1865).** `liongard_detections_get` results now render as an interactive card in MCP Apps hosts (Claude Desktop/web, and other hosts advertising the `io.modelcontextprotocol/ui` extension), instead of a wall of JSON. The card shows the detection type, severity, and status as badges, resolves the raw `SystemID` / `EnvironmentID` into system and environment names server-side, and shows detected/resolved timestamps plus the description. The card is read-only — Liongard detections have no safe single write action, so no round-trip is exposed. Non-App hosts are unaffected: the tool's JSON payload is unchanged apart from a new `_card` field.
  - The renderable tool advertises the UI via `_meta` (`ui/resourceUri`, plus the nested `ui.resourceUri` form) pointing at a new `ui://liongard/detection-card.html` resource served as `text/html;profile=mcp-app`. The card HTML is a self-contained vite single-file bundle embedded at build time (`src/generated/detection-card-html.ts`, committed), so it serves identically from stdio, Node HTTP, and the fs-less Cloudflare Workers runtime. The server now declares the `resources` capability and answers `resources/list` / `resources/read` (`src/resources.ts`).
  - The card is neutral by default (system fonts, no vendor identity, no external fetches) and brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`): at serve time the server replaces the card's BRAND_INJECT marker with an inline, `<`-escaped `window.__BRAND__` script, so self-hosters can theme the card without rebuilding. No brand configured = HTML served unchanged.
  - The card payload builder is best-effort: a failed system/environment lookup degrades to a `#id` label, and any card-building failure drops the card without affecting the tool result. New contract tests in `src/__tests__/mcp-apps.test.ts` pin the `_meta` advertisement, the `ui://` resource wire shape, the neutral-default/brand-injection behavior, and the card normalization.

### Fixed

- **The HTTP transport no longer exits on a malformed request (WYREAI-741).** The request
  target was parsed against the client-supplied `Host` header, and a value that does not parse
  (or a target such as `//`) threw inside the request listener before authentication. The
  target is now parsed against a fixed base, so `Host` is no longer consulted, and a target
  that still cannot be parsed gets a `400` JSON response while the server keeps running.

- One-click cloud deploys (Cloudflare Workers, DigitalOcean) no longer fail with
  `npm error 401 Unauthorized` from `npm.pkg.github.com`. The `.npmrc` now carries the
  GitHub Packages auth-token line (`${NODE_AUTH_TOKEN}`) and the Dockerfile writes a
  temporary authenticated `.npmrc` from the `GITHUB_TOKEN` build arg before `npm ci`,
  so operators can supply their own `read:packages` PAT as a build variable.

### Changed

- README documents creating a `read:packages` PAT and setting `NODE_AUTH_TOKEN`
  (Cloudflare) / build-time `GITHUB_TOKEN` (DigitalOcean) before deploying or installing.

## [2.0.4](https://github.com/wyre-technology/liongard-mcp/compare/v2.0.3...v2.0.4) (2026-04-07)


### Bug Fixes

* **timeline:** align liongard_timeline_list with node-liongard 3.0.2 (GET /api/v1/timeline) ([b6e5a96](https://github.com/wyre-technology/liongard-mcp/commit/b6e5a968f3fa696fc3e6d0c8d48c205be44114cc))

## [2.0.3](https://github.com/wyre-technology/liongard-mcp/compare/v2.0.2...v2.0.3) (2026-04-07)


### Bug Fixes

* **detections:** align liongard_detections_list with node-liongard 3.0.1 (POST /api/v2/detections) ([a70f00b](https://github.com/wyre-technology/liongard-mcp/commit/a70f00b96d0f8480878199867d4deb5acf1c630e))

## [2.0.2](https://github.com/wyre-technology/liongard-mcp/compare/v2.0.1...v2.0.2) (2026-04-07)


### Bug Fixes

* **inventory:** require environment param, bump node-liongard to v3.0.0 ([1a176fb](https://github.com/wyre-technology/liongard-mcp/commit/1a176fb1228ee9aeaae8291579e136ff1682e412))

## [2.0.1](https://github.com/wyre-technology/liongard-mcp/compare/v2.0.0...v2.0.1) (2026-04-07)


### Bug Fixes

* **deps:** bump node-liongard to 2.0.1 and harden timeline/detections handlers ([e6a1c1e](https://github.com/wyre-technology/liongard-mcp/commit/e6a1c1e1e549d63856aedfed32caf0f08898a3bd))

# [2.0.0](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.13...v2.0.0) (2026-04-07)


### Features

* **deps:** bump node-liongard to v2, remove alerts tools (webhook-only) ([9370eba](https://github.com/wyre-technology/liongard-mcp/commit/9370eba557585630e365136c0cdd3d167d9b8d47))


### BREAKING CHANGES

* **deps:** liongard_alerts_* tools removed. Liongard alerts are
delivered via webhooks only — there is no REST endpoint for alerts in
the public Liongard API. Subscribe to the alerts.created / alerts.updated
webhook events instead.

- Bump @wyre-technology/node-liongard from ^1.0.2 to ^2.0.0
- Remove src/domains/alerts.ts and the alerts domain wiring in index.ts
- liongard_agents_delete now takes a single { id } (was { agentIds: [] })
  to match the new SDK signature backed by DELETE /api/v1/agents/{id}
- liongard_agents_installer removed — endpoint not in public API
- liongard_detections_list now accepts { conditions[], fields[] } and
  calls GET /api/v1/detections (was POST /api/v2/detections)
- New liongard_detections_get tool for GET /api/v1/detections/{id}

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

## [1.1.13](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.12...v1.1.13) (2026-04-07)


### Bug Fixes

* update node-liongard SDK to v1.0.2 with double-read body fix ([38d370e](https://github.com/wyre-technology/liongard-mcp/commit/38d370ed009581253c9a7eb83da2d877eab212d1))

## [1.1.12](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.11...v1.1.12) (2026-04-06)


### Bug Fixes

* remove async diag endpoint that broke TypeScript build ([a04ea51](https://github.com/wyre-technology/liongard-mcp/commit/a04ea5199aa07133cee9c2356c91318727b9cb57))

## [1.1.11](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.10...v1.1.11) (2026-04-06)


### Bug Fixes

* update node-liongard SDK to 1.0.1 (trailing slash fix for API redirects) ([6279b27](https://github.com/wyre-technology/liongard-mcp/commit/6279b27e78f1ec8ca3b059e8d88388e5ba65afcb))

## [1.1.10](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.9...v1.1.10) (2026-04-06)


### Bug Fixes

* per-request MCP Server+Transport to support gateway tool-cache ([dde56a7](https://github.com/wyre-technology/liongard-mcp/commit/dde56a7bb7bfa7d4563c1f9c039bd1e9d797d543))

## [1.1.9](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.8...v1.1.9) (2026-04-06)


### Bug Fixes

* use stateless MCP transport (no session IDs) ([46174a9](https://github.com/wyre-technology/liongard-mcp/commit/46174a9b6e8e6dfd0a9f71418023676027c99e8a))

## [1.1.8](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.7...v1.1.8) (2026-04-06)


### Bug Fixes

* **ci:** resolve MCPB bundle path mismatch in release workflow ([babb7c9](https://github.com/wyre-technology/liongard-mcp/commit/babb7c9a6dfb8fad2d95837e0e44859020697b28))

## [1.1.7](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.6...v1.1.7) (2026-04-06)


### Bug Fixes

* allow unauthenticated tools/list in gateway mode ([c3eabdd](https://github.com/wyre-technology/liongard-mcp/commit/c3eabdd3aaf1a8f767d396730c53903c30f146cc))

## [1.1.6](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.5...v1.1.6) (2026-03-26)


### Bug Fixes

* **tools:** list all domain tools upfront, remove lazy loading for remote MCP compatibility ([1b8b8c1](https://github.com/wyre-technology/liongard-mcp/commit/1b8b8c10b6a81fbc449c439dea4ea09327f3bc63))

## [1.1.5](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.4...v1.1.5) (2026-03-26)


### Bug Fixes

* emit tools/list_changed notification after navigate ([2dfaf38](https://github.com/wyre-technology/liongard-mcp/commit/2dfaf38133660e5ce13e75e0432b00513f20daec)), closes [#1](https://github.com/wyre-technology/liongard-mcp/issues/1)

## [1.1.4](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.3...v1.1.4) (2026-03-02)


### Bug Fixes

* **ci:** fix broken YAML in Discord notification step ([cb9ad1e](https://github.com/wyre-technology/liongard-mcp/commit/cb9ad1e68d438f4e478b011bd413d5f407defb9d))
* **ci:** move Discord notification into release workflow ([aa51620](https://github.com/wyre-technology/liongard-mcp/commit/aa51620a6ddf2a1e09390498a11c6e3b0800c1f4))

## [1.1.3](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.2...v1.1.3) (2026-02-26)


### Bug Fixes

* correct Docker tag step reference from release-version to version ([340870e](https://github.com/wyre-technology/liongard-mcp/commit/340870e6865b5055ec3da02343043d293017c33e))
* rename pack-mcpb.js to .cjs to fix ESM require() error ([eed5713](https://github.com/wyre-technology/liongard-mcp/commit/eed571344ac9e3f096e721a8a50a4739c34e548a))

## [1.1.2](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.1...v1.1.2) (2026-02-23)


### Bug Fixes

* quote MCPB bundle filename to prevent shell glob expansion failure ([dcb81ba](https://github.com/wyre-technology/liongard-mcp/commit/dcb81ba1d2aa2001699d82a1dbe7c83f30f03f54))
* rename duplicate step id 'version' to 'release-version' in docker job ([4c60af3](https://github.com/wyre-technology/liongard-mcp/commit/4c60af31795a1177f8e9d6ac34d977087f2173d4))

## [1.1.1](https://github.com/wyre-technology/liongard-mcp/compare/v1.1.0...v1.1.1) (2026-02-18)


### Bug Fixes

* **ci:** fix release workflow failures ([08506f1](https://github.com/wyre-technology/liongard-mcp/commit/08506f1ee96e27f8f9ff487a947770d3498f1dbe))

# [1.1.0](https://github.com/wyre-technology/liongard-mcp/compare/v1.0.1...v1.1.0) (2026-02-17)


### Features

* add MCPB bundle to release workflow ([e1d8d4c](https://github.com/wyre-technology/liongard-mcp/commit/e1d8d4cc3daefd876963272e2f7c4020f55db2ec))
* add MCPB manifest for desktop installation ([f686998](https://github.com/wyre-technology/liongard-mcp/commit/f68699831215cde89344a96f4640235efcd49498))
* add MCPB pack script ([562f1d8](https://github.com/wyre-technology/liongard-mcp/commit/562f1d8fdba3f8149cb985bd9e8894006a47cfee))
* add pack:mcpb script ([8f58c22](https://github.com/wyre-technology/liongard-mcp/commit/8f58c229b3ec790300edf6f1825e168324ff0a77))

## [1.0.1](https://github.com/wyre-technology/liongard-mcp/compare/v1.0.0...v1.0.1) (2026-02-17)


### Bug Fixes

* **docker:** drop arm64 platform to fix QEMU build failures ([48d0d91](https://github.com/wyre-technology/liongard-mcp/commit/48d0d91abaaba5c3975d4a065668e17919115a77))

# 1.0.0 (2026-02-16)


### Bug Fixes

* **ci:** add GitHub Packages auth token to Docker builds ([5a5bf80](https://github.com/wyre-technology/liongard-mcp/commit/5a5bf80c0f7d64bdfca72e2d44fa37a0bbcdac8d))
* **ci:** add missing semantic-release plugin dependencies ([21cec64](https://github.com/wyre-technology/liongard-mcp/commit/21cec6457d84cabd3402d52c76ab881bd0056582))
* **ci:** use Node 22 for semantic-release (requires ^22.14.0) ([9857ab9](https://github.com/wyre-technology/liongard-mcp/commit/9857ab9b60086d3b72cf7fc0335aa81e3a6ed128))


### Features

* initial liongard-mcp server with decision-tree architecture ([5fd3c02](https://github.com/wyre-technology/liongard-mcp/commit/5fd3c02f9fc77985b0b7212880ba619a8840f1f9))
