Create a Cloudflare Worker using TypeScript and the Hono router framework. Name the worker project `core-cloudflare-manager-api`.

**Goal:**
This worker will serve as a secure proxy and abstraction layer over the official Cloudflare API. It should provide simplified, "well-lit paths" for common management tasks within a Cloudflare account.

**Core Functionality (Initial Focus): Create Worker with CI/CD Setup**

1.  **Endpoint:** Create a `POST` endpoint, for example `/workers/create_with_github_cicd`.
2.  **Inputs:** This endpoint should accept a JSON body containing:
    * `workerName`: The desired name for the new Cloudflare Worker.
    * `githubOwner`: The GitHub username or organization owning the repository.
    * `githubRepo`: The name of the GitHub repository containing the Worker code.
    * `productionBranch`: (Optional) The branch to deploy from (defaults to 'main').
    * `buildCommand`: (Optional) The build command to run (e.g., 'npm run build'). Defaults to empty string.
    * `rootDir`: (Optional) The root directory within the repo. Defaults to '/'.
3.  **Internal Logic:**
    * Use the official `cloudflare` TypeScript SDK (`import Cloudflare from 'cloudflare';`).
    * **Step 1: Create Repository Connection:** Call the equivalent of `PUT /accounts/{account_id}/builds/repos/connections` using the SDK. Pass the `githubOwner` and `githubRepo` details. Store the returned `repo_connection_uuid`.
    * **Step 2: Create Build Trigger:** Call the equivalent of `POST /accounts/{account_id}/builds/triggers` using the SDK.
        * Provide the `repo_connection_uuid` obtained in Step 1.
        * Set `external_script_id` to the input `workerName`.
        * Configure the trigger using the inputs: `productionBranch` (map to `branch_includes`), `buildCommand`, `rootDir`.
        * Set a reasonable default `deploy_command` like `npx wrangler deploy`.
        * Give the trigger a descriptive `trigger_name`.
    * **Error Handling:** Implement try/catch blocks for the SDK calls. Return appropriate error responses (e.g., 400 for bad input, 500 for Cloudflare API errors) with informative messages.
    * **Success Response:** On success, return a JSON response indicating success and potentially including the new Worker name and the created trigger ID.

**Security:**

* The worker **must** retrieve the Cloudflare API Token (`CLOUDFLARE_API_TOKEN`) and Account ID (`CLOUDFLARE_ACCOUNT_ID`) securely from Worker Secrets. Do not hardcode them.
* Implement basic Bearer Token authentication for the proxy worker itself. Requests to this worker should include an `Authorization: Bearer <PROXY_SECRET_TOKEN>` header, where `PROXY_SECRET_TOKEN` is another secret configured in the worker's settings. Validate this token before processing any request.

**Extensibility (Future Scope - Include placeholders/comments):**

* Add comments indicating where future endpoints for managing the following services should be added:
    * Cloudflare Pages (Create, Deploy, Domains)
    * Cloudflare Tunnels (Create, List, Delete)
    * API Tokens (Create, List, Roll)
    * Workers AI, D1, KV, R2 (Basic CRUD operations)
    * Worker Containers / Deployments (beyond the initial CI/CD setup)

**Output:**
Provide the complete `src/index.ts` file for this Cloudflare Worker, including necessary imports, Hono setup, routing, SDK initialization using secrets, the core `/workers/create_with_github_cicd` endpoint logic, bearer token authentication middleware, and basic error handling. Include type definitions for request bodies where appropriate.
