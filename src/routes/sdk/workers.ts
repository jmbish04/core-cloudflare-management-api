import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const workers = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * SDK Workers Routes - 1:1 proxy to Cloudflare API
 * These are thin pass-through layers with minimal logic
 */

// List all workers
workers.get('/scripts', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const scripts = await cf.workers.scripts.list({ account_id: accountId });

    return c.json({ success: true, result: scripts });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get worker script
workers.get('/scripts/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const script = await cf.workers.scripts.get(scriptName, { account_id: accountId });

    return c.json({ success: true, result: script });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Delete worker script
workers.delete('/scripts/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    await cf.workers.scripts.delete(scriptName, { account_id: accountId });

    return c.json({ success: true, result: { id: scriptName } });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// List deployments
workers.get('/deployments', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const deployments = await cf.workers.deployments.list({ account_id: accountId });

    return c.json({ success: true, result: deployments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get account settings
workers.get('/settings', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const settings = await cf.workers.accountSettings.get({ account_id: accountId });

    return c.json({ success: true, result: settings });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== SECRETS MANAGEMENT =====

// List secrets for a worker
workers.get('/scripts/:scriptName/secrets', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const secrets = await cf.workers.scripts.secrets.list(scriptName, { account_id: accountId });

    return c.json({ success: true, result: secrets });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Put/Update a secret
workers.put('/scripts/:scriptName/secrets/:secretName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const secretName = c.req.param('secretName');
    const { text, type = 'secret_text' } = await c.req.json();

    const result = await cf.workers.scripts.secrets.update(scriptName, secretName, {
      account_id: accountId,
      name: secretName,
      text,
      type,
    });

    return c.json({ success: true, result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete a secret
workers.delete('/scripts/:scriptName/secrets/:secretName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const secretName = c.req.param('secretName');

    await cf.workers.scripts.secrets.delete(scriptName, secretName, { account_id: accountId });

    return c.json({ success: true, result: { name: secretName } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== TAIL WORKERS =====

// Get tail consumers for a worker
workers.get('/scripts/:scriptName/tails', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const tails = await cf.workers.scripts.tails.list(scriptName, { account_id: accountId });

    return c.json({ success: true, result: tails });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Set tail consumer (for log streaming)
workers.put('/scripts/:scriptName/tails', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const body = await c.req.json();

    const result = await cf.workers.scripts.tails.create(scriptName, {
      account_id: accountId,
      ...body,
    });

    return c.json({ success: true, result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete tail consumer
workers.delete('/scripts/:scriptName/tails/:tailId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const tailId = c.req.param('tailId');

    await cf.workers.scripts.tails.delete(scriptName, tailId, { account_id: accountId });

    return c.json({ success: true, result: { id: tailId } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default workers;
