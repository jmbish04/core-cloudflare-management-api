import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const ZoneIdParamSchema = z.object({
  zoneId: z.string().openapi({ description: 'Zone ID' }),
});

const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  paused: z.boolean().optional(),
  type: z.string().optional(),
  development_mode: z.number().optional(),
  name_servers: z.array(z.string()).optional(),
  original_name_servers: z.array(z.string()).optional(),
  original_registrar: z.string().optional(),
  original_dnshost: z.string().optional(),
  created_on: z.string().optional(),
  modified_on: z.string().optional(),
  activated_on: z.string().optional(),
  account: z.object({
    id: z.string(),
    name: z.string().optional(),
  }).optional(),
}).openapi('Zone');

// List Zones
const listZonesRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List Zones',
  description: 'List all zones in the account',
  tags: ['Zones'],
  responses: {
    200: {
      description: 'List of zones',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(ZoneSchema)),
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

app.openapi(listZonesRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'zones.list');

    const response = await cf.zones.list({ account: { id: accountId } });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing zones:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list zones',
          details: error,
        },
      },
      500
    );
  }
});

// Get Zone
const getZoneRoute = createRoute({
  method: 'get',
  path: '/{zoneId}',
  summary: 'Get Zone',
  description: 'Get details of a specific zone',
  tags: ['Zones'],
  request: {
    params: ZoneIdParamSchema,
  },
  responses: {
    200: {
      description: 'Zone details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ZoneSchema),
        },
      },
    },
    404: {
      description: 'Zone not found',
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

app.openapi(getZoneRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zones.get');

    const response = await cf.zones.get({ zone_id: zoneId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting zone:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get zone',
          details: error,
        },
      },
      status
    );
  }
});

// Get Zone Settings
const getZoneSettingsRoute = createRoute({
  method: 'get',
  path: '/{zoneId}/settings',
  summary: 'Get Zone Settings',
  description: 'Get all settings for a zone',
  tags: ['Zones'],
  request: {
    params: ZoneIdParamSchema,
  },
  responses: {
    200: {
      description: 'Zone settings',
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

app.openapi(getZoneSettingsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId } = c.req.valid('param');
    c.set('apiTarget' as any, 'zones.settings.list');

    const response = await cf.zones.settings.list({ zone_id: zoneId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting zone settings:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get zone settings',
          details: error,
        },
      },
      500
    );
  }
});

export default app;
