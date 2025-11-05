import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env, Variables, ErrorResponseSchema, SuccessResponseSchema } from '../../types';
import advancedRouter from './advanced';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Mount advanced flows
app.route('/advanced', advancedRouter);

// Schema for Create Worker with GitHub CI/CD
const CreateWorkerWithCICDSchema = z.object({
  workerName: z.string().min(1).openapi({
    description: 'The desired name for the new Cloudflare Worker',
    example: 'my-worker'
  }),
  githubOwner: z.string().min(1).openapi({
    description: 'The GitHub username or organization owning the repository',
    example: 'myorg'
  }),
  githubRepo: z.string().min(1).openapi({
    description: 'The name of the GitHub repository containing the Worker code',
    example: 'my-worker-repo'
  }),
  productionBranch: z.string().optional().default('main').openapi({
    description: 'The branch to deploy from',
    example: 'main'
  }),
  buildCommand: z.string().optional().default('').openapi({
    description: 'The build command to run (e.g., npm run build)',
    example: 'npm run build'
  }),
  rootDir: z.string().optional().default('/').openapi({
    description: 'The root directory within the repo',
    example: '/'
  }),
}).openapi('CreateWorkerWithCICD');

const CreateWorkerWithCICDResponseSchema = z.object({
  workerName: z.string(),
  repoConnectionUuid: z.string(),
  triggerId: z.string(),
  triggerName: z.string(),
  message: z.string(),
}).openapi('CreateWorkerWithCICDResponse');

// Create Worker with GitHub CI/CD - The "Easy Button" Flow
const createWorkerWithCICDRoute = createRoute({
  method: 'post',
  path: '/workers/create_with_github_cicd',
  summary: 'Create Worker with GitHub CI/CD',
  description: 'Create a new Cloudflare Worker with automatic GitHub CI/CD integration. This endpoint creates a repository connection and build trigger in a single operation.',
  tags: ['Flows'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkerWithCICDSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Worker CI/CD setup created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CreateWorkerWithCICDResponseSchema),
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

app.openapi(createWorkerWithCICDRoute, async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = c.req.valid('json');
    c.set('apiTarget' as any, 'flows.workers.createWithGithubCICD');

    const { workerName, githubOwner, githubRepo, productionBranch, buildCommand, rootDir } = body;

    // Step 1: Create Repository Connection
    console.log('Step 1: Creating repository connection...');
    let repoConnection;
    try {
      repoConnection = await cf.workers.builds.repoConnections.create({
        account_id: accountId,
        repo_owner: githubOwner,
        repo_name: githubRepo,
      });
    } catch (error: any) {
      console.error('Error creating repo connection:', error);
      return c.json(
        {
          success: false,
          error: {
            code: 'REPO_CONNECTION_FAILED',
            message: `Failed to create repository connection: ${error.message}`,
            details: error,
          },
        },
        500
      );
    }

    const repoConnectionUuid = repoConnection.uuid || repoConnection.id;
    console.log(`Repository connection created: ${repoConnectionUuid}`);

    // Step 2: Create Build Trigger
    console.log('Step 2: Creating build trigger...');
    const triggerName = `${workerName}-github-cicd`;

    try {
      const trigger = await cf.workers.builds.triggers.create({
        account_id: accountId,
        repo_connection_uuid: repoConnectionUuid,
        external_script_id: workerName,
        branch_includes: [productionBranch],
        build_command: buildCommand,
        deploy_command: 'npx wrangler deploy',
        root_dir: rootDir,
        trigger_name: triggerName,
      });

      const triggerId = trigger.id;
      console.log(`Build trigger created: ${triggerId}`);

      return c.json(
        {
          success: true,
          result: {
            workerName,
            repoConnectionUuid,
            triggerId,
            triggerName,
            message: `Successfully created Worker "${workerName}" with GitHub CI/CD. Pushes to branch "${productionBranch}" will trigger automatic deployments.`,
          },
        },
        201
      );
    } catch (error: any) {
      console.error('Error creating build trigger:', error);

      // Try to clean up the repo connection
      try {
        await cf.workers.builds.repoConnections.delete(repoConnectionUuid, { account_id: accountId });
        console.log('Cleaned up repo connection after trigger creation failure');
      } catch (cleanupError) {
        console.error('Failed to clean up repo connection:', cleanupError);
      }

      return c.json(
        {
          success: false,
          error: {
            code: 'BUILD_TRIGGER_FAILED',
            message: `Failed to create build trigger: ${error.message}`,
            details: error,
          },
        },
        500
      );
    }
  } catch (error: any) {
    console.error('Unexpected error in create_with_github_cicd:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: error.message || 'An unexpected error occurred',
          details: error,
        },
      },
      500
    );
  }
});

// Placeholder route for listing flows
const listFlowsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List Available Flows',
  description: 'Get a list of all available workflow automation flows',
  tags: ['Flows'],
  responses: {
    200: {
      description: 'List of available flows',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(z.object({
            name: z.string(),
            path: z.string(),
            description: z.string(),
            method: z.string(),
          }))),
        },
      },
    },
  },
});

app.openapi(listFlowsRoute, async (c) => {
  return c.json({
    success: true,
    result: [
      {
        name: 'Create Worker with GitHub CI/CD',
        path: '/api/flows/workers/create_with_github_cicd',
        description: 'Create a new Worker with automatic GitHub CI/CD integration',
        method: 'POST',
      },
      // Future flows can be added here:
      // - Deploy Pages Project with Domain
      // - Setup Tunnel with DNS
      // - Create Full Stack App (Worker + Pages + D1 + R2)
      // - Setup Zero Trust Access for Application
    ],
  });
});

export default app;
