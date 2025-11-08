import { z } from 'zod';

/**
 * OpenAPI 3.1.0 Schema Generator
 * Generates compliant OpenAPI specs for OpenAI Custom Actions
 */

// Zod schemas for request/response validation
export const schemas = {
  // Error response
  ErrorResponse: z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),

  // Success response wrapper
  SuccessResponse: z.object({
    success: z.literal(true),
    result: z.any(),
    message: z.string().optional(),
  }),

  // Health check
  HealthCheckResponse: z.object({
    status: z.string(),
    version: z.string(),
    timestamp: z.string(),
  }),

  // Token creation
  CreateTokenRequest: z.object({
    name: z.string().describe('Token name'),
    purpose: z.string().describe('What this token will be used for'),
    permissions: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
    })),
    ttl_days: z.number().optional().describe('Days until expiration'),
    policies: z.array(z.any()),
  }),

  // Worker deployment
  DeployWorkerRequest: z.object({
    script_name: z.string().describe('Worker script name'),
    content: z.string().describe('Worker JavaScript/TypeScript content'),
    compatibility_date: z.string().optional().default('2024-06-01'),
    bindings: z.object({
      kv: z.array(z.object({ binding: z.string(), id: z.string() })).optional(),
      d1: z.array(z.object({ binding: z.string(), database_id: z.string() })).optional(),
      r2: z.array(z.object({ binding: z.string(), bucket_name: z.string() })).optional(),
    }).optional(),
    vars: z.record(z.string()).optional(),
  }),

  // Project creation
  CreateProjectRequest: z.object({
    projectName: z.string(),
    bindings: z.array(z.enum(['kv', 'd1', 'r2', 'analytics_engine', 'queue'])).optional(),
    githubOwner: z.string().optional(),
    githubRepo: z.string().optional(),
  }),

  // CI/CD setup
  SetupCICDRequest: z.object({
    worker_name: z.string(),
    github_owner: z.string(),
    github_repo: z.string(),
    production_branch: z.string().optional().default('main'),
    auto_deploy: z.boolean().optional().default(true),
  }),

  // Health check request
  HealthCheckWorkersRequest: z.object({
    days: z.number().optional().default(7).describe('Check workers updated in last N days'),
    include_observability: z.boolean().optional().default(true),
    filter_pattern: z.string().optional().describe('Filter workers by name pattern'),
  }),

  // Meta API Gateway request
  MetaApiCallRequest: z.object({
    product: z.string().describe(`
Cloudflare product area. Infer from user intent:
- "workers" for code, scripts, or deploy actions
- "r2" for object storage and buckets
- "d1" for SQL databases
- "kv" for key-value storage
- "vectorize" for AI vector indexes
- "ai" for model inference and Workers AI
- "pages" for Pages projects
- "tokens" for API token management
`),
    action: z.string().optional().describe(`
Optional semantic action name. Infer from context:
- "list" or "list_*" → typically GET
- "create" or "deploy" → typically POST
- "update" or "modify" → typically PUT/PATCH
- "delete" or "remove" → typically DELETE
- "run" or "execute" → typically POST
If method is not provided, it will be inferred from action.
`),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe(`
HTTP method. If not provided, will be inferred from action:
- "list" → GET
- "create", "deploy", "run" → POST
- "update" → PUT/PATCH
- "delete" → DELETE
Defaults to GET if action is not provided.
`),
    params: z.record(z.any()).optional().describe('Path or query parameters to inject into endpoint URL (e.g. {account_id}, {zone_id}, {script_name})'),
    body: z.record(z.any()).optional().describe('Optional JSON request body for POST/PUT/PATCH operations'),
  }),
};

/**
 * Generate OpenAPI 3.1.0 specification
 */
export function generateOpenAPISpec(baseUrl: string, overrideBaseUrl?: string): any {
  const serverUrl = overrideBaseUrl || baseUrl;
  return {
    openapi: '3.1.0',
    info: {
      title: 'Cloudflare Worker Management API',
      description: `
Conversational meta-API for managing and querying Cloudflare services.

💬 The model may ask questions naturally to gather required details.
It can infer default values (e.g. GET for listing, POST for creation)
and should confirm actions conversationally before execution.

**Example dialogue:**

User: "List my R2 buckets"
→ GPT infers { product: "r2", method: "GET" }

User: "Deploy my worker"
→ GPT asks: "Can you share the script name or code?" and then calls POST /api/call
  with { product: "workers", action: "deploy", body: {...} }

**How it works:**
- The model should infer reasonable defaults (GET for listing, POST for creating)
- Ask follow-up questions naturally if parameters are missing
- Use the /api/meta/help endpoint to discover available products and actions
- The API will automatically infer HTTP methods from action names if not provided

**Supported products:**
- workers: Cloudflare Workers scripts, deployments, settings
- r2: Object storage buckets
- d1: SQL databases
- kv: Key-value namespaces
- vectorize: AI vector indexes
- ai: Workers AI model inference
- pages: Pages projects
- tokens: API token management
`,
      version: '1.0.0',
      contact: {
        name: 'API Support',
        url: serverUrl,
      },
    },
    servers: [
      {
        url: serverUrl,
        description: 'Production server',
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Authentication token for API access',
        },
      },
      schemas: {
        Error: zodToOpenAPISchema(schemas.ErrorResponse),
        Success: zodToOpenAPISchema(schemas.SuccessResponse),
        HealthCheck: zodToOpenAPISchema(schemas.HealthCheckResponse),
        CreateTokenRequest: zodToOpenAPISchema(schemas.CreateTokenRequest),
        DeployWorkerRequest: zodToOpenAPISchema(schemas.DeployWorkerRequest),
        CreateProjectRequest: zodToOpenAPISchema(schemas.CreateProjectRequest),
        SetupCICDRequest: zodToOpenAPISchema(schemas.SetupCICDRequest),
        HealthCheckWorkersRequest: zodToOpenAPISchema(schemas.HealthCheckWorkersRequest),
        MetaApiCallRequest: zodToOpenAPISchema(schemas.MetaApiCallRequest),
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Check if the API is operational',
          operationId: 'healthCheck',
          security: [],
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthCheck' },
                },
              },
            },
          },
        },
      },
      '/flows/token/create': {
        post: {
          summary: 'Create managed API token',
          description: 'Create a Cloudflare API token with secure storage and audit trail',
          operationId: 'createManagedToken',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateTokenRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Token created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/flows/deploy/from-content': {
        post: {
          summary: 'Deploy worker from content',
          description: 'Deploy a Cloudflare Worker from JavaScript/TypeScript content',
          operationId: 'deployWorkerFromContent',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeployWorkerRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Worker deployed successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/flows/project/create': {
        post: {
          summary: 'Create project with bindings',
          description: 'Create a complete project with KV, D1, R2, and other bindings',
          operationId: 'createProject',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateProjectRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Project created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' },
                },
              },
            },
          },
        },
      },
      '/flows/cicd/setup': {
        post: {
          summary: 'Setup CI/CD for worker',
          description: 'Configure CI/CD pipeline for an existing worker',
          operationId: 'setupCICD',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SetupCICDRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'CI/CD configured successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' },
                },
              },
            },
          },
        },
      },
      '/flows/health/check-recent-workers': {
        post: {
          summary: 'Check worker health',
          description: 'Monitor health of workers updated in the last N days',
          operationId: 'checkWorkerHealth',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheckWorkersRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Health check completed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' },
                },
              },
            },
          },
        },
      },
      '/api/raw/workers/scripts': {
        get: {
          summary: 'List workers',
          description: 'Get list of all Cloudflare Workers',
          operationId: 'listWorkers',
          responses: {
            '200': {
              description: 'List of workers',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Success' },
                },
              },
            },
          },
        },
      },
      '/api/call': {
        post: {
          summary: 'Perform a Cloudflare API call (Conversational Meta-API)',
          description: `
The model may ask one short follow-up if details are missing. If product/method omitted, the server consults an internal coach to infer them.

The API automatically infers HTTP methods from action names:
- "list" or "get" → GET
- "create", "deploy", "run" → POST
- "update" → PUT
- "modify" → PATCH
- "delete" or "remove" → DELETE

If method is omitted, it will be inferred from action. If action is also omitted, method defaults to GET.
Product names are case-insensitive.

**Best practices:**
- For simple queries, only provide product and let the API infer the rest
- For complex operations, provide full details including body
- Use /api/meta/help to discover available capabilities
- Ask users conversationally for missing required parameters
`,
          operationId: 'cloudflare_meta_api_call',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MetaApiCallRequest' },
                examples: {
                  listWorkers: {
                    summary: 'List Cloudflare Workers',
                    description: 'Example of a simple list request. Method can be omitted and will default to GET.',
                    value: {
                      product: 'workers',
                      action: 'list_scripts',
                    },
                  },
                  listWorkersMinimal: {
                    summary: 'List Workers (minimal)',
                    description: 'Minimal request - only product is required for listing operations.',
                    value: {
                      product: 'workers',
                    },
                  },
                  listR2Buckets: {
                    summary: 'List R2 buckets',
                    description: 'List all R2 buckets in the account.',
                    value: {
                      product: 'r2',
                      action: 'list_buckets',
                    },
                  },
                  createBucket: {
                    summary: 'Create R2 bucket',
                    description: 'Create a new R2 bucket with a name.',
                    value: {
                      product: 'r2',
                      action: 'create_bucket',
                      method: 'POST',
                      body: { name: 'my-bucket' },
                    },
                  },
                  deployWorker: {
                    summary: 'Deploy a Worker script',
                    description: 'Deploy a new Worker script with content.',
                    value: {
                      product: 'workers',
                      action: 'deploy',
                      method: 'POST',
                      params: { script_name: 'hello-world' },
                      body: {
                        script: "export default { fetch() { return new Response('Hi!') } }",
                      },
                    },
                  },
                  runAIPrompt: {
                    summary: 'Run AI model inference',
                    description: 'Execute a Workers AI model with text input.',
                    value: {
                      product: 'ai',
                      action: 'run',
                      method: 'POST',
                      body: {
                        model: '@cf/meta/llama-2-7b-chat-int8',
                        text: ['Hello, how are you?'],
                      },
                    },
                  },
                  listD1Databases: {
                    summary: 'List D1 databases',
                    description: 'List all D1 databases in the account.',
                    value: {
                      product: 'd1',
                      action: 'list_databases',
                    },
                  },
                  listKVNamespaces: {
                    summary: 'List KV namespaces',
                    description: 'List all KV namespaces in the account.',
                    value: {
                      product: 'kv',
                      action: 'list_namespaces',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful Cloudflare API response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      result: { type: 'object' },
                      errors: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Needs one clarification or invalid input',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      needs_clarification: { type: 'boolean' },
                      message: { type: 'string' },
                      error: { type: 'string' },
                      details: { type: 'object' },
                    },
                  },
                  example: {
                    success: false,
                    needs_clarification: true,
                    message: 'Which product—workers, r2, d1, vectorize, ai?',
                  },
                },
              },
            },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/api/meta/help': {
        get: {
          summary: 'List available products and actions',
          description: `
Returns a discoverable list of supported Cloudflare products and common actions.
GPT Actions will often hit this first on a cold start to discover capabilities.

This endpoint helps the model understand what operations are available without
having to guess or ask the user for every detail.
`,
          operationId: 'getMetaHelp',
          responses: {
            '200': {
              description: 'Supported endpoints list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      result: {
                        type: 'object',
                        properties: {
                          products: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'List of available Cloudflare products',
                          },
                          mappings: {
                            type: 'object',
                            description: 'Detailed mappings for each product with base paths and verbs',
                            additionalProperties: {
                              type: 'object',
                              properties: {
                                permission: { type: 'string' },
                                base_path: { type: 'string' },
                                verbs: { type: 'string' },
                                actions: {
                                  type: 'array',
                                  items: { type: 'string' },
                                },
                              },
                            },
                          },
                          usage: {
                            type: 'object',
                            description: 'Usage examples and guidance',
                            properties: {
                              description: { type: 'string' },
                              examples: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    product: { type: 'string' },
                                    action: { type: 'string' },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    success: true,
                    result: {
                      products: ['workers', 'r2', 'd1', 'kv', 'vectorize', 'ai', 'pages', 'tokens'],
                      mappings: {
                        workers: {
                          permission: 'Workers Scripts:Edit',
                          base_path: '/accounts/{account_id}/workers/scripts',
                          verbs: 'GET,POST,PUT,DELETE',
                          actions: ['list', 'deploy', 'delete'],
                        },
                        r2: {
                          permission: 'R2:Edit',
                          base_path: '/accounts/{account_id}/r2/buckets',
                          verbs: 'GET,POST,DELETE',
                          actions: ['list_buckets', 'create_bucket', 'delete_bucket'],
                        },
                        vectorize: {
                          permission: 'Vectorize:Edit',
                          base_path: '/accounts/{account_id}/vectorize/indexes',
                          verbs: 'GET,POST,DELETE',
                          actions: ['list_indexes', 'query', 'delete_index'],
                        },
                        ai: {
                          permission: 'Workers AI:Edit',
                          base_path: '/accounts/{account_id}/ai/run',
                          verbs: 'POST',
                          actions: ['list_models', 'run'],
                        },
                      },
                      usage: {
                        description: 'Use /api/call with product and optional action/method to make API calls',
                        examples: [
                          { product: 'workers', action: 'list_scripts' },
                          { product: 'r2', action: 'list_buckets' },
                          { product: 'd1', action: 'list_databases' },
                        ],
                      },
                    },
                  },
                },
              },
            },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/api/coach': {
        post: {
          summary: 'Reasoning coach (optional direct access)',
          description: `
Lets the model ask the coach for a suggestion explicitly. Usually not necessary because /api/call auto-consults the coach when needed.

This endpoint allows GPT to directly consult the context coach for intent interpretation.
`,
          operationId: 'coachSuggest',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    prompt: {
                      type: 'string',
                      description: 'Natural language prompt describing the user intent',
                    },
                    context: {
                      type: 'object',
                      additionalProperties: true,
                      description: 'Optional context about recent conversation or hints',
                    },
                  },
                  required: ['prompt'],
                },
                examples: {
                  inferWorkers: {
                    summary: 'Workers listing intent',
                    value: {
                      prompt: 'list my workers',
                      context: { recent: 'user mentioned Workers' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Coach suggestion',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      confidence: { type: 'number', minimum: 0, maximum: 1 },
                      product: { type: 'string', nullable: true },
                      action: { type: 'string', nullable: true },
                      method: {
                        type: 'string',
                        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                        nullable: true,
                      },
                      next_step: { type: 'string', enum: ['clarify', 'execute'] },
                      coach_message: { type: 'string' },
                    },
                  },
                  example: {
                    confidence: 0.86,
                    product: 'workers',
                    action: 'list',
                    method: 'GET',
                    next_step: 'execute',
                    coach_message: 'Looks like they want a Workers list; proceed to fetch scripts.',
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '500': { $ref: '#/components/responses/ServerError' },
            '503': {
              description: 'Coach service not available',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/telemetry/stats': {
        get: {
          summary: 'Get coach telemetry statistics',
          description: 'Returns rolling statistics about coach inferences, confidence scores, and clarification rates.',
          operationId: 'getTelemetryStats',
          parameters: [
            {
              name: 'days',
              in: 'query',
              schema: { type: 'integer', default: 7 },
              description: 'Number of days to look back for statistics',
            },
          ],
          responses: {
            '200': {
              description: 'Telemetry statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      result: {
                        type: 'object',
                        properties: {
                          stats: {
                            type: 'object',
                            properties: {
                              total: { type: 'integer' },
                              clarifications: { type: 'integer' },
                              executed: { type: 'integer' },
                              avg_confidence: { type: 'number' },
                            },
                          },
                          recent: { type: 'array' },
                          total_recent: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
      '/api/telemetry/tune': {
        post: {
          summary: 'Manually trigger coach threshold auto-tuning',
          description: 'Triggers the auto-tuning algorithm to adjust the clarification threshold based on recent telemetry data.',
          operationId: 'tuneThreshold',
          responses: {
            '200': {
              description: 'Tuning result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      result: {
                        type: 'object',
                        properties: {
                          clarRate: { type: 'number' },
                          avgConf: { type: 'number' },
                          newThreshold: { type: 'number' },
                        },
                      },
                    },
                  },
                  example: {
                    success: true,
                    result: {
                      clarRate: 0.18,
                      avgConf: 0.82,
                      newThreshold: 0.804,
                    },
                  },
                },
              },
            },
            '500': { $ref: '#/components/responses/ServerError' },
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  };
}

/**
 * Convert Zod schema to OpenAPI schema
 */
function zodToOpenAPISchema(zodSchema: z.ZodType<any>): any {
  // This is a simplified converter - in production use @asteasolutions/zod-to-openapi
  if (zodSchema instanceof z.ZodObject) {
    const shape = zodSchema._def.shape();
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToOpenAPISchema(value as z.ZodType<any>);
      if (!(value as any).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (zodSchema instanceof z.ZodString) {
    return { type: 'string', description: zodSchema.description };
  }

  if (zodSchema instanceof z.ZodNumber) {
    return { type: 'number', description: zodSchema.description };
  }

  if (zodSchema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: zodSchema.description };
  }

  if (zodSchema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToOpenAPISchema(zodSchema._def.type),
    };
  }

  if (zodSchema instanceof z.ZodLiteral) {
    const value = zodSchema._def.value;
    // Handle boolean literals - OpenAPI doesn't support boolean enums, just return type
    if (typeof value === 'boolean') {
      return { type: 'boolean', const: value };
    }
    // Handle number literals
    if (typeof value === 'number') {
      return { type: 'number', const: value };
    }
    // Handle string literals (default)
    return { type: 'string', const: String(value) };
  }

  if (zodSchema instanceof z.ZodEnum) {
    return { type: 'string', enum: zodSchema._def.values };
  }

  if (zodSchema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToOpenAPISchema(zodSchema._def.valueType),
    };
  }

  return { type: 'string' };
}

/**
 * Convert OpenAPI JSON to YAML
 */
export function jsonToYaml(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      yaml += `${spaces}${key}:\n${jsonToYaml(value, indent + 1)}`;
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object') {
          yaml += `${spaces}- \n${jsonToYaml(item, indent + 2)}`;
        } else {
          yaml += `${spaces}- ${item}\n`;
        }
      }
    } else if (typeof value === 'string') {
      yaml += `${spaces}${key}: "${value}"\n`;
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}
