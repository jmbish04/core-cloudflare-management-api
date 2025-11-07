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
};

/**
 * Generate OpenAPI 3.1.0 specification
 */
export function generateOpenAPISpec(baseUrl: string): any {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Cloudflare Worker Management API',
      description: 'Wrangler as a Service - Comprehensive API for managing Cloudflare Workers, deployments, CI/CD, and infrastructure',
      version: '1.0.0',
      contact: {
        name: 'API Support',
        url: baseUrl,
      },
    },
    servers: [
      {
        url: baseUrl,
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
      '/sdk/workers/scripts': {
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
    return { type: 'string', enum: [zodSchema._def.value] };
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
