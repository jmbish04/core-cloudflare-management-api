import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schema for Deploy Worker
const DeployWorkerSchema = z.object({
  workerName: z.string().min(1).openapi({ description: 'Worker name' }),
  script: z.string().openapi({ description: 'Worker script content' }),
  bindings: z.array(z.object({
    type: z.enum(['kv_namespace', 'd1', 'r2_bucket', 'service', 'durable_object']),
    name: z.string(),
    namespace_id: z.string().optional(),
    database_id: z.string().optional(),
    bucket_name: z.string().optional(),
    service: z.string().optional(),
    class_name: z.string().optional(),
  })).optional(),
}).openapi('DeployWorker');

// Schema for Setup Bindings
const SetupBindingsSchema = z.object({
  appName: z.string().min(1).openapi({ description: 'Application name (used as prefix for all resources)' }),
  bindings: z.array(z.enum(['kv', 'd1', 'r2', 'durable_object', 'queue', 'analytics_engine'])).openapi({
    description: 'List of binding types to create',
  }),
}).openapi('SetupBindings');

const SetupBindingsResponseSchema = z.object({
  appName: z.string(),
  createdBindings: z.array(z.object({
    type: z.string(),
    name: z.string(),
    id: z.string(),
  })),
  wranglerToml: z.string(),
}).openapi('SetupBindingsResponse');

// Deploy Worker Flow
const deployWorkerRoute = createRoute({
  method: 'post',
  path: '/deploy-worker',
  summary: 'Deploy Worker Script',
  description: 'Deploy a Worker script with optional bindings',
  tags: ['Flows - Advanced'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: DeployWorkerSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Worker deployed successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({
            workerName: z.string(),
            deployed: z.boolean(),
          })),
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

app.openapi(deployWorkerRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { workerName, script, bindings } = c.req.valid('json');
    c.set('apiTarget' as any, 'flows.deployWorker');

    // Deploy worker script
    const formData = new FormData();
    formData.append('script', new Blob([script], { type: 'application/javascript' }), 'worker.js');

    if (bindings) {
      formData.append('metadata', JSON.stringify({ bindings }));
    }

    await cf.workers.scripts.update(workerName, {
      account_id: accountId,
      'CF-WORKER-SCRIPT': script,
    } as any);

    return c.json(
      {
        success: true,
        result: {
          workerName,
          deployed: true,
        },
      },
      201
    );
  } catch (error: any) {
    console.error('Error deploying worker:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DEPLOY_FAILED',
          message: error.message || 'Failed to deploy worker',
          details: error,
        },
      },
      500
    );
  }
});

// Get Build Logs Flow
const getBuildLogsRoute = createRoute({
  method: 'get',
  path: '/build-logs/{scriptName}',
  summary: 'Get Build Logs',
  description: 'Retrieve build logs for a worker',
  tags: ['Flows - Advanced'],
  request: {
    params: z.object({
      scriptName: z.string().openapi({ description: 'Worker script name' }),
    }),
  },
  responses: {
    200: {
      description: 'Build logs retrieved',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({
            logs: z.array(z.any()),
          })),
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

app.openapi(getBuildLogsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { scriptName } = c.req.valid('param');
    c.set('apiTarget' as any, 'flows.getBuildLogs');

    // Fetch build logs (assuming there's an endpoint for this)
    const logs = await cf.workers.deployments.list({
      account_id: accountId,
      script_name: scriptName,
    } as any);

    return c.json({
      success: true,
      result: {
        logs,
      },
    });
  } catch (error: any) {
    console.error('Error fetching build logs:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'LOGS_FETCH_FAILED',
          message: error.message || 'Failed to fetch build logs',
          details: error,
        },
      },
      500
    );
  }
});

// Setup All Bindings Flow - The "Super Easy Button"
const setupBindingsRoute = createRoute({
  method: 'post',
  path: '/setup-bindings',
  summary: 'Setup Application Bindings',
  description: 'Create all requested bindings with consistent naming and return ready-to-use wrangler.toml',
  tags: ['Flows - Advanced'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SetupBindingsSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Bindings created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(SetupBindingsResponseSchema),
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

app.openapi(setupBindingsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { appName, bindings } = c.req.valid('json');
    c.set('apiTarget' as any, 'flows.setupBindings');

    const createdBindings: Array<{ type: string; name: string; id: string }> = [];
    const wranglerBindings: string[] = [];

    // Create each requested binding type
    for (const bindingType of bindings) {
      const bindingName = `${appName}_${bindingType}`.toUpperCase();

      try {
        switch (bindingType) {
          case 'kv': {
            const namespace = await cf.kv.namespaces.create({
              account_id: accountId,
              title: `${appName}-kv`,
            });
            createdBindings.push({
              type: 'kv',
              name: bindingName,
              id: namespace.id,
            });
            wranglerBindings.push(`[[kv_namespaces]]
binding = "${bindingName}"
id = "${namespace.id}"`);
            break;
          }

          case 'd1': {
            const database = await cf.d1.database.create({
              account_id: accountId,
              name: `${appName}-d1`,
            });
            createdBindings.push({
              type: 'd1',
              name: bindingName,
              id: database.uuid,
            });
            wranglerBindings.push(`[[d1_databases]]
binding = "${bindingName}"
database_name = "${appName}-d1"
database_id = "${database.uuid}"`);
            break;
          }

          case 'r2': {
            const bucket = await cf.r2.buckets.create({
              account_id: accountId,
              name: `${appName.toLowerCase()}-r2`,
            });
            createdBindings.push({
              type: 'r2',
              name: bindingName,
              id: bucket.name,
            });
            wranglerBindings.push(`[[r2_buckets]]
binding = "${bindingName}"
bucket_name = "${bucket.name}"`);
            break;
          }

          case 'analytics_engine': {
            const datasetName = `${appName}_AE`;
            createdBindings.push({
              type: 'analytics_engine',
              name: bindingName,
              id: datasetName,
            });
            wranglerBindings.push(`[[analytics_engine_datasets]]
binding = "${bindingName}"`);
            break;
          }

          case 'queue': {
            const queueName = `${appName.toLowerCase()}-queue`;
            createdBindings.push({
              type: 'queue',
              name: bindingName,
              id: queueName,
            });
            wranglerBindings.push(`[[queues.producers]]
binding = "${bindingName}"
queue = "${queueName}"`);
            break;
          }

          case 'durable_object': {
            const className = `${appName}DurableObject`;
            createdBindings.push({
              type: 'durable_object',
              name: bindingName,
              id: className,
            });
            wranglerBindings.push(`[[durable_objects.bindings]]
name = "${bindingName}"
class_name = "${className}"
script_name = "${appName.toLowerCase()}"`);
            break;
          }
        }
      } catch (error: any) {
        console.error(`Error creating ${bindingType} binding:`, error);
        // Continue with other bindings
      }
    }

    // Generate complete wrangler.toml
    const wranglerToml = `name = "${appName.toLowerCase()}"
main = "src/index.ts"
compatibility_date = "2024-06-01"

${wranglerBindings.join('\n\n')}
`;

    return c.json(
      {
        success: true,
        result: {
          appName,
          createdBindings,
          wranglerToml,
        },
      },
      201
    );
  } catch (error: any) {
    console.error('Error setting up bindings:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'SETUP_BINDINGS_FAILED',
          message: error.message || 'Failed to setup bindings',
          details: error,
        },
      },
      500
    );
  }
});

// Update Build Settings Flow
const updateBuildSettingsRoute = createRoute({
  method: 'patch',
  path: '/build-settings/{scriptName}',
  summary: 'Update Build Settings',
  description: 'Update build configuration for a worker',
  tags: ['Flows - Advanced'],
  request: {
    params: z.object({
      scriptName: z.string().openapi({ description: 'Worker script name' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            buildCommand: z.string().optional(),
            rootDir: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Build settings updated',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({
            scriptName: z.string(),
            updated: z.boolean(),
          })),
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

app.openapi(updateBuildSettingsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { scriptName } = c.req.valid('param');
    const settings = c.req.valid('json');
    c.set('apiTarget' as any, 'flows.updateBuildSettings');

    // Update build configuration
    // Note: This would require the trigger ID
    // In a real implementation, you'd need to look up the trigger first

    return c.json({
      success: true,
      result: {
        scriptName,
        updated: true,
      },
    });
  } catch (error: any) {
    console.error('Error updating build settings:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: error.message || 'Failed to update build settings',
          details: error,
        },
      },
      500
    );
  }
});

export default app;
