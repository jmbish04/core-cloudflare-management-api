import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import {
  createWorker,
  validateWorkerRequest,
  type CreateWorkerRequest,
} from '../../services/create-worker-service';

const createWorkerRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /api/create-worker
 * Create and deploy a new Cloudflare Worker with automatic binding setup
 */
createWorkerRouter.post('/', async (c) => {
  try {
    const body = await c.req.json() as CreateWorkerRequest;

    // Create the worker
    const result = await createWorker(c.env, body);

    if (result.success) {
      return c.json({
        success: true,
        worker_url: result.worker_url,
        wrangler_config: result.wrangler_config,
        message: `Worker "${body.project_name}" created and deployed successfully`,
        details: result.details,
      });
    } else {
      return c.json({
        success: false,
        error: result.error,
        details: result.details,
      }, 400);
    }
  } catch (error: any) {
    console.error('Error creating worker:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to create worker',
      details: error.stack,
    }, 500);
  }
});

/**
 * POST /api/create-worker/validate
 * Validate a worker creation request without actually creating anything
 */
createWorkerRouter.post('/validate', async (c) => {
  try {
    const body = await c.req.json() as CreateWorkerRequest;

    // Validate the request
    const validation = await validateWorkerRequest(body);

    if (validation.valid) {
      return c.json({
        success: true,
        valid: true,
        message: 'Worker request is valid',
      });
    } else {
      return c.json({
        success: false,
        valid: false,
        errors: validation.errors,
      }, 400);
    }
  } catch (error: any) {
    console.error('Error validating worker request:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to validate request',
    }, 500);
  }
});

/**
 * GET /api/create-worker
 * Get information about the worker creation endpoint
 */
createWorkerRouter.get('/', async (c) => {
  return c.json({
    success: true,
    message: 'Worker Creation API',
    endpoints: {
      create: 'POST /api/create-worker',
      validate: 'POST /api/create-worker/validate',
    },
    example: {
      project_name: 'my-worker',
      type: 'worker',
      javascript_files: {
        paths: ['src/index.js'],
        content_base64: ['ZXhwb3J0IGRlZmF1bHQge2FzeW5jIGZldGNoKHJlcXVlc3QpIHtyZXR1cm4gbmV3IFJlc3BvbnNlKCdIZWxsbyBXb3JsZCEnKTt9fQ=='],
      },
      bindings: {
        kv: ['MY_KV'],
        d1: ['MY_DB'],
      },
    },
    supported_types: ['worker', 'worker_with_static', 'pages', 'worker_with_pages'],
    validation_rules: {
      project_name: 'Required, alphanumeric with hyphens and underscores, max 63 chars',
      javascript_files: 'Required, must not contain inline HTML',
      static_files: 'Optional, HTML and other assets',
      bindings: 'Optional, KV, D1, R2, Queues, Workflows',
    },
    features: {
      auto_help_page: 'Automatically generates a beautiful help page served from ASSETS binding',
      help_page_location: {
        with_static_files: 'Available at /help.html',
        without_static_files: 'Available at / (landing page)',
      },
      observability: 'Always enabled by default',
      workers_dev: 'Automatic *.workers.dev subdomain',
      html_validation: 'Blocks inline HTML in JavaScript files',
    },
  });
});

export default createWorkerRouter;
