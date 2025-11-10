import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const cicd = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Builds/CI/CD API Routes - 1:1 proxy to Cloudflare Workers Builds API
 * 
 * Complete implementation of Workers Builds API:
 * - Account-level: Latest builds, builds by version, account limits
 * - Builds: List by script, get by UUID, cancel, logs
 * - Repos: Connections, config autofill
 * - Tokens: Create, list, delete
 * - Triggers: List by script, create, update, delete, purge cache, create manual build
 * - Environment Variables: List, upsert, delete
 * 
 * All endpoints follow the OpenAPI specification from api-schemas-main
 */

// ===== Repository Connections =====

// Upsert repository connection
cicd.put('/repos/connections', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const response = await apiClient.put(
      `/accounts/${accountId}/builds/repos/connections`,
      body
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Delete repository connection
cicd.delete('/repos/connections/:repoConnectionUuid', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const repoConnectionUuid = c.req.param('repoConnectionUuid');

    await apiClient.delete(
      `/accounts/${accountId}/builds/repos/connections/${repoConnectionUuid}`
    );
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// ===== Repository Configuration Autofill =====

// Get repository configuration autofill
cicd.get('/repos/:providerType/:providerAccountId/:repoId/config_autofill', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const providerType = c.req.param('providerType');
    const providerAccountId = c.req.param('providerAccountId');
    const repoId = c.req.param('repoId');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/repos/${providerType}/${providerAccountId}/${repoId}/config_autofill`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== Build Tokens =====

// List build tokens
cicd.get('/tokens', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/tokens`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Create build token
cicd.post('/tokens', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const response = await apiClient.post(
      `/accounts/${accountId}/builds/tokens`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Delete build token
cicd.delete('/tokens/:buildTokenUuid', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const buildTokenUuid = c.req.param('buildTokenUuid');

    await apiClient.delete(
      `/accounts/${accountId}/builds/tokens/${buildTokenUuid}`
    );
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// ===== Triggers =====

// List triggers by script
cicd.get('/workers/:externalScriptId/triggers', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const externalScriptId = c.req.param('externalScriptId');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/workers/${externalScriptId}/triggers`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Create trigger
cicd.post('/triggers', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const response = await apiClient.post(
      `/accounts/${accountId}/builds/triggers`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Update trigger
cicd.patch('/triggers/:triggerUuid', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');
    const body = await c.req.json();

    const response = await apiClient.patch(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}`,
      body
    );
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Delete trigger
cicd.delete('/triggers/:triggerUuid', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');

    await apiClient.delete(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}`
    );
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Create manual build
cicd.post('/triggers/:triggerUuid/builds', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');
    const body = await c.req.json();

    const response = await apiClient.post(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}/builds`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Purge build cache
cicd.post('/triggers/:triggerUuid/purge_build_cache', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');

    const response = await apiClient.post(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}/purge_build_cache`,
      {}
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== Account-Level Builds =====

// Get latest builds by script IDs
cicd.get('/builds/latest', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const externalScriptIds = c.req.query('external_script_ids'); // Comma-separated list

    const params = externalScriptIds ? { external_script_ids: externalScriptIds } : undefined;
    const response = await apiClient.get(
      `/accounts/${accountId}/builds/builds/latest`,
      params
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Get builds by version IDs
cicd.get('/builds', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const versionIds = c.req.query('version_ids'); // Comma-separated list

    const params = versionIds ? { version_ids: versionIds } : undefined;
    const response = await apiClient.get(
      `/accounts/${accountId}/builds/builds`,
      params
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Get account limits
cicd.get('/account/limits', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/account/limits`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== Builds (per script) =====

// List builds by script
cicd.get('/workers/:externalScriptId/builds', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const externalScriptId = c.req.param('externalScriptId');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/workers/${externalScriptId}/builds`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Get build by UUID
cicd.get('/builds/:buildUuid', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const buildUuid = c.req.param('buildUuid');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/builds/${buildUuid}`
    );
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Cancel build
cicd.put('/builds/:buildUuid/cancel', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const buildUuid = c.req.param('buildUuid');

    const response = await apiClient.put(
      `/accounts/${accountId}/builds/builds/${buildUuid}/cancel`,
      {}
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== Build Logs =====

// Get build logs
cicd.get('/builds/:buildUuid/logs', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const buildUuid = c.req.param('buildUuid');
    const cursor = c.req.query('cursor');

    const params = cursor ? { cursor } : undefined;
    const response = await apiClient.get(
      `/accounts/${accountId}/builds/builds/${buildUuid}/logs`,
      params
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== Environment Variables =====

// Get environment variables for trigger
cicd.get('/triggers/:triggerUuid/environment_variables', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');

    const response = await apiClient.get(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}/environment_variables`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Upsert environment variables for trigger (PATCH for upsert)
cicd.patch('/triggers/:triggerUuid/environment_variables', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');
    const body = await c.req.json();

    const response = await apiClient.patch(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}/environment_variables`,
      body
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Delete environment variable
cicd.delete('/triggers/:triggerUuid/environment_variables/:key', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const triggerUuid = c.req.param('triggerUuid');
    const key = c.req.param('key');

    await apiClient.delete(
      `/accounts/${accountId}/builds/triggers/${triggerUuid}/environment_variables/${key}`
    );
    return c.json({ success: true });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

export default cicd;
