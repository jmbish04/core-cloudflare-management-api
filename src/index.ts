/// <reference path="../worker-configuration.d.ts" />
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Cloudflare from 'cloudflare';
import { Env, Variables, generateUUID } from './types';
import apiRouter from './routes/api/index';
import flowsRouter from './routes/flows/index';
import healthRouter from './routes/health';
import { CloudflareApiClient } from './routes/api/apiClient';

// Import services
import { HealthCheckService } from './services/health-check';
import { autoTuneThreshold } from './services/coachTelemetry';

// Export Durable Objects
export { LogTailingDO } from './logTailingDO';
export { ContextCoachDO } from './contextCoachDO';
export { ConsultationSessionDO } from './consultationSessionDO';

// Export RPC Entrypoint for Service Bindings
export { CloudflareManagerRPC } from './rpc-entrypoint';

// Create Hono app
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS middleware
app.use('*', cors());

/**
 * Authentication Middleware
 * Validates CLIENT_AUTH_TOKEN for all incoming requests
 */
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);

  // Explicitly cast the secret to a string to handle cases where it might be an object
  if (token !== String(c.env.CLIENT_AUTH_TOKEN)) {
    return c.json({ success: false, error: 'Invalid authentication token' }, 403);
  }

  await next();
};

/**
 * Cloudflare SDK Initialization Middleware
 * Initializes SDK with worker's own CLOUDFLARE_TOKEN
 */
const cfInitMiddleware = async (c: any, next: any) => {
  // Temporarily log the types of all secrets to debug the binding issue
  // console.log('--- Secret Binding Types ---');
  // console.log('typeof c.env.CLOUDFLARE_ACCOUNT_ID:', typeof c.env.CLOUDFLARE_ACCOUNT_ID);
  // console.log('typeof c.env.CLOUDFLARE_TOKEN:', typeof c.env.CLOUDFLARE_TOKEN);
  // console.log('typeof c.env.CLIENT_AUTH_TOKEN:', typeof c.env.CLIENT_AUTH_TOKEN);
  // console.log('--------------------------');

  const cf = new Cloudflare({ apiToken: c.env.CLOUDFLARE_TOKEN });

  // Extract account ID from environment
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

  c.set('cf', cf);
  c.set('accountId', accountId);
  c.set('startTime', Date.now());
  c.set('requestId', generateUUID());

  await next();
};

// PATCHED: Token middleware fix for /api/tokens routes
const apiClientMiddleware = async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
  const urlPath = new URL(c.req.url).pathname;
  const isUserTokenRoute = urlPath.startsWith('/api/tokens');

  const apiToken = isUserTokenRoute
    ? c.env.CLOUDFLARE_USER_TOKEN
    : c.env.CLOUDFLARE_TOKEN;

  if (!apiToken) {
    const missingVar = isUserTokenRoute
      ? 'CLOUDFLARE_USER_TOKEN'
      : 'CLOUDFLARE_TOKEN';
    return c.json({ success: false, error: `${missingVar} is not configured` }, 500);
  }

  if (!c.get('apiClient')) {
    const apiClient = new CloudflareApiClient({ apiToken });
    c.set('apiClient', apiClient);
  }

  await next();
};

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Apply auth and CF init to all protected routes
app.use('/health/*', cfInitMiddleware, apiClientMiddleware);
app.use('/api/*', authMiddleware, cfInitMiddleware, apiClientMiddleware);
app.use('/flows/*', authMiddleware, cfInitMiddleware, apiClientMiddleware);
app.use('/mcp', authMiddleware, cfInitMiddleware);
app.use('/agent', authMiddleware, cfInitMiddleware);

// Mount routers
app.route('/api', apiRouter);
app.route('/flows', flowsRouter);
app.route('/health', healthRouter);

// Serve OpenAPI endpoints at root level
app.get('/openapi.json', async (c) => {
  // Forward to health router
  return healthRouter.fetch(c.req.raw, c.env, c.executionCtx);
});

app.get('/openapi.yaml', async (c) => {
  // Forward to health router
  return healthRouter.fetch(c.req.raw, c.env, c.executionCtx);
});

// Serve static assets (frontend dashboard)
app.get('/', async (c) => {
  try {
    const url = new URL(c.req.url);
    const requestInit: RequestInit = {
      method: c.req.method,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    };
    const response = await c.env.ASSETS.fetch(new Request(`${url.origin}/index.html`, requestInit));
    return response;
  } catch (error) {
    return c.html('<h1>Cloudflare WaaS</h1><p>Welcome to Worker Management API</p>');
  }
});

app.get('/styles.css', async (c) => {
  try {
    const url = new URL(c.req.url);
    const requestInit: RequestInit = {
      method: c.req.method,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    };
    return await c.env.ASSETS.fetch(new Request(`${url.origin}/styles.css`, requestInit));
  } catch (error) {
    return c.text('/* CSS not found */', 404);
  }
});

app.get('/app.js', async (c) => {
  try {
    const url = new URL(c.req.url);
    const requestInit: RequestInit = {
      method: c.req.method,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    };
    return await c.env.ASSETS.fetch(new Request(`${url.origin}/app.js`, requestInit));
  } catch (error) {
    return c.text('// JS not found', 404);
  }
});

/**
 * WebSocket Endpoint for Real-Time Log Tailing
 * Primary interface for live communication
 */
app.get('/logs/tail', async (c) => {
  // Auth check
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  if (token !== c.env.CLIENT_AUTH_TOKEN) {
    return c.json({ error: 'Invalid token' }, 403);
  }

  // Get Durable Object stub
  const doId = c.env.LOG_TAILING_DO.idFromName('log-tailer');
  const stub = c.env.LOG_TAILING_DO.get(doId);

  // Forward WebSocket upgrade request to Durable Object
  return stub.fetch(c.req.raw);
});

/**
 * Publish log entry (used internally or by other workers)
 */
app.post('/logs/publish', authMiddleware, async (c) => {
  try {
    const logEntry = await c.req.text();

    // Get Durable Object stub
    const doId = c.env.LOG_TAILING_DO.idFromName('log-tailer');
    const stub = c.env.LOG_TAILING_DO.get(doId);

    // Forward to Durable Object
    await stub.fetch(new Request('http://do/publish', {
      method: 'POST',
      body: logEntry,
    }));

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * MCP (Model Context Protocol) Server Endpoint
 * Enables AI assistant integration
 */
app.post('/mcp', async (c) => {
  try {
    const body = await c.req.json();
    const { method, params } = body;

    switch (method) {
      case 'tools/list':
        // Import MCP tools
        const { listMCPTools } = await import('./mcp/index');
        const mcpTools = listMCPTools();

        return c.json({
          tools: [
            {
              name: 'cloudflare_create_managed_token',
              description: 'Create a Cloudflare API token with intelligent management (stored securely, audited, TTL support)',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Token name' },
                  purpose: { type: 'string', description: 'What this token will be used for' },
                  permissions: { type: 'array', description: 'Permission IDs' },
                  ttl_days: { type: 'number', description: 'Days until expiration' },
                },
                required: ['name', 'purpose', 'permissions'],
              },
            },
            {
              name: 'cloudflare_list_workers',
              description: 'List all Cloudflare Workers',
              inputSchema: { type: 'object', properties: {} },
            },
            {
              name: 'cloudflare_create_project',
              description: 'Create complete project with bindings and CI/CD',
              inputSchema: {
                type: 'object',
                properties: {
                  projectName: { type: 'string' },
                  bindings: { type: 'array', items: { type: 'string' } },
                  githubRepo: { type: 'string' },
                  githubOwner: { type: 'string' },
                },
                required: ['projectName'],
              },
            },
            ...mcpTools,
          ],
        });

      case 'tools/call':
        // Route to appropriate endpoint based on tool name
        const toolName = params.name;
        const toolParams = params.arguments;

        // Check if it's an MCP tool from our registry
        const { getMCPTool } = await import('./mcp/index');
        const tool = getMCPTool(toolName);

        if (tool) {
          try {
            const result = await tool.handler(toolParams, c.env);
            return c.json({
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            });
          } catch (error: any) {
            return c.json({
              content: [{
                type: 'text',
                text: `Error: ${error.message}`,
              }],
              isError: true,
            });
          }
        }

        // Forward to appropriate internal endpoint for legacy tools
        // In production, you'd make actual API calls here
        return c.json({
          content: [{
            type: 'text',
            text: `Executed ${toolName} with params: ${JSON.stringify(toolParams)}`,
          }],
        });

      default:
        return c.json({ error: 'Unknown MCP method' }, 400);
    }
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * AI Agent Endpoint
 * Natural language interface with cloudflare-docs integration
 */
app.post('/agent', async (c) => {
  try {
    const { prompt } = await c.req.json();
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    // Basic intent detection (in production, use Workers AI or external LLM)
    const promptLower = prompt.toLowerCase();
    const actions: any[] = [];
    let response = '';

    if (promptLower.includes('create') && promptLower.includes('token')) {
      // Token creation flow
      // In production, agent would:
      // 1. Use cloudflare-docs MCP to lookup permissions
      // 2. Determine exact permissions needed
      // 3. Call /flows/token/create
      response = `To create a token, I need to know:
1. What will this token be used for?
2. Which resources does it need access to?
3. Should it have an expiration (TTL)?

I can use the cloudflare-docs to determine the exact permissions needed. Please provide more details about the token's purpose.`;
    } else if (promptLower.includes('list') && promptLower.includes('worker')) {
      const workers = await cf.workers.scripts.list({ account_id: accountId });
      console.log(JSON.stringify(workers));
      actions.push({ type: 'list_workers', result: workers });
      const workerCount = Array.isArray(workers.result) ? workers.result.length : 0;
      response = `Found ${workerCount} workers in your account.`;
    } else {
      response = `I can help you manage your Cloudflare infrastructure. I can:

- Create managed API tokens (with secure storage and auditing)
- List and manage Workers, Pages, and storage resources
- Create complete project stacks with bindings
- Setup CI/CD pipelines
- And more...

What would you like to do?`;
    }

    return c.json({
      success: true,
      result: {
        message: response,
        actions,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Scheduled Handler for TTL Cleanup and Health Checks
 * Runs periodically to clean up expired tokens and perform health checks
 */
export const scheduled = async (
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
) => {
  try {
    const cf = new Cloudflare({ apiToken: env.CLOUDFLARE_TOKEN });
    const db = env.DB;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const now = new Date().toISOString();

    console.log(`Scheduled task started at ${now} for cron '${controller.cron}'`);

    // Task 0: Auto-tune coach threshold (runs every 12 hours)
    if (controller.cron === '0 */12 * * *' || controller.cron === '0 0 * * *') {
      ctx.waitUntil(
        autoTuneThreshold(env).catch((err) => {
          console.error('Auto-tune threshold failed:', err);
        })
      );
    }

    // Task 1: Clean up expired tokens (runs every 6 hours)
    if (controller.cron === '0 */6 * * *') {
      const expiredTokens = await db
        .prepare("SELECT * FROM managed_tokens WHERE expires_at < ? AND status = 'active'")
        .bind(now)
        .all();

      for (const token of expiredTokens.results || []) {
        try {
          // Delete from Cloudflare
          await cf.user.tokens.delete(token.token_id);

          // Delete from secret store via API
          // Note: The secrets API structure may vary - adjust based on actual Cloudflare API
          try {
            // Using the API client to delete secrets if available
            // This is a placeholder - adjust based on actual API structure
            console.log(`Would delete secret ${token.secret_key} from store ${env.MANAGED_SECRETS_STORE}`);
          } catch (secretError) {
            console.error(`Failed to delete secret ${token.secret_key}:`, secretError);
          }

          // Update status
          await db
            .prepare("UPDATE managed_tokens SET status = 'expired' WHERE id = ?")
            .bind(token.id)
            .run();

          console.log(`Cleaned up expired token: ${token.token_name}`);
        } catch (error) {
          console.error(`Failed to cleanup token ${token.id}:`, error);
        }
      }
      console.log(`TTL cleanup completed. Processed ${expiredTokens.results?.length || 0} expired tokens.`);
    }

    // Task 2: Run daily health check
    if (controller.cron === '0 0 * * *') {
      console.log('Running daily health check...');
      try {
        // BASE_URL should be set in wrangler.jsonc [vars] for production
        const baseUrl = env.BASE_URL || `https://core-cloudflare-management-api.hacolby.workers.dev`;
        const healthService = new HealthCheckService(env, baseUrl, env.CLIENT_AUTH_TOKEN);

        const healthResult = await healthService.runHealthCheck();
        await healthService.saveHealthCheck(healthResult);

        console.log(`Daily health check completed. Status: ${healthResult.overall_status}, Healthy: ${healthResult.healthy_endpoints}/${healthResult.total_endpoints}`);
      } catch (healthError) {
        console.error('Failed to run daily health check:', healthError);
      }
    }
  } catch (error) {
    console.error('Error in scheduled handler:', error);
  }
};

/**
 * Tail Handler for Log Streaming
 * Captures logs and streams them to WebSocket clients
 */
export const tail = async (
  events: TraceItem[],
  env: Env,
  ctx: ExecutionContext
) => {
  try {
    // Get Durable Object stub
    const doId = env.LOG_TAILING_DO.idFromName('log-tailer');
    const stub = env.LOG_TAILING_DO.get(doId);

    // Publish each log entry
    for (const event of events) {
      const logEntry = JSON.stringify({
        timestamp: new Date(event.eventTimestamp || Date.now()).toISOString(),
        outcome: event.outcome,
        logs: event.logs,
        exceptions: event.exceptions,
      });

      await stub.fetch(new Request('http://do/publish', {
        method: 'POST',
        body: logEntry,
      }));
    }
  } catch (error) {
    console.error('Error in tail handler:', error);
  }
};

/**
 * Queue Consumer for Consultation Tasks
 * Processes consultation requests from CONSULTATION_QUEUE
 */
export const queue = async (
  batch: MessageBatch<any>,
  env: Env,
  ctx: ExecutionContext
) => {
  try {
    const { handleConsultationQueueMessage } = await import('./services/consultation-workflow');
    await handleConsultationQueueMessage(batch, env);
  } catch (error) {
    console.error('Error in consultation queue consumer:', error);
  }
};

// Default export for RPC (Service Bindings)
// WebSocket upgrade handler
app.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // Create WebSocket pair
  const { 0: client, 1: server } = new WebSocketPair();
  
  // Accept the WebSocket connection
  server.accept();

  // Handle WebSocket messages
  server.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data as string);
      
      // Echo back or handle specific message types
      if (data.type === 'ping') {
        server.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } else if (data.type === 'health') {
        server.send(JSON.stringify({
          type: 'health',
          status: 'healthy',
          timestamp: new Date().toISOString(),
        }));
      } else {
        server.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type',
        }));
      }
    } catch (error: any) {
      server.send(JSON.stringify({
        type: 'error',
        message: error.message,
      }));
    }
  });

  // Handle WebSocket close
  server.addEventListener('close', () => {
    // Cleanup if needed
  });

  // Return WebSocket response
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

export default app;
