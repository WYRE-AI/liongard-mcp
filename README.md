# Liongard MCP Server

An MCP (Model Context Protocol) server for interacting with the [Liongard](https://www.liongard.com/) platform. Provides AI assistants with tools to manage inspectors, systems, metrics, alerts, users, and more through Liongard's API.

## One-Click Deployment

> [!IMPORTANT]
> **Before you click:** this server depends on `@wyre-technology/node-liongard`,
> which is hosted on the **GitHub Packages** npm registry. GitHub Packages has no
> anonymous access — even though the package is public, every `npm install` needs a
> token. The cloud builder runs `npm install` for you, so you must give it one, or
> the build fails with `npm error 401 Unauthorized ... npm.pkg.github.com`.
>
> 1. Create a GitHub **Personal Access Token** with the `read:packages` scope
>    ([classic token](https://github.com/settings/tokens/new?scopes=read:packages&description=liongard-mcp%20deploy)).
>    Any GitHub account works — you do **not** need to be a member of the
>    `wyre-technology` org to read its public packages.
> 2. Add it as a build variable when prompted by the deploy flow:
>    - **Cloudflare Workers** → set a build variable named **`NODE_AUTH_TOKEN`** to your PAT
>      (Workers → Settings → Build → Variables and Secrets).
>    - **DigitalOcean App Platform** → set an encrypted env var named **`GITHUB_TOKEN`**
>      with scope **Build Time** to your PAT (the Dockerfile reads it for the install).

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/WYRE-AI/liongard-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/WYRE-AI/liongard-mcp)

## Features

- Decision-tree tool architecture — starts with a navigation tool, then exposes domain-specific tools on demand
- 25 tools across inspectors, systems, metrics, alerts, users, groups, environments, and integrations
- Interactive detection card via MCP Apps (SEP-1865): `liongard_detections_get` renders as a read-only card in MCP Apps hosts (Claude Desktop/web) with severity/status badges and server-resolved system/environment names — neutral by default, brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`), no rebuild needed
- Dual API version support (v1 and v2)
- 128 tests

## Installation

This project depends on `@wyre-technology/node-liongard`, published to the
**GitHub Packages** npm registry, which requires a token even for public packages.
Authenticate once, then install:

```bash
# Authenticate npm to GitHub Packages (token needs the read:packages scope)
export NODE_AUTH_TOKEN=$(gh auth token)   # or a PAT with read:packages

npm install
```

The repo's `.npmrc` already points the `@wyre-technology` scope at GitHub Packages and
reads the token from `NODE_AUTH_TOKEN`, so no further config is needed.

## Configuration

Copy [`.env.example`](.env.example). Stdio and `AUTH_MODE=env` read the Liongard variables. Gateway mode does not.

| Variable | Required | Description |
|----------|----------|-------------|
| `LIONGARD_API_KEY` | For stdio and `AUTH_MODE=env` | Liongard API key |
| `LIONGARD_INSTANCE` | For stdio and `AUTH_MODE=env` | Liongard instance hostname (for example `yourorg.app.liongard.com`) |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `AUTH_MODE` | No | `env` (default) or `gateway`. Gateway mode requires `X-Liongard-API-Key` and `X-Liongard-Instance` on each `/mcp` request and never falls back to `LIONGARD_*`. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder. Compose will not start without it. Never commit a real value. Generate one with `openssl rand -hex 32`. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` refuses startup. A known placeholder secret is still refused. |
| `MCP_HTTP_HOST` | No | Bind address when a real `CONDUIT_S2S_SECRET` is set. Unset keeps `0.0.0.0`, which is what the container image sets, so container deploys stay on every interface inside the container. Without a secret the dev bypass binds `127.0.0.1` instead. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |

`/health` stays unauthenticated and does not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The value is `t=<unix seconds>,v1=<hex>`, where `v1` is HMAC-SHA256 of the exact string `t=<unix seconds>` keyed by `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header returns 401. The secret is never written to logs.

```js
import { createHmac } from "node:crypto";

const t = Math.floor(Date.now() / 1000);
const v1 = createHmac("sha256", process.env.CONDUIT_S2S_SECRET)
  .update(`t=${t}`)
  .digest("hex");
const xGatewayS2s = `t=${t},v1=${v1}`;
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Liongard-API-Key` and `X-Liongard-Instance`. Those headers are the only credential source for that request. A request missing either header returns 401 and does not read `LIONGARD_API_KEY` or `LIONGARD_INSTANCE` from the environment.

### Docker Compose

The checked-in Compose service is gateway mode. It publishes `127.0.0.1:8080:8080`, requires `CONDUIT_S2S_SECRET`, and does not set `LIONGARD_API_KEY`, `LIONGARD_INSTANCE`, or `env_file`.

```bash
CONDUIT_S2S_SECRET=your-s2s-secret docker compose up --build
```

## Usage

```bash
npm start
```

HTTP refuses to start until `CONDUIT_S2S_SECRET` is a real secret:

```bash
MCP_TRANSPORT=http CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" npm start
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm start
```

## Development

```bash
npm run build       # Build the project
npm run test        # Run tests
npm run lint        # Run linter
npm run typecheck   # Type-check
```

## License

[Apache-2.0](LICENSE)
