import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const TunnelIdParamSchema = z.object({
  tunnelId: z.string().uuid().openapi({ description: 'Tunnel ID' }),
});

const TunnelSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  connections: z.array(z.object({
    id: z.string(),
    client_id: z.string().optional(),
    client_version: z.string().optional(),
    colo_name: z.string().optional(),
    is_pending_reconnect: z.boolean().optional(),
    opened_at: z.string().optional(),
    origin_ip: z.string().optional(),
  })).optional(),
  conns_active_at: z.string().optional(),
  conns_inactive_at: z.string().optional(),
  tun_type: z.string().optional(),
  status: z.string().optional(),
  remote_config: z.boolean().optional(),
}).openapi('Tunnel');

const CreateTunnelSchema = z.object({
  name: z.string().min(1).openapi({ description: 'Tunnel name' }),
  tunnel_secret: z.string().optional().openapi({ description: 'Base64-encoded tunnel secret (32 bytes)' }),
}).openapi('CreateTunnel');

// List Tunnels
const listTunnelsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List Tunnels',
  description: 'List all Cloudflare Tunnels',
  tags: ['Tunnels'],
  responses: {
    200: {
      description: 'List of tunnels',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(TunnelSchema)),
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

app.openapi(listTunnelsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'zeroTrust.tunnels.list');

    const response = await cf.zeroTrust.tunnels.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing tunnels:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list tunnels',
          details: error,
        },
      },
      500
    );
  }
});

// Get Tunnel
const getTunnelRoute = createRoute({
  method: 'get',
  path: '/{tunnelId}',
  summary: 'Get Tunnel',
  description: 'Get details of a specific tunnel',
  tags: ['Tunnels'],
  request: {
    params: TunnelIdParamSchema,
  },
  responses: {
    200: {
      description: 'Tunnel details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(TunnelSchema),
        },
      },
    },
    404: {
      description: 'Tunnel not found',
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

app.openapi(getTunnelRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { tunnelId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zeroTrust.tunnels.get');

    const response = await cf.zeroTrust.tunnels.get(tunnelId, { account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting tunnel:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get tunnel',
          details: error,
        },
      },
      status
    );
  }
});

// Create Tunnel
const createTunnelRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create Tunnel',
  description: 'Create a new Cloudflare Tunnel',
  tags: ['Tunnels'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateTunnelSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Tunnel created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(TunnelSchema),
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

app.openapi(createTunnelRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'zeroTrust.tunnels.create');

    const response = await cf.zeroTrust.tunnels.create({
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
    console.error('Error creating tunnel:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create tunnel',
          details: error,
        },
      },
      500
    );
  }
});

// Delete Tunnel
const deleteTunnelRoute = createRoute({
  method: 'delete',
  path: '/{tunnelId}',
  summary: 'Delete Tunnel',
  description: 'Delete a Cloudflare Tunnel',
  tags: ['Tunnels'],
  request: {
    params: TunnelIdParamSchema,
  },
  responses: {
    200: {
      description: 'Tunnel deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    404: {
      description: 'Tunnel not found',
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

app.openapi(deleteTunnelRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { tunnelId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zeroTrust.tunnels.delete');

    await cf.zeroTrust.tunnels.delete(tunnelId, { account_id: accountId });

    return c.json({
      success: true,
      result: { id: tunnelId },
    });
  } catch (error: any) {
    console.error('Error deleting tunnel:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete tunnel',
          details: error,
        },
      },
      status
    );
  }
});

// Get Tunnel Token
const getTunnelTokenRoute = createRoute({
  method: 'get',
  path: '/{tunnelId}/token',
  summary: 'Get Tunnel Token',
  description: 'Get the token for a tunnel',
  tags: ['Tunnels'],
  request: {
    params: TunnelIdParamSchema,
  },
  responses: {
    200: {
      description: 'Tunnel token',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ token: z.string() })),
        },
      },
    },
    404: {
      description: 'Tunnel not found',
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

app.openapi(getTunnelTokenRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { tunnelId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zeroTrust.tunnels.token.get');

    const response = await cf.zeroTrust.tunnels.token(tunnelId, { account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting tunnel token:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get tunnel token',
          details: error,
        },
      },
      status
    );
  }
});

export default app;
