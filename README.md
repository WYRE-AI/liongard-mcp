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

Set the following environment variables:

| Variable | Description |
|----------|-------------|
| `LIONGARD_URL` | Your Liongard instance URL |
| `LIONGARD_ACCESS_KEY` | API access key |
| `LIONGARD_ACCESS_SECRET` | API access secret |

## Usage

```bash
npm start
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
