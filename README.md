# 🔥 Cloudflare Management API

A comprehensive Cloudflare Worker that serves as a secure proxy and management layer over the Cloudflare TypeScript SDK. Features OpenAPI documentation, audit logging, MCP support, RPC endpoints, and an AI agent interface.

## ✨ Features

- **🔐 Secure Authentication**: Bearer token authentication with audit logging
- **📊 Comprehensive Audit Logging**: All requests logged to D1 database with Analytics Engine integration
- **📖 OpenAPI 3.1 Documentation**: Complete API documentation with interactive Swagger UI
- **🔌 Model Context Protocol (MCP)**: Integration with AI assistants (Claude, Cursor, Copilot, etc.)
- **🤖 AI Agent Interface**: Natural language interface for managing infrastructure
- **⚡ RPC Endpoints**: JSON-RPC 2.0 support for Worker-to-Worker service bindings
- **🔄 Workflow Automation**: High-level "easy button" flows for common tasks
- **🏗️ Full Cloudflare Coverage**: Workers, Pages, DNS, Tunnels, Access, Storage (D1, KV, R2), and more

## 🚀 Quick Start

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Cloudflare account with API token
- Node.js 18+ installed

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd core-cloudflare-management-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create D1 database**
   ```bash
   wrangler d1 create audit-logs-db
   ```

   Update `wrangler.toml` with your database ID:
   ```toml
   [[d1_databases]]
   binding = "AUDIT_LOGS_DB"
   database_name = "audit-logs-db"
   database_id = "your-database-id-here"
   ```

4. **Run migrations**
   ```bash
   npm run db:migrate
   ```

5. **Set secrets**
   ```bash
   wrangler secret put CLOUDFLARE_API_TOKEN
   # Enter your Cloudflare API token

   wrangler secret put CLOUDFLARE_ACCOUNT_ID
   # Enter your Cloudflare account ID

   wrangler secret put WORKER_API_KEY
   # Enter a secure API key for accessing this proxy API
   ```

6. **Deploy**
   ```bash
   npm run deploy
   ```

## 📚 API Documentation

Once deployed, visit:
- **Interactive Docs**: `https://your-worker.workers.dev/docs`
- **OpenAPI Spec**: `https://your-worker.workers.dev/openapi.json`
- **HTML Documentation**: Deploy `public/index.html` to Cloudflare Pages or a CDN

## 🔑 Authentication

All API requests require a Bearer token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-worker.workers.dev/api/cloudflare-sdk/workers/scripts
```

## 📖 API Endpoints

### Core SDK Routes

All Cloudflare SDK operations are available under `/api/cloudflare-sdk/`:

- **Workers**: `/api/cloudflare-sdk/workers/*`
- **Pages**: `/api/cloudflare-sdk/pages/*`
- **DNS**: `/api/cloudflare-sdk/dns/*`
- **Tunnels**: `/api/cloudflare-sdk/tunnels/*`
- **Access**: `/api/cloudflare-sdk/access/*`
- **Tokens**: `/api/cloudflare-sdk/tokens/*`
- **Zones**: `/api/cloudflare-sdk/zones/*`
- **Storage**: `/api/cloudflare-sdk/storage/*` (D1, KV, R2)

### Workflow Automation

High-level workflows available under `/api/flows/`:

#### Create Worker with GitHub CI/CD
```bash
curl -X POST https://your-worker.workers.dev/api/flows/workers/create_with_github_cicd \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workerName": "my-worker",
    "githubOwner": "myorg",
    "githubRepo": "my-repo",
    "productionBranch": "main",
    "buildCommand": "npm run build"
  }'
```

#### Setup All Bindings (Super Easy Button!)
```bash
curl -X POST https://your-worker.workers.dev/api/flows/advanced/setup-bindings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "my-app",
    "bindings": ["kv", "d1", "r2", "analytics_engine"]
  }'
```

This creates all bindings with consistent naming and returns a ready-to-use `wrangler.toml`!

### AI Agent

Natural language interface at `/agent`:

```bash
curl -X POST https://your-worker.workers.dev/agent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "List all my workers and create a KV namespace called sessions"
  }'
```

### Model Context Protocol (MCP)

MCP endpoint at `/mcp` for integration with AI assistants.

#### Claude Desktop Setup

Add to `~/Library/Application Support/Claude/config.json`:

```json
{
  "mcpServers": {
    "cloudflare": {
      "url": "https://your-worker.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

#### Cursor Setup

Add to Cursor settings (Settings → MCP):

```json
{
  "mcp.servers": {
    "cloudflare": {
      "url": "https://your-worker.workers.dev/mcp",
      "apiKey": "YOUR_API_KEY"
    }
  }
}
```

#### GitHub Copilot Setup

In repository settings, add to `.github/copilot-mcp.json`:

```json
{
  "servers": [{
    "name": "cloudflare",
    "url": "https://your-worker.workers.dev/mcp",
    "auth": {
      "type": "bearer",
      "token": "$CLOUDFLARE_API_KEY"
    }
  }]
}
```

### RPC Endpoints

JSON-RPC 2.0 endpoint at `/rpc/:method`:

```bash
curl -X POST https://your-worker.workers.dev/rpc/workers.list \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1}'
```

#### Service Binding Example

```toml
# wrangler.toml
[[services]]
binding = "CLOUDFLARE_API"
service = "core-cloudflare-manager-api"
```

```typescript
// Your Worker code
export default {
  async fetch(request: Request, env: Env) {
    const workers = await env.CLOUDFLARE_API.listWorkers();
    return Response.json(workers);
  }
}
```

## 🗄️ Audit Logging

All API requests are automatically logged to D1 and Analytics Engine. Query logs via:

```bash
curl -X GET "https://your-worker.workers.dev/api/audit-logs?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 🔄 Workflow Examples

### Example 1: Deploy a Complete Application Stack

```typescript
// Create all bindings for your app
const response = await fetch('https://your-worker.workers.dev/api/flows/advanced/setup-bindings', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    appName: 'todo-app',
    bindings: ['kv', 'd1', 'r2']
  })
});

const { wranglerToml } = await response.json();
// Copy wranglerToml to your project!
```

### Example 2: Setup Worker with GitHub CI/CD

```bash
curl -X POST https://your-worker.workers.dev/api/flows/workers/create_with_github_cicd \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workerName": "api-gateway",
    "githubOwner": "mycompany",
    "githubRepo": "api-gateway",
    "productionBranch": "production",
    "buildCommand": "npm run build",
    "rootDir": "/"
  }'
```

### Example 3: Using the AI Agent

```bash
curl -X POST https://your-worker.workers.dev/agent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a D1 database called users-db, a KV namespace called sessions, and an R2 bucket called uploads"
  }'
```

## 🏗️ Project Structure

```
core-cloudflare-management-api/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── types.ts                    # Shared types and schemas
│   ├── middleware/
│   │   ├── auth.ts                 # Bearer token authentication
│   │   └── auditLog.ts             # Audit logging middleware
│   └── routes/
│       ├── agent.ts                # AI agent endpoint
│       ├── sdk/
│       │   ├── index.ts            # SDK router
│       │   ├── workers.ts          # Workers management
│       │   ├── pages.ts            # Pages management
│       │   ├── dns.ts              # DNS management
│       │   ├── tunnels.ts          # Tunnels management
│       │   ├── tokens.ts           # API tokens management
│       │   ├── access.ts           # Zero Trust Access
│       │   ├── zones.ts            # Zones management
│       │   └── storage.ts          # D1, KV, R2 management
│       └── flows/
│           ├── index.ts            # Basic workflows
│           └── advanced.ts         # Advanced workflows
├── migrations/
│   └── 0001_create_audit_logs.sql  # D1 migration
├── public/
│   └── index.html                  # Documentation landing page
├── wrangler.toml                   # Worker configuration
├── package.json
├── tsconfig.json
└── README.md
```

## 🗄️ Database Architecture

This project uses **Kysely** as the sole ORM for type-safe database operations with Cloudflare D1 (SQLite).

### Schema Management

- **Current Schema**: `migrations/schema_final.sql` - Complete squashed schema for bootstrapping new databases
- **Incremental Migrations**: `migrations/0001_*.sql` through `migrations/0016_*.sql` - Historical migration files
- **Type Safety**: All database types defined in `src/db/client.ts` using Kysely's type system

### Database Tables

- **manage_tokens**: Tracks Cloudflare API tokens with permissions and status
- **sessions**: Logs every API request/session with metadata
- **actions_log**: Detailed action-by-action logs within each session
- **health_tests**: Test definitions for health monitoring
- **health_test_results**: Results from health check executions (includes legacy health_checks fields)
- **api_permissions_map**: Maps Cloudflare permissions to API endpoints
- **coach_telemetry**: AI coach inference tracking and self-tuning
- **self_healing_attempts**: AI-powered self-healing attempt records
- **self_healing_steps**: Step-by-step logs of healing processes

### Running Migrations

**For new databases** (bootstrap from scratch):
```bash
# Apply the squashed schema
wrangler d1 execute DB --file=./migrations/schema_final.sql --remote

# Or for local development
wrangler d1 execute DB --file=./migrations/schema_final.sql --local
```

**For existing databases** (incremental updates):
```bash
# Apply all pending migrations
npm run db:migrate:remote

# Or for local development
npm run db:migrate:local
```

### Database Client Usage

```typescript
import { initDb } from './db/client';
import type { Kysely } from 'kysely';
import type { Database } from './db/client';

// Initialize the database client
const db: Kysely<Database> = initDb(env);

// Type-safe queries
const tokens = await db
  .selectFrom('manage_tokens')
  .where('status', '=', 'active')
  .selectAll()
  .execute();

// Complex joins
const results = await db
  .selectFrom('health_test_results')
  .innerJoin('health_tests', 'health_tests.id', 'health_test_results.health_test_id')
  .where('health_test_results.outcome', '=', 'fail')
  .selectAll()
  .execute();
```

### Migration History

- **0016**: Merged legacy `health_checks` table into `health_test_results` with backfill
- **0015**: Added `health_test_result_id` FK to `self_healing_attempts`
- **0014**: Created `sessions` and `actions_log` tables for comprehensive logging
- **0013**: Created `manage_tokens` table for token tracking
- **0011**: Added missing fields to `health_tests` (consolidated with unit test definitions)
- **0010**: Added `verbs` column to `api_permissions_map`

## 🛠️ Development

### Cloudflare API Schemas

This project uses a [git submodule](https://git-scm.com/book/en/v2/Git-Tools-Submodules) to maintain a link to the official [Cloudflare API schemas repository](https://github.com/cloudflare/api-schemas). The schemas are located in `api-schemas-main/`.

**Initial Setup** (for new clones):
```bash
# Clone with submodules
git clone --recurse-submodules <repo-url>

# Or if already cloned, initialize submodules
git submodule update --init --recursive
```

**Update to Latest Schemas**:
```bash
# Update to latest version from Cloudflare's repository
# This automatically backs up the previous version with a date stamp
npm run update:schemas

# Or manually:
git submodule update --remote api-schemas-main
git add api-schemas-main api-schemas-backups
git commit -m "chore: Update Cloudflare API schemas"
```

**Version Backups**:
When updating schemas, the previous version is automatically backed up to `api-schemas-backups/` with a timestamp:
- Format: `api-schemas-backups/api-schemas-YYYY-MM-DD_HH-MM-SS/`
- Each backup includes a `.backup-metadata.txt` file with commit information
- This allows you to reference or restore previous schema versions if needed

**Using the Schemas**:
The OpenAPI schemas are available at:
- `api-schemas-main/openapi.json` - Full OpenAPI 3.1 specification (current version)
- `api-schemas-main/openapi.yaml` - YAML format (current version)
- `api-schemas-main/common.yaml` - Common schema definitions (current version)
- `api-schemas-backups/` - Historical versions with date stamps

### Local Development

```bash
npm run dev
```

Access the API at `http://localhost:8787`

### Run Migrations Locally

```bash
npm run db:migrate
```

### Type Checking

```bash
npm run type-check
```

## 📊 Analytics & Observability

The API logs detailed metrics to:

1. **D1 Database**: Full request/response audit trail
2. **Analytics Engine**: Performance metrics and observability data

Query Analytics Engine via Cloudflare's GraphQL API or dashboard.

## 🔒 Security

- **Authentication**: Bearer token required for all endpoints (except `/health`)
- **Audit Logging**: Every request logged with timestamp, IP, headers, body, and response
- **Secrets Management**: All sensitive data stored in Worker secrets
- **CORS**: Configurable CORS headers
- **Input Validation**: Zod schemas for all requests

## 🚧 Roadmap

- [ ] Durable Objects for agent conversation state
- [ ] Workflows for multi-step operations
- [ ] Queues for async task processing
- [ ] Workers AI integration for enhanced agent capabilities
- [ ] WebSocket support for real-time updates
- [ ] GraphQL API layer
- [ ] Rate limiting and quotas
- [ ] Multi-account support

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with:
- [Hono](https://hono.dev/) - Web framework
- [Zod](https://zod.dev/) - Schema validation
- [Cloudflare TypeScript SDK](https://github.com/cloudflare/cloudflare-typescript)
- [@hono/zod-openapi](https://github.com/honojs/middleware) - OpenAPI support
- [@hono/swagger-ui](https://github.com/honojs/middleware) - Swagger UI

## 📞 Support

- **Documentation**: `https://your-worker.workers.dev/docs`
- **Issues**: GitHub Issues
- **Cloudflare Docs**: https://developers.cloudflare.com/

---

**Made with ❤️ for the Cloudflare Developer Community**
