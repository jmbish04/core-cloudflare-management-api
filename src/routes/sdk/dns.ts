import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const ZoneIdParamSchema = z.object({
  zoneId: z.string().openapi({ description: 'Zone ID' }),
});

const RecordIdParamSchema = z.object({
  zoneId: z.string().openapi({ description: 'Zone ID' }),
  recordId: z.string().openapi({ description: 'DNS Record ID' }),
});

const DNSRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  proxied: z.boolean().optional(),
  ttl: z.number(),
  priority: z.number().optional(),
  created_on: z.string().optional(),
  modified_on: z.string().optional(),
  proxiable: z.boolean().optional(),
  locked: z.boolean().optional(),
  zone_id: z.string().optional(),
  zone_name: z.string().optional(),
}).openapi('DNSRecord');

const CreateDNSRecordSchema = z.object({
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA', 'PTR']).openapi({ description: 'DNS record type' }),
  name: z.string().openapi({ description: 'DNS record name' }),
  content: z.string().openapi({ description: 'DNS record content' }),
  ttl: z.number().optional().default(1).openapi({ description: 'TTL (1 for automatic)' }),
  proxied: z.boolean().optional().openapi({ description: 'Whether the record is proxied through Cloudflare' }),
  priority: z.number().optional().openapi({ description: 'Priority for MX/SRV records' }),
}).openapi('CreateDNSRecord');

const UpdateDNSRecordSchema = CreateDNSRecordSchema.partial();

// List DNS Records
const listDNSRecordsRoute = createRoute({
  method: 'get',
  path: '/zones/{zoneId}/records',
  summary: 'List DNS Records',
  description: 'List all DNS records for a zone',
  tags: ['DNS'],
  request: {
    params: ZoneIdParamSchema,
  },
  responses: {
    200: {
      description: 'List of DNS records',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(DNSRecordSchema)),
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

app.openapi(listDNSRecordsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId } = c.req.valid('param');
    c.set('apiTarget' as any, 'dns.records.list');

    const response = await cf.dns.records.list({ zone_id: zoneId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing DNS records:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list DNS records',
          details: error,
        },
      },
      500
    );
  }
});

// Get DNS Record
const getDNSRecordRoute = createRoute({
  method: 'get',
  path: '/zones/{zoneId}/records/{recordId}',
  summary: 'Get DNS Record',
  description: 'Get a specific DNS record',
  tags: ['DNS'],
  request: {
    params: RecordIdParamSchema,
  },
  responses: {
    200: {
      description: 'DNS record details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DNSRecordSchema),
        },
      },
    },
    404: {
      description: 'Record not found',
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

app.openapi(getDNSRecordRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId, recordId } = c.req.valid('param');
    c.set('apiTarget' as any, 'dns.records.get');

    const response = await cf.dns.records.get(recordId, { zone_id: zoneId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting DNS record:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get DNS record',
          details: error,
        },
      },
      status
    );
  }
});

// Create DNS Record
const createDNSRecordRoute = createRoute({
  method: 'post',
  path: '/zones/{zoneId}/records',
  summary: 'Create DNS Record',
  description: 'Create a new DNS record',
  tags: ['DNS'],
  request: {
    params: ZoneIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CreateDNSRecordSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'DNS record created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DNSRecordSchema),
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

app.openapi(createDNSRecordRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId } = c.req.valid('param');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'dns.records.create');

    const response = await cf.dns.records.create({
      zone_id: zoneId,
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
    console.error('Error creating DNS record:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create DNS record',
          details: error,
        },
      },
      500
    );
  }
});

// Update DNS Record
const updateDNSRecordRoute = createRoute({
  method: 'patch',
  path: '/zones/{zoneId}/records/{recordId}',
  summary: 'Update DNS Record',
  description: 'Update an existing DNS record',
  tags: ['DNS'],
  request: {
    params: RecordIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateDNSRecordSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'DNS record updated',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(DNSRecordSchema),
        },
      },
    },
    404: {
      description: 'Record not found',
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

app.openapi(updateDNSRecordRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId, recordId } = c.req.valid('param');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'dns.records.update');

    const response = await cf.dns.records.update(recordId, {
      zone_id: zoneId,
      ...body,
    });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error updating DNS record:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to update DNS record',
          details: error,
        },
      },
      status
    );
  }
});

// Delete DNS Record
const deleteDNSRecordRoute = createRoute({
  method: 'delete',
  path: '/zones/{zoneId}/records/{recordId}',
  summary: 'Delete DNS Record',
  description: 'Delete a DNS record',
  tags: ['DNS'],
  request: {
    params: RecordIdParamSchema,
  },
  responses: {
    200: {
      description: 'DNS record deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    404: {
      description: 'Record not found',
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

app.openapi(deleteDNSRecordRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const { zoneId, recordId } = c.req.valid('param');
    c.set('apiTarget' as any, 'dns.records.delete');

    await cf.dns.records.delete(recordId, { zone_id: zoneId });

    return c.json({
      success: true,
      result: { id: recordId },
    });
  } catch (error: any) {
    console.error('Error deleting DNS record:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete DNS record',
          details: error,
        },
      },
      status
    );
  }
});

export default app;
