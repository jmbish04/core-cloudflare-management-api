import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const cicd = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * CI/CD Management SDK Routes
 *
 * Independent endpoints for managing Cloudflare CI/CD:
 * - Repository connections (GitHub/GitLab)
 * - Build triggers and configuration
 * - Deployment management
 * - Build logs and status
 */

// ===== REPOSITORY CONNECTIONS =====

// List all repository connections
cicd.get('/repo-connections', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const connections = await cf.workers.builds.repoConnections.list({
      account_id: accountId,
    });

    return c.json({ success: true, result: connections });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get specific repository connection
cicd.get('/repo-connections/:connectionId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const connectionId = c.req.param('connectionId');

    const connection = await cf.workers.builds.repoConnections.get(connectionId, {
      account_id: accountId,
    });

    return c.json({ success: true, result: connection });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create new repository connection
cicd.post('/repo-connections', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const { repo_owner, repo_name, install_id, access_token } = body;

    const connection = await cf.workers.builds.repoConnections.create({
      account_id: accountId,
      repo_owner,
      repo_name,
      install_id,
      access_token,
    });

    return c.json({ success: true, result: connection }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update repository connection
cicd.put('/repo-connections/:connectionId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const connectionId = c.req.param('connectionId');
    const body = await c.req.json();

    const connection = await cf.workers.builds.repoConnections.update(connectionId, {
      account_id: accountId,
      ...body,
    });

    return c.json({ success: true, result: connection });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete repository connection
cicd.delete('/repo-connections/:connectionId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const connectionId = c.req.param('connectionId');

    await cf.workers.builds.repoConnections.delete(connectionId, {
      account_id: accountId,
    });

    return c.json({ success: true, message: 'Repository connection deleted' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== BUILD TRIGGERS =====

// List all build triggers
cicd.get('/triggers', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const triggers = await cf.workers.builds.triggers.list({
      account_id: accountId,
    });

    return c.json({ success: true, result: triggers });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get specific build trigger
cicd.get('/triggers/:triggerId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const triggerId = c.req.param('triggerId');

    const trigger = await cf.workers.builds.triggers.get(triggerId, {
      account_id: accountId,
    });

    return c.json({ success: true, result: trigger });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create new build trigger
cicd.post('/triggers', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      repo_connection_uuid,
      external_script_id,
      trigger_name,
      branch_includes = [],
      branch_excludes = [],
      build_command = '',
      deploy_command = 'npx wrangler deploy',
      root_dir = '/',
      env_vars = {},
    } = body;

    const trigger = await cf.workers.builds.triggers.create({
      account_id: accountId,
      repo_connection_uuid,
      external_script_id,
      trigger_name,
      branch_includes,
      branch_excludes,
      build_command,
      deploy_command,
      root_dir,
      env_vars,
    });

    return c.json({ success: true, result: trigger }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update build trigger
cicd.put('/triggers/:triggerId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const triggerId = c.req.param('triggerId');
    const body = await c.req.json();

    const trigger = await cf.workers.builds.triggers.update(triggerId, {
      account_id: accountId,
      ...body,
    });

    return c.json({ success: true, result: trigger });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete build trigger
cicd.delete('/triggers/:triggerId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const triggerId = c.req.param('triggerId');

    await cf.workers.builds.triggers.delete(triggerId, {
      account_id: accountId,
    });

    return c.json({ success: true, message: 'Build trigger deleted' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== BUILD RUNS & LOGS =====

// List build runs for a trigger
cicd.get('/triggers/:triggerId/runs', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const triggerId = c.req.param('triggerId');

    const runs = await cf.workers.builds.runs.list({
      account_id: accountId,
      trigger_id: triggerId,
    });

    return c.json({ success: true, result: runs });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get specific build run
cicd.get('/runs/:runId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const runId = c.req.param('runId');

    const run = await cf.workers.builds.runs.get(runId, {
      account_id: accountId,
    });

    return c.json({ success: true, result: run });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get build logs for a run
cicd.get('/runs/:runId/logs', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const runId = c.req.param('runId');

    const logs = await cf.workers.builds.runs.logs(runId, {
      account_id: accountId,
    });

    return c.json({ success: true, result: logs });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Retry failed build
cicd.post('/runs/:runId/retry', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const runId = c.req.param('runId');

    const run = await cf.workers.builds.runs.retry(runId, {
      account_id: accountId,
    });

    return c.json({ success: true, result: run });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Cancel running build
cicd.post('/runs/:runId/cancel', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const runId = c.req.param('runId');

    await cf.workers.builds.runs.cancel(runId, {
      account_id: accountId,
    });

    return c.json({ success: true, message: 'Build cancelled' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== DEPLOYMENT MANAGEMENT =====

// Trigger manual deployment
cicd.post('/deploy', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const { trigger_id, branch, commit_sha } = body;

    const deployment = await cf.workers.builds.triggers.deploy(trigger_id, {
      account_id: accountId,
      branch,
      commit_sha,
    });

    return c.json({ success: true, result: deployment }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get deployment status
cicd.get('/deployments/:scriptName/status', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    // Get recent deployments for the script
    const deployments = await cf.workers.deployments.list({
      account_id: accountId,
      script_name: scriptName,
    } as any);

    return c.json({ success: true, result: deployments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default cicd;
