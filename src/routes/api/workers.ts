import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const workers = new Hono<{ Bindings: Env; Variables: Variables }>();

const upsertSecret = async (c: any) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const secretNameFromPath = c.req.param('secretName');
    const body = await c.req.json();

    const payload: any = { ...body };

    if (!payload.name && secretNameFromPath) {
      payload.name = secretNameFromPath;
    }

    if (!payload.name) {
      return c.json(
        { success: false, error: 'Secret name is required' },
        400
      );
    }

    if (payload.text === undefined && payload.value !== undefined) {
      payload.text = payload.value;
      delete payload.value;
    }

    if (!payload.type) {
      payload.type = 'secret_text';
    }

    const response = await apiClient.put(
      `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
      payload
    );
    return c.json(response);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
};

const createTail = async (c: any) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const body = await c.req.json();

    const response = await apiClient.post(
      `/accounts/${accountId}/workers/scripts/${scriptName}/tails`,
      body
    );
    return c.json(response);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
};

/**
 * Raw Workers Routes - 1:1 proxy to Cloudflare API
 * These are thin pass-through layers with minimal logic
 * Available at /api/workers/* and /api/raw/workers/*
 */

// List all workers
workers.get('/scripts', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/scripts`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Get worker script
workers.get('/scripts/:scriptName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/scripts/${scriptName}`
    );
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Delete worker script
workers.delete('/scripts/:scriptName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    await apiClient.delete(
      `/accounts/${accountId}/workers/scripts/${scriptName}`
    );
    return c.json({ success: true, result: { id: scriptName } });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// List deployments (for all scripts)
workers.get('/deployments', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/deployments`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Get account settings
workers.get('/settings', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/account-settings`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== SECRETS MANAGEMENT =====

// List secrets for a worker
workers.get('/scripts/:scriptName/secrets', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Put/Update a secret (supports both spec-compliant and legacy paths)
workers.put('/scripts/:scriptName/secrets', upsertSecret);
workers.put('/scripts/:scriptName/secrets/:secretName', upsertSecret);

// Get a specific secret binding (metadata only)
workers.get('/scripts/:scriptName/secrets/:secretName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const secretName = c.req.param('secretName');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/scripts/${scriptName}/secrets/${secretName}`
    );
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Delete a secret
workers.delete('/scripts/:scriptName/secrets/:secretName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const secretName = c.req.param('secretName');

    await apiClient.delete(
      `/accounts/${accountId}/workers/scripts/${scriptName}/secrets/${secretName}`
    );
    return c.json({ success: true, result: { name: secretName } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== TAIL WORKERS =====

// Get tail consumers for a worker
workers.get('/scripts/:scriptName/tails', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const response = await apiClient.get(
      `/accounts/${accountId}/workers/scripts/${scriptName}/tails`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Create tail consumer (supports POST per OpenAPI and PUT for backward compatibility)
workers.post('/scripts/:scriptName/tails', createTail);
workers.put('/scripts/:scriptName/tails', createTail);

// Delete tail consumer
workers.delete('/scripts/:scriptName/tails/:tailId', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const tailId = c.req.param('tailId');

    await apiClient.delete(
      `/accounts/${accountId}/workers/scripts/${scriptName}/tails/${tailId}`
    );
    return c.json({ success: true, result: { id: tailId } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

export default workers;
