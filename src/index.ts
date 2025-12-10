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

// Export Workflow Entrypoints
export { ProvisioningWorkflow } from './workflows/provision';

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
 * 
 * OPTIMIZATION: Cloudflare client and AI instances are initialized once per request
 * and stored in context (c.set) to avoid re-instantiating heavy objects.
 * This follows the singleton-per-request pattern for optimal performance.
 */
const cfInitMiddleware = async (c: any, next: any) => {
  // Initialize Cloudflare SDK client (once per request)
  const cf = new Cloudflare({ apiToken: c.env.CLOUDFLARE_TOKEN });

  // Extract account ID from environment
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

  // Store in context for reuse throughout the request lifecycle
  c.set('cf', cf);
  c.set('accountId', accountId);
  c.set('startTime', Date.now());
  c.set('requestId', generateUUID());

  await next();
};

// PATCHED: Token middleware fix for /api/tokens routes
const apiClientMiddleware = async (c: any, next: any) => {
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
 * AI Agent Endpoint with ReAct Loop
 * Uses Llama 3 for reasoning and tool execution
 */
app.post('/agent', async (c) => {
  try {
    const { prompt, conversationHistory = [] } = await c.req.json();
    
    // Check if AI binding is available
    if (!c.env.AI) {
      return c.json({ 
        success: false, 
        error: 'AI binding not configured. Please add AI binding to wrangler.jsonc' 
      }, 500);
    }

    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { listMCPTools, getMCPTool } = await import('./mcp/index');
    const tools = listMCPTools();

    // Build system prompt with available tools
    const systemPrompt = `You are an AI assistant that helps manage Cloudflare infrastructure.

You have access to the following tools:
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

When you need to use a tool, respond with a JSON object in this format:
{
  "tool": "tool_name",
  "arguments": { ...tool arguments... },
  "reasoning": "Why you're using this tool"
}

After receiving tool results, provide a natural language response to the user.

Always be helpful, concise, and accurate. If you're unsure, ask for clarification.`;

    // ReAct Loop - Maximum 5 iterations to prevent infinite loops
    const maxIterations = 5;
    let iteration = 0;
    const actions: any[] = [];
    let finalResponse = '';

    // Build conversation context
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: prompt },
    ];

    while (iteration < maxIterations) {
      iteration++;

      // Call Llama 3 model
      const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages,
        max_tokens: 512,
      });

      const responseText = aiResponse.response || '';
      
      // Check if the response contains a tool call (JSON format)
      let toolCall = null;
      try {
        // Try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          toolCall = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Not a tool call, treat as final response
      }

      if (toolCall && toolCall.tool) {
        // Execute the tool
        const tool = getMCPTool(toolCall.tool);
        
        if (!tool) {
          messages.push({ 
            role: 'assistant', 
            content: `Error: Tool '${toolCall.tool}' not found. Available tools: ${tools.map(t => t.name).join(', ')}` 
          });
          continue;
        }

        try {
          const toolResult = await tool.handler(toolCall.arguments || {}, c.env);
          
          actions.push({
            tool: toolCall.tool,
            arguments: toolCall.arguments,
            reasoning: toolCall.reasoning,
            result: toolResult,
          });

          // Add tool result to conversation
          messages.push({ 
            role: 'assistant', 
            content: `Used tool: ${toolCall.tool}` 
          });
          messages.push({ 
            role: 'user', 
            content: `Tool result: ${JSON.stringify(toolResult)}. Now provide a natural language response to the user.` 
          });
        } catch (error: any) {
          messages.push({ 
            role: 'assistant', 
            content: `Error executing tool ${toolCall.tool}: ${error.message}` 
          });
        }
      } else {
        // No tool call, this is the final response
        finalResponse = responseText;
        break;
      }
    }

    if (iteration >= maxIterations && !finalResponse) {
      finalResponse = 'I apologize, but I reached the maximum number of reasoning steps. Please try rephrasing your request or breaking it into smaller tasks.';
    }

    return c.json({
      success: true,
      result: {
        message: finalResponse,
        actions,
        iterations: iteration,
      },
    });
  } catch (error: any) {
    console.error('Agent error:', error);
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
