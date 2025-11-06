import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Cloudflare from 'cloudflare';
import { Env, Variables, generateUUID } from './types';

// Import routers
import sdkRouter from './routes/sdk/index';
import flowsRouter from './routes/flows/index';

// Export Durable Object
export { LogTailingDO } from './logTailingDO';

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

  if (token !== c.env.CLIENT_AUTH_TOKEN) {
    return c.json({ success: false, error: 'Invalid authentication token' }, 403);
  }

  await next();
};

/**
 * Cloudflare SDK Initialization Middleware
 * Initializes SDK with worker's own CLOUDFLARE_TOKEN
 */
const cfInitMiddleware = async (c: any, next: any) => {
  const cf = new Cloudflare({ apiToken: c.env.CLOUDFLARE_TOKEN });

  // Extract account ID from environment
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

  c.set('cf', cf);
  c.set('accountId', accountId);
  c.set('startTime', Date.now());
  c.set('requestId', generateUUID());

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
app.use('/sdk/*', authMiddleware, cfInitMiddleware);
app.use('/flows/*', authMiddleware, cfInitMiddleware);
app.use('/mcp', authMiddleware, cfInitMiddleware);
app.use('/agent', authMiddleware, cfInitMiddleware);

// Mount routers
app.route('/sdk', sdkRouter);
app.route('/flows', flowsRouter);

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
          ],
        });

      case 'tools/call':
        // Route to appropriate endpoint based on tool name
        const toolName = params.name;
        const toolParams = params.arguments;

        // Forward to appropriate internal endpoint
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
      actions.push({ type: 'list_workers', result: workers });
      response = `Found ${workers.length} workers in your account.`;
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
 * Scheduled Handler for TTL Cleanup
 * Runs periodically to clean up expired tokens
 */
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  try {
    const cf = new Cloudflare({ apiToken: env.CLOUDFLARE_TOKEN });
    const db = env.TOKEN_AUDIT_DB;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const now = new Date().toISOString();

    // Find expired tokens
    const expiredTokens = await db
      .prepare("SELECT * FROM managed_tokens WHERE expires_at < ? AND status = 'active'")
      .bind(now)
      .all();

    for (const token of expiredTokens.results || []) {
      try {
        // Delete from Cloudflare
        await cf.user.tokens.delete(token.token_id);

        // Delete from secret store via API
        try {
          await cf.accounts.secrets.delete(
            accountId,
            env.MANAGED_SECRETS_STORE,
            token.secret_key
          );
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
  } catch (error) {
    console.error('Error in scheduled TTL cleanup:', error);
  }
};

/**
 * Tail Handler for Log Streaming
 * Captures logs and streams them to WebSocket clients
 */
export const tail: ExportedHandlerTailHandler = async (events, env, ctx) => {
  try {
    // Get Durable Object stub
    const doId = env.LOG_TAILING_DO.idFromName('log-tailer');
    const stub = env.LOG_TAILING_DO.get(doId);

    // Publish each log entry
    for (const event of events) {
      const logEntry = JSON.stringify({
        timestamp: new Date(event.eventTimestamp).toISOString(),
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

// Default export for RPC (Service Bindings)
export default app;
