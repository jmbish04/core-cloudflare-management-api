import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Agent request/response schemas
const AgentRequestSchema = z.object({
  prompt: z.string().min(1).openapi({
    description: 'Natural language prompt for the AI agent',
    example: 'List all my workers and create a new KV namespace called sessions',
  }),
  conversation_id: z.string().optional().openapi({
    description: 'Optional conversation ID for maintaining context across requests',
  }),
}).openapi('AgentRequest');

const AgentResponseSchema = z.object({
  message: z.string().openapi({
    description: 'AI agent response message',
  }),
  actions: z.array(z.object({
    type: z.string(),
    description: z.string(),
    result: z.any(),
  })).openapi({
    description: 'List of actions performed by the agent',
  }),
  conversation_id: z.string().openapi({
    description: 'Conversation ID for maintaining context',
  }),
}).openapi('AgentResponse');

// AI Agent endpoint
const agentRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'AI Agent Interface',
  description: 'Send natural language prompts to manage Cloudflare infrastructure using AI',
  tags: ['AI Agent'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: AgentRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Agent processed the request',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AgentResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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

app.openapi(agentRoute, async (c) => {
  try {
    const { prompt, conversation_id } = c.req.valid('json');
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'agent.process');

    // Generate a conversation ID if not provided
    const conversationId = conversation_id || crypto.randomUUID();

    // In a production implementation, you would:
    // 1. Use Cloudflare AI (Workers AI) to process the prompt
    // 2. Use a Durable Object to maintain conversation state
    // 3. Use Workflows to orchestrate multi-step operations
    // 4. Use Queues for async tasks

    // For now, we'll do basic intent detection and routing
    const actions: Array<{ type: string; description: string; result: any }> = [];
    let responseMessage = '';

    const promptLower = prompt.toLowerCase();

    // Intent detection (simplified)
    if (promptLower.includes('list') && promptLower.includes('worker')) {
      // List workers
      try {
        const workers = await cf.workers.scripts.list({ account_id: accountId });
        actions.push({
          type: 'list_workers',
          description: 'Listed all Worker scripts',
          result: workers,
        });
        responseMessage = `Found ${workers.length} Worker scripts in your account.`;
      } catch (error: any) {
        responseMessage = `Error listing workers: ${error.message}`;
      }
    } else if (promptLower.includes('create') && promptLower.includes('kv')) {
      // Extract KV namespace name
      const kvMatch = prompt.match(/(?:called|named)\s+['"]?(\w+[-\w]*)/i);
      const kvName = kvMatch ? kvMatch[1] : 'default-kv';

      try {
        const namespace = await cf.kv.namespaces.create({
          account_id: accountId,
          title: kvName,
        });
        actions.push({
          type: 'create_kv_namespace',
          description: `Created KV namespace '${kvName}'`,
          result: namespace,
        });
        responseMessage = `Successfully created KV namespace '${kvName}' with ID: ${namespace.id}`;
      } catch (error: any) {
        responseMessage = `Error creating KV namespace: ${error.message}`;
      }
    } else if (promptLower.includes('create') && promptLower.includes('d1')) {
      // Extract D1 database name
      const d1Match = prompt.match(/(?:called|named)\s+['"]?(\w+[-\w]*)/i);
      const dbName = d1Match ? d1Match[1] : 'default-db';

      try {
        const database = await cf.d1.database.create({
          account_id: accountId,
          name: dbName,
        });
        actions.push({
          type: 'create_d1_database',
          description: `Created D1 database '${dbName}'`,
          result: database,
        });
        responseMessage = `Successfully created D1 database '${dbName}' with UUID: ${database.uuid}`;
      } catch (error: any) {
        responseMessage = `Error creating D1 database: ${error.message}`;
      }
    } else if (promptLower.includes('deploy') && promptLower.includes('worker')) {
      responseMessage = 'To deploy a Worker, I need the worker name and script content. You can use the /api/flows/advanced/deploy-worker endpoint with the script details.';
    } else if (promptLower.includes('help') || promptLower.includes('what can you do')) {
      responseMessage = `I can help you manage your Cloudflare infrastructure! Here's what I can do:

🔧 **Workers & Pages**
- List, create, deploy, and delete Workers
- Manage Pages projects and deployments

💾 **Storage**
- Create and manage KV namespaces
- Create D1 databases
- Create R2 buckets

🌐 **DNS & Networking**
- Manage DNS records
- Create and configure Cloudflare Tunnels
- Manage zones and settings

🔐 **Security**
- Configure Zero Trust Access applications
- Manage API tokens

🔄 **Workflows**
- Setup CI/CD with GitHub
- Create all bindings for an app
- Deploy complete applications

Just ask me in natural language, like:
- "List all my workers"
- "Create a KV namespace called sessions"
- "Setup bindings for my app called todo-app with kv, d1, and r2"
- "Create a worker with GitHub CI/CD"`;
    } else {
      // Use AI to process the prompt (in production, this would call Workers AI)
      responseMessage = `I understand you want to: "${prompt}".

In a production environment, I would use Cloudflare Workers AI to better understand your intent and execute the appropriate operations.

For now, try asking me to:
- List workers, pages, or storage resources
- Create KV namespaces or D1 databases
- Get help with available commands

Or use the structured API endpoints for more complex operations.`;
    }

    return c.json({
      success: true,
      result: {
        message: responseMessage,
        actions,
        conversation_id: conversationId,
      },
    });
  } catch (error: any) {
    console.error('Error in agent endpoint:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'AGENT_ERROR',
          message: error.message || 'Failed to process agent request',
          details: error,
        },
      },
      500
    );
  }
});

// Agent capabilities endpoint
const capabilitiesRoute = createRoute({
  method: 'get',
  path: '/capabilities',
  summary: 'Get Agent Capabilities',
  description: 'List all capabilities of the AI agent',
  tags: ['AI Agent'],
  responses: {
    200: {
      description: 'Agent capabilities',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({
            categories: z.array(z.object({
              name: z.string(),
              capabilities: z.array(z.string()),
            })),
          })),
        },
      },
    },
  },
});

app.openapi(capabilitiesRoute, async (c) => {
  return c.json({
    success: true,
    result: {
      categories: [
        {
          name: 'Workers Management',
          capabilities: [
            'List all Workers',
            'Get Worker details',
            'Deploy Worker script',
            'Delete Worker',
            'Setup GitHub CI/CD',
            'View deployment logs',
          ],
        },
        {
          name: 'Pages Management',
          capabilities: [
            'List Pages projects',
            'Create Pages project',
            'View deployments',
            'Configure build settings',
          ],
        },
        {
          name: 'Storage Management',
          capabilities: [
            'Create KV namespaces',
            'Create D1 databases',
            'Create R2 buckets',
            'List storage resources',
          ],
        },
        {
          name: 'DNS & Networking',
          capabilities: [
            'Manage DNS records',
            'Create Cloudflare Tunnels',
            'Configure zones',
          ],
        },
        {
          name: 'Security',
          capabilities: [
            'Configure Access applications',
            'Manage API tokens',
            'Setup authentication',
          ],
        },
        {
          name: 'Workflows',
          capabilities: [
            'Setup complete application stacks',
            'Create all bindings with consistent naming',
            'Configure CI/CD pipelines',
            'Generate wrangler.toml configurations',
          ],
        },
      ],
    },
  });
});

export default app;
