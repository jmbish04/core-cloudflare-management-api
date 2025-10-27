Create a Cloudflare Worker using TypeScript, the Hono router framework, Zod for validation, and `@hono/zod-openapi` for OpenAPI generation. Name the worker project `core-cloudflare-manager-api`.

**Goal:**
This worker will serve as a secure proxy and abstraction layer over the official Cloudflare API. It should provide:
1.  Direct, authenticated access to the underlying `cloudflare` TypeScript SDK functionality via namespaced routes.
2.  Comprehensive audit logging of all requests and actions into a D1 database.
3.  Verbose observability logging via the Analytics Engine.
4.  Dynamically generated OpenAPI documentation.
5.  A placeholder structure for future high-level workflow abstractions.

**Core Requirements:**

1.  **D1 Audit Logging:**
    * Define a D1 binding named `AUDIT_LOGS_DB`.
    * Create a table schema within D1 (e.g., `audit_logs`) to store detailed request/response information: `id (uuid)`, `timestamp (iso8601)`, `request_ip (text)`, `request_method (text)`, `request_url (text)`, `request_headers (text/json)`, `request_body (text/json, nullable)`, `response_status (integer)`, `response_body (text/json, nullable)`, `user_agent (text, nullable)`, `auth_key_used (text, nullable)`, `cloudflare_api_target (text, nullable)`, `duration_ms (integer)`.
    * Implement Hono middleware (`src/middleware/auditLog.ts`) that runs **after** the request is processed.
    * This middleware must capture maximum detail about the incoming request (IP, method, URL, headers, sanitized body if possible) and the outgoing response (status, sanitized body). It should also record the timestamp and calculate request duration.
    * Log the identified `WORKER_API_KEY` used for authentication (if applicable).
    * Log the target Cloudflare API endpoint/action if easily determinable from the route.
    * Use `ctx.waitUntil()` to insert the audit record into the D1 `audit_logs` table without blocking the response. Handle potential D1 insertion errors gracefully (e.g., log to console).
    * Create a `GET` endpoint `/api/audit-logs` (protected by auth) that queries and returns records from the `AUDIT_LOGS_DB` table. Support basic pagination query parameters (`?page=1&limit=50`).

2.  **Observability:**
    * Define an Analytics Engine binding named `OBSERVABILITY_AE`.
    * In the audit logging middleware (or separate middleware), use `ctx.waitUntil()` and `env.OBSERVABILITY_AE.writeDataPoint({...})` to send **verbose** log data. Include doubles for metrics (status code, duration), blobs for request/response details (method, URL, headers, IP, user agent, auth key hint, CF API target), and indexes where appropriate.

3.  **Security & Secrets:**
    * Define the following secrets in `wrangler.toml`:
        * `CLOUDFLARE_API_TOKEN`: For authenticating with the Cloudflare API.
        * `CLOUDFLARE_ACCOUNT_ID`: The target Cloudflare account ID.
        * `WORKER_API_KEY`: A secret key used for Bearer token authentication to *this* proxy worker.
    * Implement Bearer Token authentication middleware (`src/middleware/auth.ts`). Requests must include an `Authorization: Bearer <token>` header. The middleware must compare the provided `<token>` against the `WORKER_API_KEY` secret. Reject unauthorized requests (missing or incorrect token) with a 401/403 status. Log the key used in the audit log (e.g., a non-secret identifier or prefix if multiple keys are supported later).

4.  **Hono OpenAPI:**
    * Integrate `@hono/zod-openapi` following Hono's documentation.
    * Define API routes using `createRoute` and Zod schemas for request parameters (path, query, body) and responses. This is crucial for generating the OpenAPI spec. Use descriptive `summary` and `description` fields in the route definitions.
    * Dynamically generate and serve the OpenAPI specification at `/openapi.json` and `/openapi.yaml` using the Hono OpenAPI middleware.

**Structure & Routing:**

1.  **Main Router (`src/index.ts`):**
    * Initialize the Hono app with OpenAPI support (`new OpenAPIHono()`).
    * Apply authentication middleware and audit/observability logging middleware globally or to relevant route groups.
    * Initialize the `cloudflare` TypeScript SDK using secrets. Store the client instance and `accountId` in the Hono context (`c.set('cf', client); c.set('accountId', accountId);`). Store the D1 binding.
    * Register the `/openapi.json` and `/openapi.yaml` routes.
    * Create a base route group `/api`.
    * Mount the SDK router under `/api/cloudflare-sdk`.
    * Mount the Flows router under `/api/flows`.
    * Mount the audit log query endpoint `/api/audit-logs`.

2.  **SDK Router (`src/routes/sdk/index.ts`):**
    * Initialize a Hono app (`new OpenAPIHono()`).
    * Mount separate OpenAPI-enabled routers for Cloudflare product areas (e.g., `/workers`, `/pages`, `/tunnels`, `/tokens`, `/ai`, `/d1`, `/kv`, `/r2`). Create placeholder files in `src/routes/sdk/`.

3.  **Example SDK Module Router - Workers (`src/routes/sdk/workers.ts`):**
    * Initialize a Hono app (`new OpenAPIHono()`).
    * Access Cloudflare client, accountId, and D1 binding from context.
    * Implement routes proxying `cloudflare` SDK `workers` calls. **Define each route using `createRoute` with Zod schemas** for path parameters, query parameters, request bodies (where applicable), and success/error responses to enable OpenAPI generation.
    * **Examples (adapt with `createRoute`):**
        * `GET /scripts`: Map to `cf.workers.scripts.list(...)`. Define query param schema (optional limit, etc.).
        * `PUT /scripts/:scriptName`: Map to `cf.workers.scripts.update(...)`. Define path param schema, request body schema (multipart/form-data handling needed - Hono supports this), response schemas.
        * *(Continue for GET/DELETE script, account settings, beta workers API, builds, triggers etc., defining schemas for each)*
    * Wrap SDK calls in try/catch for error handling. Return structured error responses defined in schemas.

4.  **Flows Router Placeholder (`src/routes/flows/index.ts`):**
    * Initialize a Hono app (`new OpenAPIHono()`).
    * Include a `GET /` route defined with `createRoute` and basic schemas.
    * Add comments: `// Placeholder for high-level workflow endpoints, e.g., POST /workers/create_with_github_cicd defined using createRoute`.

**Output:**
Provide the complete code structure, including:
* `src/index.ts`
* `src/middleware/auth.ts`
* `src/middleware/auditLog.ts` (handling both D1 and Observability)
* `src/routes/sdk/index.ts`
* `src/routes/sdk/workers.ts` (Example with `createRoute` and schemas)
* `src/routes/flows/index.ts` (Placeholder with `createRoute`)
* Placeholder SDK route files (`src/routes/sdk/*.ts`)
* `src/types.ts` (if needed for shared Zod schemas or types)
* `wrangler.toml` configured for secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `WORKER_API_KEY`), D1 binding (`AUDIT_LOGS_DB`), and Analytics Engine binding (`OBSERVABILITY_AE`). Include D1 migration setup for the `audit_logs` table.
