import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Schemas
const ProjectNameParamSchema = z.object({
  projectName: z.string().min(1).openapi({ description: 'Pages project name' }),
});

const PageProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  subdomain: z.string(),
  domains: z.array(z.string()).optional(),
  source: z.object({
    type: z.string(),
    config: z.any().optional(),
  }).optional(),
  build_config: z.object({
    build_command: z.string().optional(),
    destination_dir: z.string().optional(),
    root_dir: z.string().optional(),
    web_analytics_tag: z.string().optional(),
    web_analytics_token: z.string().optional(),
  }).optional(),
  deployment_configs: z.any().optional(),
  latest_deployment: z.any().optional(),
  created_on: z.string(),
  production_branch: z.string().optional(),
}).openapi('PageProject');

const CreatePageProjectSchema = z.object({
  name: z.string().min(1).openapi({ description: 'Project name' }),
  production_branch: z.string().optional().openapi({ description: 'Production branch' }),
  build_config: z.object({
    build_command: z.string().optional(),
    destination_dir: z.string().optional(),
    root_dir: z.string().optional(),
  }).optional(),
}).openapi('CreatePageProject');

// List Pages Projects
const listProjectsRoute = createRoute({
  method: 'get',
  path: '/projects',
  summary: 'List Pages Projects',
  description: 'List all Cloudflare Pages projects',
  tags: ['Pages'],
  responses: {
    200: {
      description: 'List of Pages projects',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(PageProjectSchema)),
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

app.openapi(listProjectsRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    c.set('apiTarget' as any, 'pages.projects.list');

    const response = await cf.pages.projects.list({ account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error listing pages projects:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to list pages projects',
          details: error,
        },
      },
      500
    );
  }
});

// Get Pages Project
const getProjectRoute = createRoute({
  method: 'get',
  path: '/projects/{projectName}',
  summary: 'Get Pages Project',
  description: 'Get details of a specific Pages project',
  tags: ['Pages'],
  request: {
    params: ProjectNameParamSchema,
  },
  responses: {
    200: {
      description: 'Pages project details',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PageProjectSchema),
        },
      },
    },
    404: {
      description: 'Project not found',
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

app.openapi(getProjectRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { projectName } = c.req.valid('param');
    c.set('apiTarget' as any, 'pages.projects.get');

    const response = await cf.pages.projects.get(projectName, { account_id: accountId });

    return c.json({
      success: true,
      result: response,
    });
  } catch (error: any) {
    console.error('Error getting pages project:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to get pages project',
          details: error,
        },
      },
      status
    );
  }
});

// Create Pages Project
const createProjectRoute = createRoute({
  method: 'post',
  path: '/projects',
  summary: 'Create Pages Project',
  description: 'Create a new Cloudflare Pages project',
  tags: ['Pages'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePageProjectSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Pages project created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PageProjectSchema),
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

app.openapi(createProjectRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'pages.projects.create');

    const response = await cf.pages.projects.create({
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
    console.error('Error creating pages project:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to create pages project',
          details: error,
        },
      },
      500
    );
  }
});

// Delete Pages Project
const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/projects/{projectName}',
  summary: 'Delete Pages Project',
  description: 'Delete a Pages project',
  tags: ['Pages'],
  request: {
    params: ProjectNameParamSchema,
  },
  responses: {
    200: {
      description: 'Project deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    404: {
      description: 'Project not found',
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

app.openapi(deleteProjectRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const { projectName } = c.req.valid('param');
    c.set('apiTarget' as any, 'pages.projects.delete');

    await cf.pages.projects.delete(projectName, { account_id: accountId });

    return c.json({
      success: true,
      result: { id: projectName },
    });
  } catch (error: any) {
    console.error('Error deleting pages project:', error);
    const status = error.status === 404 ? 404 : 500;
    return c.json(
      {
        success: false,
        error: {
          code: error.status === 404 ? 'NOT_FOUND' : 'CLOUDFLARE_API_ERROR',
          message: error.message || 'Failed to delete pages project',
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
  path: '/projects/{projectName}/deployments',
  summary: 'List Pages Deployments',
  description: 'List all deployments for a Pages project',
  tags: ['Pages'],
  request: {
    params: ProjectNameParamSchema,
  },
  responses: {
    200: {
      description: 'List of deployments',
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
    const { projectName } = c.req.valid('param');
    c.set('apiTarget' as any, 'pages.projects.deployments.list');

    const response = await cf.pages.projects.deployments.list(projectName, { account_id: accountId });

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

export default app;
