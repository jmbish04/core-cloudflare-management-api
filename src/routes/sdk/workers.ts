import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const ScriptNameParamSchema = z.object({
  scriptName: z.string().min(1).openapi({ description: 'Worker script name' }),
});

const WorkerScriptSchema = z.object({
  id: z.string(),
  created_on: z.string(),
  modified_on: z.string(),
  deployment_id: z.string().optional(),
  logpush: z.boolean().optional(),
  etag: z.string().optional(),
  handlers: z.array(z.string()).optional(),
  last_deployed_from: z.string().optional(),
}).openapi('WorkerScript');

// List Workers
const listWorkersRoute = createRoute({
  method: 'get',
  path: '/scripts',
  summary: 'List Workers',
  description: 'List all Worker scripts in the account',
  tags: ['Workers'],
  responses: {
    200: {
      description: 'List of Worker scripts',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(WorkerScriptSchema)),
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

app.openapi(listWorkersRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'workers.scripts.list');

    const response = await cf.workers.scripts.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing workers:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list workers',
          details: error,
        },
      },
      500
    );
  }
});

// Get Worker Script
const getWorkerRoute = createRoute({
  method: 'get',
  path: '/scripts/{scriptName}',
  summary: 'Get Worker Script',
  description: 'Get details of a specific Worker script',
  tags: ['Workers'],
  request: {
    params: ScriptNameParamSchema,
  },
  responses: {
    200: {
      description: 'Worker script details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkerScriptSchema),
        },
      },
    },
    404: {
      description: 'Worker not found',
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

app.openapi(getWorkerRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { scriptName } = c.req.valid('param');
    c.set('apiTarget' as any, 'workers.scripts.get');

    const response = await cf.workers.scripts.get(scriptName, { account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting worker:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get worker',
          details: error,
        },
      },
      status
    );
  }
});

// Delete Worker Script
const deleteWorkerRoute = createRoute({
  method: 'delete',
  path: '/scripts/{scriptName}',
  summary: 'Delete Worker Script',
  description: 'Delete a Worker script',
  tags: ['Workers'],
  request: {
    params: ScriptNameParamSchema,
  },
  responses: {
    200: {
      description: 'Worker deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    404: {
      description: 'Worker not found',
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

app.openapi(deleteWorkerRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { scriptName } = c.req.valid('param');
    c.set('apiTarget' as any, 'workers.scripts.delete');

    await cf.workers.scripts.delete(scriptName, { account_id: accountId });

    return c.json({
      success: true,
      result: { id: scriptName },
    });
  } catch (error: any) {
    console.error('Error deleting worker:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete worker',
          details: error,
        },
      },
      status
    );
  }
});

// List Deployments
const listDeploymentsRoute = createRoute({
  method: 'get',
  path: '/deployments',
  summary: 'List Worker Deployments',
  description: 'List all Worker deployments in the account',
  tags: ['Workers'],
  responses: {
    200: {
      description: 'List of Worker deployments',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(z.any())),
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

app.openapi(listDeploymentsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'workers.deployments.list');

    const response = await cf.workers.deployments.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing deployments:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list deployments',
          details: error,
        },
      },
      500
    );
  }
});

// Get Account Settings
const getAccountSettingsRoute = createRoute({
  method: 'get',
  path: '/account/settings',
  summary: 'Get Workers Account Settings',
  description: 'Get Worker account settings',
  tags: ['Workers'],
  responses: {
    200: {
      description: 'Account settings',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.any()),
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

app.openapi(getAccountSettingsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'workers.accountSettings.get');

    const response = await cf.workers.accountSettings.get({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting account settings:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get account settings',
          details: error,
        },
      },
      500
    );
  }
});

export default app;
