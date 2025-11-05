import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const TokenIdParamSchema = z.object({
  tokenId: z.string().openapi({ description: 'API Token ID' }),
});

const APITokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  issued_on: z.string().optional(),
  modified_on: z.string().optional(),
  not_before: z.string().optional(),
  expires_on: z.string().optional(),
  policies: z.array(z.any()).optional(),
  condition: z.any().optional(),
}).openapi('APIToken');

const CreateTokenSchema = z.object({
  name: z.string().min(1).openapi({ description: 'Token name' }),
  policies: z.array(z.object({
    id: z.string().optional(),
    effect: z.enum(['allow', 'deny']),
    resources: z.record(z.string()),
    permission_groups: z.array(z.object({
      id: z.string(),
      name: z.string().optional(),
    })),
  })).openapi({ description: 'Token policies' }),
  not_before: z.string().optional().openapi({ description: 'Token valid after this time' }),
  expires_on: z.string().optional().openapi({ description: 'Token expiration time' }),
  condition: z.object({
    request_ip: z.object({
      in: z.array(z.string()).optional(),
      not_in: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
}).openapi('CreateToken');

// List API Tokens
const listTokensRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List API Tokens',
  description: 'List all API tokens',
  tags: ['API Tokens'],
  responses: {
    200: {
      description: 'List of API tokens',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(APITokenSchema)),
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

app.openapi(listTokensRoute, async (c) => {
  try {
    const cf = c.get('cf');
    c.set('apiTarget' as any, 'user.tokens.list');

    const response = await cf.user.tokens.list();

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing tokens:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list tokens',
          details: error,
        },
      },
      500
    );
  }
});

// Get API Token
const getTokenRoute = createRoute({
  method: 'get',
  path: '/{tokenId}',
  summary: 'Get API Token',
  description: 'Get details of a specific API token',
  tags: ['API Tokens'],
  request: {
    params: TokenIdParamSchema,
  },
  responses: {
    200: {
      description: 'Token details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(APITokenSchema),
        },
      },
    },
    404: {
      description: 'Token not found',
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

app.openapi(getTokenRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { tokenId } = c.req.valid('param');
    c.set('apiTarget' as any, 'user.tokens.get');

    const response = await cf.user.tokens.get(tokenId);

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting token:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get token',
          details: error,
        },
      },
      status
    );
  }
});

// Create API Token
const createTokenRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create API Token',
  description: 'Create a new API token',
  tags: ['API Tokens'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateTokenSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Token created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({
            id: z.string(),
            name: z.string(),
            value: z.string(),
          })),
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

app.openapi(createTokenRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'user.tokens.create');

    const response = await cf.user.tokens.create(body);

    return c.json(
      {
        success: true,
        result: response,
      },
      201
    );
  } catch (error: any) {
    console.error('Error creating token:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create token',
          details: error,
        },
      },
      500
    );
  }
});

// Delete API Token
const deleteTokenRoute = createRoute({
  method: 'delete',
  path: '/{tokenId}',
  summary: 'Delete API Token',
  description: 'Delete an API token',
  tags: ['API Tokens'],
  request: {
    params: TokenIdParamSchema,
  },
  responses: {
    200: {
      description: 'Token deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    404: {
      description: 'Token not found',
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

app.openapi(deleteTokenRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { tokenId } = c.req.valid('param');
    c.set('apiTarget' as any, 'user.tokens.delete');

    await cf.user.tokens.delete(tokenId);

    return c.json({
      success: true,
      result: { id: tokenId },
    });
  } catch (error: any) {
    console.error('Error deleting token:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete token',
          details: error,
        },
      },
      status
    );
  }
});

// Verify Token
const verifyTokenRoute = createRoute({
  method: 'get',
  path: '/verify',
  summary: 'Verify API Token',
  description: 'Verify the current API token',
  tags: ['API Tokens'],
  responses: {
    200: {
      description: 'Token is valid',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({
            id: z.string(),
            status: z.string(),
          })),
        },
      },
    },
    401: {
      description: 'Token is invalid',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(verifyTokenRoute, async (c) => {
  try {
    const cf = c.get('cf');
    c.set('apiTarget' as any, 'user.tokens.verify');

    const response = await cf.user.tokens.verify();

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error verifying token:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to verify token',
          details: error,
        },
      },
      401
    );
  }
});

export default app;
