import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const storage = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * SDK Storage Routes - 1:1 proxy to Cloudflare API
 * Covers D1, KV, R2
 */

// ===== D1 =====
storage.get('/d1/databases', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const databases = await cf.d1.database.list({ account_id: accountId });

    return c.json({ success: true, result: databases });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

storage.post('/d1/databases', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const database = await cf.d1.database.create({
      account_id: accountId,
      name: body.name,
    });

    return c.json({ success: true, result: database }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== KV =====
storage.get('/kv/namespaces', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const namespaces = await cf.kv.namespaces.list({ account_id: accountId });

    return c.json({ success: true, result: namespaces });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

storage.post('/kv/namespaces', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const namespace = await cf.kv.namespaces.create({
      account_id: accountId,
      title: body.title,
    });

    return c.json({ success: true, result: namespace }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

storage.delete('/kv/namespaces/:namespaceId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const namespaceId = c.req.param('namespaceId');

    await cf.kv.namespaces.delete(namespaceId, { account_id: accountId });

    return c.json({ success: true, result: { id: namespaceId } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== R2 =====
storage.get('/r2/buckets', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const buckets = await cf.r2.buckets.list({ account_id: accountId });

    return c.json({ success: true, result: buckets });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

storage.post('/r2/buckets', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const bucket = await cf.r2.buckets.create({
      account_id: accountId,
      name: body.name,
      locationHint: body.locationHint,
    });

    return c.json({ success: true, result: bucket }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

storage.delete('/r2/buckets/:bucketName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const bucketName = c.req.param('bucketName');

    await cf.r2.buckets.delete(bucketName, { account_id: accountId });

    return c.json({ success: true, result: { name: bucketName } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default storage;
