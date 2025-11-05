import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const ApplicationIdParamSchema = z.object({
  appId: z.string().openapi({ description: 'Access Application ID' }),
});

const AccessApplicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  type: z.string().optional(),
  session_duration: z.string().optional(),
  auto_redirect_to_identity: z.boolean().optional(),
  enabled: z.boolean().optional(),
  allowed_idps: z.array(z.string()).optional(),
  app_launcher_visible: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).openapi('AccessApplication');

const CreateAccessApplicationSchema = z.object({
  name: z.string().min(1).openapi({ description: 'Application name' }),
  domain: z.string().openapi({ description: 'Application domain' }),
  type: z.string().optional().openapi({ description: 'Application type (self_hosted, saas, etc.)' }),
  session_duration: z.string().optional().default('24h').openapi({ description: 'Session duration' }),
  auto_redirect_to_identity: z.boolean().optional(),
  allowed_idps: z.array(z.string()).optional(),
  app_launcher_visible: z.boolean().optional().default(true),
}).openapi('CreateAccessApplication');

const AccessPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  decision: z.enum(['allow', 'deny', 'non_identity', 'bypass']),
  include: z.array(z.any()),
  exclude: z.array(z.any()).optional(),
  require: z.array(z.any()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).openapi('AccessPolicy');

// List Access Applications
const listApplicationsRoute = createRoute({
  method: 'get',
  path: '/applications',
  summary: 'List Access Applications',
  description: 'List all Zero Trust Access applications',
  tags: ['Access'],
  responses: {
    200: {
      description: 'List of Access applications',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(AccessApplicationSchema)),
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

app.openapi(listApplicationsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'zeroTrust.access.applications.list');

    const response = await cf.zeroTrust.access.applications.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing access applications:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list access applications',
          details: error,
        },
      },
      500
    );
  }
});

// Get Access Application
const getApplicationRoute = createRoute({
  method: 'get',
  path: '/applications/{appId}',
  summary: 'Get Access Application',
  description: 'Get a specific Access application',
  tags: ['Access'],
  request: {
    params: ApplicationIdParamSchema,
  },
  responses: {
    200: {
      description: 'Access application details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AccessApplicationSchema),
        },
      },
    },
    404: {
      description: 'Application not found',
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

app.openapi(getApplicationRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { appId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zeroTrust.access.applications.get');

    const response = await cf.zeroTrust.access.applications.get(appId, { account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting access application:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get access application',
          details: error,
        },
      },
      status
    );
  }
});

// Create Access Application
const createApplicationRoute = createRoute({
  method: 'post',
  path: '/applications',
  summary: 'Create Access Application',
  description: 'Create a new Zero Trust Access application',
  tags: ['Access'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAccessApplicationSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Access application created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AccessApplicationSchema),
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

app.openapi(createApplicationRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'zeroTrust.access.applications.create');

    const response = await cf.zeroTrust.access.applications.create({
      account_id: accountId,
      ...body,
    });

    return c.json(
      {
        success: true,
        result: response,
      },
      201
    );
  } catch (error: any) {
    console.error('Error creating access application:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create access application',
          details: error,
        },
      },
      500
    );
  }
});

// Delete Access Application
const deleteApplicationRoute = createRoute({
  method: 'delete',
  path: '/applications/{appId}',
  summary: 'Delete Access Application',
  description: 'Delete an Access application',
  tags: ['Access'],
  request: {
    params: ApplicationIdParamSchema,
  },
  responses: {
    200: {
      description: 'Application deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    404: {
      description: 'Application not found',
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

app.openapi(deleteApplicationRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { appId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zeroTrust.access.applications.delete');

    await cf.zeroTrust.access.applications.delete(appId, { account_id: accountId });

    return c.json({
      success: true,
      result: { id: appId },
    });
  } catch (error: any) {
    console.error('Error deleting access application:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete access application',
          details: error,
        },
      },
      status
    );
  }
});

// List Access Policies for Application
const listPoliciesRoute = createRoute({
  method: 'get',
  path: '/applications/{appId}/policies',
  summary: 'List Access Policies',
  description: 'List policies for an Access application',
  tags: ['Access'],
  request: {
    params: ApplicationIdParamSchema,
  },
  responses: {
    200: {
      description: 'List of policies',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(AccessPolicySchema)),
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

app.openapi(listPoliciesRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { appId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zeroTrust.access.applications.policies.list');

    const response = await cf.zeroTrust.access.applications.policies.list(appId, { account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing access policies:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list access policies',
          details: error,
        },
      },
      500
    );
  }
});

export default app;
