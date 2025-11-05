### 1\. Checklist for `core-cloudflare-management-api`

Here is a checklist to achieve your stated goals, structured from foundation to features.

**[ ] Foundation & Architecture**

  * **[ ] Hono:** Use Hono for the core REST API (already in place).
  * **[ ] RPC Interface:** Export the Hono `app` as the default export to make it *natively bindable* as a Service Binding (RPC).
  * **[ ] WebSocket Interface:** Implement a WebSocket endpoint (e.g., `/ws/logs/...`) for real-time log tailing.
  * **[ ] Durable Object (for Logs):** Use a Durable Object (`LogTailingDO`) to manage WebSocket fan-out for log streams.
  * **[ ] D1 Binding:** Add a D1 binding (`TOKEN_AUDIT_DB`) to the worker itself for auditing API tokens and other managed resources.
  * **[ ] Secret Store Binding:** Add a Secret Store binding (`MANAGED_SECRETS`) to the worker itself to store newly created tokens.
  * **[ ] Authentication:**
      * Secure the *entire service* with a primary auth token (`env.CLIENT_AUTH_TOKEN`).
      * Store the "god" Cloudflare API token it uses for its *own* operations in a secret (`env.CF_API_TOKEN`).

**[ ] Feature: "Wrangler as a Service" (Automate Bindings)**

  * **[ ] SDK (Complete):** Fully implement all `/sdk/*` proxy routes for:
      * `.../workers/scripts` (Deploy, Get, List, Delete)
      * `.../workers/scripts/:name/secrets` (Put, List, Delete)
      * `.../workers/scripts/:name/tails` (Set/Get Tail Consumers)
      * `.../storage/kv/namespaces`
      * `.../d1/database`
      * `.../r2/buckets`
      * `.../pages/projects` (Create, Get, List, Delete)
  * **[ ] Flow (Create Project):** `POST /flows/create-project`
      * **Input:** `{ "name": "my-app", "bindings": { "d1": ["DB"], "kv": ["CACHE"], "r2": ["ASSETS"], "secrets": ["API_KEY"] } }`
      * **Action:**
        1.  Calls `/sdk/...` to create the D1, KV, and R2 bindings.
        2.  Creates an *empty* Worker script (`my-app`).
        3.  Calls `/sdk/.../secrets` to *pre-define* the secret `API_KEY` (even if value is just "placeholder").
        4.  Deploys the worker with all these bindings attached.
      * **Output:** The `wrangler.toml` (or JSON) configuration for the new app.
  * **[ ] Flow (Delete Project):** `DELETE /flows/project/:name`
      * **Action:** Deletes the worker script *and* all associated D1, KV, and R2 resources (if specified, e.g., `?cleanup=true`).

**[ ] Feature: "Deploy from Canvas"**

  * **[ ] Flow (Deploy Content):** `PUT /flows/deploy-content`
      * **Input:** `{ "script_name": "my-app", "content": "...", "bindings": { ... } }`
      * **Action:**
        1.  Calls `POST /flows/create-project` logic to ensure all bindings exist.
        2.  Deploys the raw string `content` as the worker script.
      * **Output:** `{ "url": "my-app.your-subdomain.workers.dev" }`

**[ ] Feature: Token Management**

  * **[ ] SDK (Complete):** Fully implement `/sdk/user/tokens` (Create, List, Get, Delete, Roll).
  * **[ ] Flow (Create Managed Token):** `POST /flows/managed-token`
      * **Input:** `{ "name": "demo-token", "purpose": "Demo for client X", "permissions": [...], "ttl_days": 7 }`
      * **Action:**
        1.  Calls `/sdk/user/tokens` to create the token.
        2.  Saves the returned token *value* to this worker's `MANAGED_SECRETS` binding (e.g., `await env.MANAGED_SECRETS.put("TOKEN_DEMO_TOKEN")`).
        3.  Saves the token *metadata* (`id`, `name`, `purpose`, `expires_on`, `secret_name: "TOKEN_DEMO_TOKEN"`) to the `TOKEN_AUDIT_DB`.
      * **Output:** `{ "secret_name": "TOKEN_DEMO_TOKEN" }` (Crucially, *not* the token value).
  * **[ ] Cron (Token TTL):** Implement the `scheduled` handler in `index.ts`.
      * **Action:**
        1.  `SELECT id, secret_name FROM TOKEN_AUDIT_DB WHERE expires_on < NOW()`.
        2.  For each expired token:
              * Call `/sdk/user/tokens/:id` (DELETE).
              * Call `env.MANAGED_SECRETS.delete(secret_name)`.
              * `DELETE FROM TOKEN_AUDIT_DB WHERE id = ?`.

**[ ] Feature: Full CI/CD Loop**

  * **[ ] Flow (Setup GitHub CI/CD):** `POST /flows/setup-github-ci`
      * **Input:** `{ "project_name": "my-app", "github_repo_url": "https://github.com/your-org/my-app" }`
      * **Action:**
        1.  Parses the `github_repo_url` to get `owner` and `repo_name`.
        2.  Calls `POST /sdk/pages/projects` to create a new Pages project, linking it to the GitHub repo (`source.config`).
      * **Output:** `{ "status": "Cloudflare CI/CD enabled. Push to 'main' to deploy." }`

**[ ] Feature: Log Tailing**

  * **[ ] SDK (Configure Tail):** `PUT /sdk/workers/scripts/:script_name/tail`
      * **Action:** Sets the `tail_consumers` for a *target* worker to point to *this* worker (`core-cloudflare-management-api`).
  * **[ ] Durable Object (Manage Sockets):** `LogTailingDO`.
      * `fetch(request)`: Handles WebSocket upgrade.
      * `webSocketMessage(ws, message)`: Handles messages *from* the client (e.g., "start-stream").
      * `receiveTail(log)`: A custom DO method that gets called by the main worker's `tail` handler. It broadcasts `log` to all connected WebSockets.
  * **[ ] Worker `tail` Handler:** Implement the `tail(events, env, ctx)` handler in `index.ts`.
      * **Action:** For each event, get the DO stub (`env.LOG_TAILING_DO.get(...)`) and call `stub.receiveTail(event)`.
  * **[ ] Flow (Start Tailing):** `GET /ws/logs/:account_id/:script_name`
      * **Action:** Upgrades to a WebSocket and connects to the `LogTailingDO` for that script.
