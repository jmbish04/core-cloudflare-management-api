import { Hono } from 'hono';
import { Env, Variables, generateUUID } from '../../types';

const projectFlows = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * High-Level Project Orchestration Flows
 *
 * These endpoints combine multiple API calls into cohesive workflows:
 * - Create complete project stacks (Worker + bindings + GitHub CI/CD)
 * - Setup applications with all required resources
 * - Deploy projects with proper configuration
 */

// Create complete project with bindings
projectFlows.post('/create', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      projectName,
      bindings = [], // ['kv', 'd1', 'r2', 'analytics_engine', 'queue']
      githubRepo,
      githubOwner,
      productionBranch = 'main',
      buildCommand = '',
      deployCommand = 'npx wrangler deploy',
    } = body;

    const createdResources: any[] = [];
    const wranglerBindings: string[] = [];

    // Step 1: Create requested bindings
    for (const bindingType of bindings) {
      try {
        switch (bindingType) {
          case 'kv': {
            const namespace = await cf.kv.namespaces.create({
              account_id: accountId,
              title: `${projectName}-kv`,
            });
            createdResources.push({ type: 'kv', id: namespace.id, name: `${projectName}-kv` });
            wranglerBindings.push(`[[kv_namespaces]]
binding = "${projectName.toUpperCase()}_KV"
id = "${namespace.id}"`);
            break;
          }

          case 'd1': {
            const database = await cf.d1.database.create({
              account_id: accountId,
              name: `${projectName}-db`,
            });
            createdResources.push({ type: 'd1', id: database.uuid, name: `${projectName}-db` });
            wranglerBindings.push(`[[d1_databases]]
binding = "${projectName.toUpperCase()}_DB"
database_name = "${projectName}-db"
database_id = "${database.uuid}"`);
            break;
          }

          case 'r2': {
            const bucket = await cf.r2.buckets.create({
              account_id: accountId,
              name: `${projectName.toLowerCase()}-storage`,
            });
            createdResources.push({ type: 'r2', id: bucket.name, name: `${projectName}-storage` });
            wranglerBindings.push(`[[r2_buckets]]
binding = "${projectName.toUpperCase()}_STORAGE"
bucket_name = "${bucket.name}"`);
            break;
          }

          case 'analytics_engine': {
            createdResources.push({ type: 'analytics_engine', name: `${projectName}-analytics` });
            wranglerBindings.push(`[[analytics_engine_datasets]]
binding = "${projectName.toUpperCase()}_ANALYTICS"`);
            break;
          }

          case 'queue': {
            createdResources.push({ type: 'queue', name: `${projectName}-queue` });
            wranglerBindings.push(`[[queues.producers]]
binding = "${projectName.toUpperCase()}_QUEUE"
queue = "${projectName.toLowerCase()}-queue"`);
            break;
          }
        }
      } catch (error: any) {
        console.error(`Error creating ${bindingType} binding:`, error);
        // Continue with other bindings
      }
    }

    // Step 2: Setup GitHub CI/CD (if requested)
    let cicdInfo = null;
    if (githubRepo && githubOwner) {
      try {
        // Create repository connection
        const repoConnection = await cf.workers.builds.repoConnections.create({
          account_id: accountId,
          repo_owner: githubOwner,
          repo_name: githubRepo,
        });

        // Create build trigger
        const trigger = await cf.workers.builds.triggers.create({
          account_id: accountId,
          repo_connection_uuid: repoConnection.uuid || repoConnection.id,
          external_script_id: projectName,
          branch_includes: [productionBranch],
          build_command: buildCommand,
          deploy_command: deployCommand,
          root_dir: '/',
          trigger_name: `${projectName}-cicd`,
        });

        cicdInfo = {
          repo_connection_uuid: repoConnection.uuid || repoConnection.id,
          trigger_id: trigger.id,
        };
      } catch (error: any) {
        console.error('Error setting up CI/CD:', error);
      }
    }

    // Step 3: Generate wrangler.toml
    const wranglerToml = `name = "${projectName.toLowerCase()}"
main = "src/index.ts"
compatibility_date = "2024-06-01"

${wranglerBindings.join('\n\n')}
`;

    return c.json(
      {
        success: true,
        result: {
          projectName,
          createdResources,
          cicd: cicdInfo,
          wranglerToml,
          message: `Project ${projectName} created with ${createdResources.length} bindings`,
        },
      },
      201
    );
  } catch (error: any) {
    console.error('Error in project creation flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Deploy worker with CI/CD setup
projectFlows.post('/deploy-with-cicd', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      workerName,
      githubOwner,
      githubRepo,
      productionBranch = 'main',
      buildCommand = '',
      rootDir = '/',
    } = body;

    // Create repository connection
    const repoConnection = await cf.workers.builds.repoConnections.create({
      account_id: accountId,
      repo_owner: githubOwner,
      repo_name: githubRepo,
    });

    // Create build trigger
    const trigger = await cf.workers.builds.triggers.create({
      account_id: accountId,
      repo_connection_uuid: repoConnection.uuid || repoConnection.id,
      external_script_id: workerName,
      branch_includes: [productionBranch],
      build_command: buildCommand,
      deploy_command: 'npx wrangler deploy',
      root_dir: rootDir,
      trigger_name: `${workerName}-github-cicd`,
    });

    return c.json(
      {
        success: true,
        result: {
          workerName,
          repoConnectionUuid: repoConnection.uuid || repoConnection.id,
          triggerId: trigger.id,
          message: `CI/CD configured for ${workerName}. Pushes to ${productionBranch} will trigger deployments.`,
        },
      },
      201
    );
  } catch (error: any) {
    console.error('Error in deploy-with-cicd flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get project status (combines multiple API calls)
projectFlows.get('/:projectName/status', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    const status: any = {
      projectName,
      worker: null,
      page: null,
      deployments: [],
      bindings: {
        kv: [],
        d1: [],
        r2: [],
      },
    };

    // Check for Worker
    try {
      status.worker = await cf.workers.scripts.get(projectName, { account_id: accountId });
    } catch (error) {
      // Worker doesn't exist
    }

    // Check for Page
    try {
      status.page = await cf.pages.projects.get(projectName, { account_id: accountId });
    } catch (error) {
      // Page doesn't exist
    }

    // Get deployments
    try {
      status.deployments = await cf.workers.deployments.list({
        account_id: accountId,
        script_name: projectName,
      } as any);
    } catch (error) {
      // No deployments
    }

    // Get bindings (simplified - just list all resources)
    try {
      const kvNamespaces = await cf.kv.namespaces.list({ account_id: accountId });
      status.bindings.kv = kvNamespaces.filter((ns: any) =>
        ns.title.toLowerCase().includes(projectName.toLowerCase())
      );
    } catch (error) {}

    try {
      const d1Databases = await cf.d1.database.list({ account_id: accountId });
      status.bindings.d1 = d1Databases.filter((db: any) =>
        db.name.toLowerCase().includes(projectName.toLowerCase())
      );
    } catch (error) {}

    try {
      const r2Buckets = await cf.r2.buckets.list({ account_id: accountId });
      status.bindings.r2 = r2Buckets.filter((bucket: any) =>
        bucket.name.toLowerCase().includes(projectName.toLowerCase())
      );
    } catch (error) {}

    return c.json({
      success: true,
      result: status,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default projectFlows;
