import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// D1 Schemas
const D1DatabaseSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  version: z.string().optional(),
  created_at: z.string().optional(),
}).openapi('D1Database');

// KV Schemas
const KVNamespaceSchema = z.object({
  id: z.string(),
  title: z.string(),
  supports_url_encoding: z.boolean().optional(),
}).openapi('KVNamespace');

const CreateKVNamespaceSchema = z.object({
  title: z.string().min(1).openapi({ description: 'Namespace title' }),
}).openapi('CreateKVNamespace');

// R2 Schemas
const R2BucketSchema = z.object({
  name: z.string(),
  creation_date: z.string().optional(),
  location: z.string().optional(),
}).openapi('R2Bucket');

const CreateR2BucketSchema = z.object({
  name: z.string().min(1).openapi({ description: 'Bucket name' }),
  locationHint: z.string().optional().openapi({ description: 'Location hint for bucket' }),
}).openapi('CreateR2Bucket');

// ========== D1 ENDPOINTS ==========

// List D1 Databases
const listD1DatabasesRoute = createRoute({
  method: 'get',
  path: '/d1/databases',
  summary: 'List D1 Databases',
  description: 'List all D1 databases',
  tags: ['Storage - D1'],
  responses: {
    200: {
      description: 'List of D1 databases',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(D1DatabaseSchema)),
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

app.openapi(listD1DatabasesRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'd1.database.list');

    const response = await cf.d1.database.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing D1 databases:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list D1 databases',
          details: error,
        },
      },
      500
    );
  }
});

// ========== KV ENDPOINTS ==========

// List KV Namespaces
const listKVNamespacesRoute = createRoute({
  method: 'get',
  path: '/kv/namespaces',
  summary: 'List KV Namespaces',
  description: 'List all KV namespaces',
  tags: ['Storage - KV'],
  responses: {
    200: {
      description: 'List of KV namespaces',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(KVNamespaceSchema)),
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

app.openapi(listKVNamespacesRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'kv.namespaces.list');

    const response = await cf.kv.namespaces.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing KV namespaces:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list KV namespaces',
          details: error,
        },
      },
      500
    );
  }
});

// Create KV Namespace
const createKVNamespaceRoute = createRoute({
  method: 'post',
  path: '/kv/namespaces',
  summary: 'Create KV Namespace',
  description: 'Create a new KV namespace',
  tags: ['Storage - KV'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateKVNamespaceSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'KV namespace created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(KVNamespaceSchema),
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

app.openapi(createKVNamespaceRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'kv.namespaces.create');

    const response = await cf.kv.namespaces.create({
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
    console.error('Error creating KV namespace:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create KV namespace',
          details: error,
        },
      },
      500
    );
  }
});

// Delete KV Namespace
const deleteKVNamespaceRoute = createRoute({
  method: 'delete',
  path: '/kv/namespaces/{namespaceId}',
  summary: 'Delete KV Namespace',
  description: 'Delete a KV namespace',
  tags: ['Storage - KV'],
  request: {
    params: z.object({
      namespaceId: z.string().openapi({ description: 'KV Namespace ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Namespace deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
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

app.openapi(deleteKVNamespaceRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { namespaceId } = c.req.valid('param');
    c.set('apiTarget' as any, 'kv.namespaces.delete');

    await cf.kv.namespaces.delete(namespaceId, { account_id: accountId });

    return c.json({
      success: true,
      result: { id: namespaceId },
    });
  } catch (error: any) {
    console.error('Error deleting KV namespace:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete KV namespace',
          details: error,
        },
      },
      500
    );
  }
});

// ========== R2 ENDPOINTS ==========

// List R2 Buckets
const listR2BucketsRoute = createRoute({
  method: 'get',
  path: '/r2/buckets',
  summary: 'List R2 Buckets',
  description: 'List all R2 buckets',
  tags: ['Storage - R2'],
  responses: {
    200: {
      description: 'List of R2 buckets',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(R2BucketSchema)),
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

app.openapi(listR2BucketsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'r2.buckets.list');

    const response = await cf.r2.buckets.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing R2 buckets:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list R2 buckets',
          details: error,
        },
      },
      500
    );
  }
});

// Create R2 Bucket
const createR2BucketRoute = createRoute({
  method: 'post',
  path: '/r2/buckets',
  summary: 'Create R2 Bucket',
  description: 'Create a new R2 bucket',
  tags: ['Storage - R2'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateR2BucketSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'R2 bucket created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(R2BucketSchema),
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

app.openapi(createR2BucketRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'r2.buckets.create');

    const response = await cf.r2.buckets.create({
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
    console.error('Error creating R2 bucket:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create R2 bucket',
          details: error,
        },
      },
      500
    );
  }
});

// Delete R2 Bucket
const deleteR2BucketRoute = createRoute({
  method: 'delete',
  path: '/r2/buckets/{bucketName}',
  summary: 'Delete R2 Bucket',
  description: 'Delete an R2 bucket',
  tags: ['Storage - R2'],
  request: {
    params: z.object({
      bucketName: z.string().openapi({ description: 'R2 Bucket name' }),
    }),
  },
  responses: {
    200: {
      description: 'Bucket deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ name: z.string() })),
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

app.openapi(deleteR2BucketRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { bucketName } = c.req.valid('param');
    c.set('apiTarget' as any, 'r2.buckets.delete');

    await cf.r2.buckets.delete(bucketName, { account_id: accountId });

    return c.json({
      success: true,
      result: { name: bucketName },
    });
  } catch (error: any) {
    console.error('Error deleting R2 bucket:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete R2 bucket',
          details: error,
        },
      },
      500
    );
  }
});

export default app;
