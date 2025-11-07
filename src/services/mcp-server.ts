import { z } from 'zod';

/**
 * MCP Server Tool Definitions
 * Exposes WaaS API functionality through MCP (Model Context Protocol)
 * Compatible with Claude Code, Codex CLI, and other MCP clients
 */

export const mcpTools = {
  // Token Management
  create_managed_token: {
    name: 'create_managed_token',
    description: 'Create a managed Cloudflare API token with secure storage and audit trail',
    schema: z.object({
      name: z.string().describe('Token name'),
      purpose: z.string().describe('Purpose of this token'),
      permissions: z.array(z.object({
        id: z.string(),
        name: z.string().optional(),
      })).describe('Permission IDs for the token'),
      ttl_days: z.number().optional().describe('Days until token expires'),
    }),
  },

  list_managed_tokens: {
    name: 'list_managed_tokens',
    description: 'List all managed API tokens',
    schema: z.object({
      status: z.enum(['active', 'expired', 'revoked', 'all']).optional().default('active'),
    }),
  },

  revoke_managed_token: {
    name: 'revoke_managed_token',
    description: 'Revoke a managed API token',
    schema: z.object({
      token_id: z.string().describe('Token ID to revoke'),
    }),
  },

  // Worker Deployment
  deploy_worker: {
    name: 'deploy_worker',
    description: 'Deploy a Cloudflare Worker from code content',
    schema: z.object({
      script_name: z.string().describe('Worker script name'),
      content: z.string().describe('Worker JavaScript/TypeScript content'),
      bindings: z.object({
        kv: z.array(z.object({ binding: z.string(), id: z.string() })).optional(),
        d1: z.array(z.object({ binding: z.string(), database_id: z.string() })).optional(),
        r2: z.array(z.object({ binding: z.string(), bucket_name: z.string() })).optional(),
      }).optional(),
      vars: z.record(z.string()).optional(),
    }),
  },

  deploy_worker_with_assets: {
    name: 'deploy_worker_with_assets',
    description: 'Deploy a Cloudflare Worker with static assets (for SPAs, static sites)',
    schema: z.object({
      script_name: z.string().describe('Worker script name'),
      content: z.string().describe('Worker content'),
      assets: z.record(z.string()).describe('Map of file paths to content'),
      asset_config: z.object({
        not_found_handling: z.enum(['single-page-application', '404-page', 'none']).optional(),
        run_worker_first: z.array(z.string()).optional().describe('Paths to run worker first (e.g., /api/*)'),
      }).optional(),
    }),
  },

  list_workers: {
    name: 'list_workers',
    description: 'List all Cloudflare Workers in the account',
    schema: z.object({}),
  },

  get_worker: {
    name: 'get_worker',
    description: 'Get details of a specific worker',
    schema: z.object({
      script_name: z.string().describe('Worker script name'),
    }),
  },

  delete_worker: {
    name: 'delete_worker',
    description: 'Delete a Cloudflare Worker',
    schema: z.object({
      script_name: z.string().describe('Worker script name'),
    }),
  },

  // Project Creation
  create_project: {
    name: 'create_project',
    description: 'Create a complete project with bindings (KV, D1, R2, etc.)',
    schema: z.object({
      projectName: z.string().describe('Project name'),
      bindings: z.array(z.enum(['kv', 'd1', 'r2', 'analytics_engine', 'queue'])).optional(),
      githubOwner: z.string().optional(),
      githubRepo: z.string().optional(),
    }),
  },

  create_project_with_github: {
    name: 'create_project_with_github',
    description: 'Create project and GitHub repository together',
    schema: z.object({
      projectName: z.string(),
      bindings: z.array(z.string()).optional(),
      githubOwner: z.string(),
      githubRepo: z.string(),
      coreGithubApiUrl: z.string().describe('URL to core-github-api service'),
    }),
  },

  // CI/CD Management
  setup_cicd: {
    name: 'setup_cicd',
    description: 'Setup CI/CD pipeline for a worker',
    schema: z.object({
      worker_name: z.string(),
      github_owner: z.string(),
      github_repo: z.string(),
      production_branch: z.string().optional().default('main'),
      auto_deploy: z.boolean().optional().default(true),
    }),
  },

  get_cicd_status: {
    name: 'get_cicd_status',
    description: 'Get CI/CD status and recent builds for a worker',
    schema: z.object({
      worker_id: z.string(),
    }),
  },

  get_build_logs: {
    name: 'get_build_logs',
    description: 'Get build logs for a specific build run',
    schema: z.object({
      run_id: z.string(),
    }),
  },

  // Health Monitoring
  check_worker_health: {
    name: 'check_worker_health',
    description: 'Check health of workers updated recently',
    schema: z.object({
      days: z.number().optional().default(7).describe('Check workers updated in last N days'),
      filter_pattern: z.string().optional().describe('Filter workers by name pattern'),
    }),
  },

  check_ecosystem_health: {
    name: 'check_ecosystem_health',
    description: 'Check health of all workers matching a prefix (e.g., vibesdk-*)',
    schema: z.object({
      prefix: z.string().describe('Worker name prefix to match'),
    }),
  },

  get_worker_health: {
    name: 'get_worker_health',
    description: 'Get detailed health status for a specific worker',
    schema: z.object({
      script_name: z.string(),
    }),
  },

  // Storage Operations
  list_kv_namespaces: {
    name: 'list_kv_namespaces',
    description: 'List all KV namespaces',
    schema: z.object({}),
  },

  create_kv_namespace: {
    name: 'create_kv_namespace',
    description: 'Create a KV namespace',
    schema: z.object({
      title: z.string().describe('KV namespace title'),
    }),
  },

  list_d1_databases: {
    name: 'list_d1_databases',
    description: 'List all D1 databases',
    schema: z.object({}),
  },

  create_d1_database: {
    name: 'create_d1_database',
    description: 'Create a D1 database',
    schema: z.object({
      name: z.string().describe('Database name'),
    }),
  },

  list_r2_buckets: {
    name: 'list_r2_buckets',
    description: 'List all R2 buckets',
    schema: z.object({}),
  },

  create_r2_bucket: {
    name: 'create_r2_bucket',
    description: 'Create an R2 bucket',
    schema: z.object({
      name: z.string().describe('Bucket name'),
    }),
  },

  // Batch Operations
  batch_deploy_workers: {
    name: 'batch_deploy_workers',
    description: 'Deploy multiple workers in a single operation',
    schema: z.object({
      workers: z.array(z.object({
        script_name: z.string(),
        content: z.string(),
        bindings: z.any().optional(),
        vars: z.record(z.string()).optional(),
      })),
    }),
  },

  // Secrets Management
  create_worker_secret: {
    name: 'create_worker_secret',
    description: 'Create or update a worker secret',
    schema: z.object({
      script_name: z.string(),
      secret_name: z.string(),
      secret_value: z.string(),
    }),
  },

  list_worker_secrets: {
    name: 'list_worker_secrets',
    description: 'List secrets for a worker',
    schema: z.object({
      script_name: z.string(),
    }),
  },

  // System Health
  run_system_health_check: {
    name: 'run_system_health_check',
    description: 'Run comprehensive health check of all API endpoints',
    schema: z.object({}),
  },

  get_latest_health_check: {
    name: 'get_latest_health_check',
    description: 'Get the most recent system health check results',
    schema: z.object({}),
  },
};

/**
 * MCP Tool Execution Handler
 * Maps tool calls to API endpoints
 */
export async function executeMCPTool(
  toolName: string,
  params: any,
  apiBaseUrl: string,
  authToken: string
): Promise<any> {
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  // Map tool names to API endpoints
  const toolToEndpoint: Record<string, { method: string; path: string; transform?: (params: any) => any }> = {
    create_managed_token: { method: 'POST', path: '/flows/token/create' },
    list_managed_tokens: { method: 'GET', path: '/flows/token' },
    revoke_managed_token: { method: 'DELETE', path: `/flows/token/${params.token_id}` },

    deploy_worker: { method: 'POST', path: '/flows/deploy/from-content' },
    deploy_worker_with_assets: { method: 'POST', path: '/flows/deploy/from-canvas' },
    list_workers: { method: 'GET', path: '/sdk/workers/scripts' },
    get_worker: { method: 'GET', path: `/sdk/workers/scripts/${params.script_name}` },
    delete_worker: { method: 'DELETE', path: `/flows/deploy/${params.script_name}` },

    create_project: { method: 'POST', path: '/flows/project/create' },
    create_project_with_github: { method: 'POST', path: '/flows/project/create-with-github' },

    setup_cicd: { method: 'POST', path: '/flows/cicd/setup' },
    get_cicd_status: { method: 'GET', path: `/flows/cicd/status/${params.worker_id}` },
    get_build_logs: { method: 'GET', path: `/sdk/cicd/runs/${params.run_id}/logs` },

    check_worker_health: { method: 'POST', path: '/flows/health/check-recent-workers' },
    check_ecosystem_health: { method: 'GET', path: `/flows/health/ecosystem/${params.prefix}` },
    get_worker_health: { method: 'GET', path: `/flows/health/worker/${params.script_name}` },

    list_kv_namespaces: { method: 'GET', path: '/sdk/storage/kv/namespaces' },
    create_kv_namespace: { method: 'POST', path: '/sdk/storage/kv/namespaces' },
    list_d1_databases: { method: 'GET', path: '/sdk/storage/d1/databases' },
    create_d1_database: { method: 'POST', path: '/sdk/storage/d1/databases' },
    list_r2_buckets: { method: 'GET', path: '/sdk/storage/r2/buckets' },
    create_r2_bucket: { method: 'POST', path: '/sdk/storage/r2/buckets' },

    batch_deploy_workers: { method: 'POST', path: '/flows/deploy/batch' },

    create_worker_secret: {
      method: 'PUT',
      path: `/sdk/workers/scripts/${params.script_name}/secrets/${params.secret_name}`,
      transform: (p: any) => ({ text: p.secret_value }),
    },
    list_worker_secrets: { method: 'GET', path: `/sdk/workers/scripts/${params.script_name}/secrets` },

    run_system_health_check: { method: 'POST', path: '/health/check' },
    get_latest_health_check: { method: 'GET', path: '/health/latest' },
  };

  const endpoint = toolToEndpoint[toolName];
  if (!endpoint) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const url = `${apiBaseUrl}${endpoint.path}`;
  const body = endpoint.transform ? endpoint.transform(params) : params;

  const response = await fetch(url, {
    method: endpoint.method,
    headers,
    body: ['POST', 'PUT', 'PATCH'].includes(endpoint.method) ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return await response.json();
}
