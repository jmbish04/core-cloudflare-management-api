import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import Cloudflare from 'cloudflare';
import { swaggerUI } from '@hono/swagger-ui';
import { Env, Variables, PaginationQuerySchema, ErrorResponseSchema, SuccessResponseSchema } from './types';
import { authMiddleware } from './middleware/auth';
import { auditLogMiddleware } from './middleware/auditLog';

// Import routers
import sdkRouter from './routes/sdk/index';
import flowsRouter from './routes/flows/index';
import agentRouter from './routes/agent';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// CORS middleware
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }

  await next();
});

// Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Landing page - serve static HTML
app.get('/', async (c) => {
  const html = await fetch('https://raw.githubusercontent.com/yourusername/yourrepo/main/public/index.html')
    .catch(() => null);

  if (html) {
    return c.html(await html.text());
  }

  // Fallback to simple response
  return c.json({
    name: 'Cloudflare Management API',
    version: '1.0.0',
    description: 'A comprehensive proxy API for managing Cloudflare resources',
    endpoints: {
      documentation: '/docs',
      openapi: '/openapi.json',
      api: '/api',
      mcp: '/mcp',
      rpc: '/rpc',
      agent: '/agent',
    },
  });
});

// Initialize Cloudflare SDK middleware
app.use('/api/*', async (c, next) => {
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Cloudflare API credentials not configured',
        },
      },
      500
    );
  }

  const cf = new Cloudflare({ apiToken });
  c.set('cf', cf);
  c.set('accountId', accountId);
  c.set('startTime', Date.now());
  c.set('requestId', crypto.randomUUID());

  await next();
});

// Apply authentication and audit logging to API routes
app.use('/api/*', authMiddleware);
app.use('/api/*', auditLogMiddleware);

// Audit Logs Query Endpoint
const auditLogsRoute = createRoute({
  method: 'get',
  path: '/api/audit-logs',
  summary: 'Query Audit Logs',
  description: 'Retrieve audit logs with pagination',
  tags: ['Audit'],
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'Audit logs retrieved',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              logs: z.array(z.any()),
              pagination: z.object({
                page: z.number(),
                limit: z.number(),
                total: z.number(),
              }),
            })
          ),
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(auditLogsRoute, async (c) => {
  try {
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const db = c.env.AUDIT_LOGS_DB;

    // Get total count
    const countResult = await db.prepare('SELECT COUNT(*) as total FROM audit_logs').first();
    const total = (countResult?.total as number) || 0;

    // Get paginated results
    const results = await db
      .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all();

    return c.json({
      success: true,
      result: {
        logs: results.results || [],
        pagination: {
          page,
          limit,
          total,
        },
      },
    });
  } catch (error: any) {
    console.error('Error querying audit logs:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: error.message || 'Failed to query audit logs',
          details: error,
        },
      },
      500
    );
  }
});

// Mount routers
app.route('/api/cloudflare-sdk', sdkRouter);
app.route('/api/flows', flowsRouter);

// Mount agent router with SDK initialization
app.use('/agent', async (c, next) => {
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Cloudflare API credentials not configured',
        },
      },
      500
    );
  }

  const cf = new Cloudflare({ apiToken });
  c.set('cf', cf);
  c.set('accountId', accountId);
  c.set('startTime', Date.now());
  c.set('requestId', crypto.randomUUID());

  await next();
});
app.use('/agent', authMiddleware);
app.route('/agent', agentRouter);

// OpenAPI documentation
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Cloudflare Management API',
    version: '1.0.0',
    description: 'A comprehensive proxy API for managing Cloudflare resources with audit logging, OpenAPI documentation, and workflow automation.',
  },
  servers: [
    {
      url: 'https://your-worker.your-subdomain.workers.dev',
      description: 'Production',
    },
    {
      url: 'http://localhost:8787',
      description: 'Local Development',
    },
  ],
  tags: [
    { name: 'Workers', description: 'Cloudflare Workers management' },
    { name: 'Pages', description: 'Cloudflare Pages management' },
    { name: 'Tunnels', description: 'Cloudflare Tunnels management' },
    { name: 'API Tokens', description: 'API token management' },
    { name: 'DNS', description: 'DNS record management' },
    { name: 'Access', description: 'Zero Trust Access management' },
    { name: 'Zones', description: 'Zone management' },
    { name: 'Storage - D1', description: 'D1 database management' },
    { name: 'Storage - KV', description: 'KV namespace management' },
    { name: 'Storage - R2', description: 'R2 bucket management' },
    { name: 'Flows', description: 'Workflow automation' },
    { name: 'Flows - Advanced', description: 'Advanced workflow automation' },
    { name: 'Audit', description: 'Audit log queries' },
    { name: 'AI Agent', description: 'Natural language AI agent interface' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Use your WORKER_API_KEY as the bearer token',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
});

// Swagger UI
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

// MCP Server Endpoint - Model Context Protocol
app.post('/mcp', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { method, params } = body;

    // MCP protocol implementation
    switch (method) {
      case 'tools/list':
        return c.json({
          tools: [
            {
              name: 'cloudflare_list_workers',
              description: 'List all Cloudflare Workers',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'cloudflare_create_worker',
              description: 'Create a new Cloudflare Worker with GitHub CI/CD',
              inputSchema: {
                type: 'object',
                properties: {
                  workerName: { type: 'string' },
                  githubOwner: { type: 'string' },
                  githubRepo: { type: 'string' },
                },
                required: ['workerName', 'githubOwner', 'githubRepo'],
              },
            },
            {
              name: 'cloudflare_deploy_pages',
              description: 'Deploy a Cloudflare Pages project',
              inputSchema: {
                type: 'object',
                properties: {
                  projectName: { type: 'string' },
                },
                required: ['projectName'],
              },
            },
            // Add more tools...
          ],
        });

      case 'tools/call':
        const toolName = params.name;
        const toolParams = params.arguments;

        // Route to appropriate endpoint
        // This is a simplified implementation
        return c.json({
          content: [
            {
              type: 'text',
              text: `Tool ${toolName} executed with params ${JSON.stringify(toolParams)}`,
            },
          ],
        });

      default:
        return c.json({ error: 'Unknown method' }, 400);
    }
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// RPC Endpoint for Service Bindings
app.post('/rpc/:method', authMiddleware, async (c) => {
  try {
    const method = c.req.param('method');
    const body = await c.req.json();

    // Initialize Cloudflare SDK
    const cf = new Cloudflare({ apiToken: c.env.CLOUDFLARE_API_TOKEN });
    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

    // Route RPC method to SDK
    const [resource, action] = method.split('.');

    // This is a simplified RPC router
    // In production, you'd have a more sophisticated routing system

    return c.json({
      jsonrpc: '2.0',
      result: {
        message: `RPC method ${method} executed`,
        resource,
        action,
      },
      id: body.id || null,
    });
  } catch (error: any) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message,
      },
      id: null,
    });
  }
});

// Export for service bindings
export default app;

// RPC-style exports for service bindings
export class CloudflareManagementRPC {
  constructor(private env: Env) {}

  async listWorkers() {
    const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_API_TOKEN });
    return await cf.workers.scripts.list({ account_id: this.env.CLOUDFLARE_ACCOUNT_ID });
  }

  async createWorker(params: any) {
    const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_API_TOKEN });
    // Implementation
    return { success: true };
  }

  // Add more RPC methods...
}
