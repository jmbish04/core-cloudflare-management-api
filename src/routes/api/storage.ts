import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const storage = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Raw Storage Routes - 1:1 proxy to Cloudflare API
 * Covers D1, KV, R2
 * Available at /api/storage/* and /api/raw/storage/*
 */

// ===== D1 =====
storage.get('/d1/databases', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/d1/database`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

storage.post('/d1/databases', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json(); // e.g., { "name": "my-db" }

    const response = await apiClient.post(
      `/accounts/${accountId}/d1/database`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== KV =====
storage.get('/kv/namespaces', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/storage/kv/namespaces`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

storage.post('/kv/namespaces', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json(); // e.g., { "title": "my-namespace" }

    const response = await apiClient.post(
      `/accounts/${accountId}/storage/kv/namespaces`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

storage.delete('/kv/namespaces/:namespaceId', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const namespaceId = c.req.param('namespaceId');

    await apiClient.delete(
      `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`
    );
    return c.json({ success: true, result: { id: namespaceId } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// ===== R2 =====
storage.get('/r2/buckets', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(`/accounts/${accountId}/r2/buckets`);
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

storage.post('/r2/buckets', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json(); // e.g., { "name": "my-bucket", "locationHint": "wnam" }

    const response = await apiClient.post(
      `/accounts/${accountId}/r2/buckets`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

storage.delete('/r2/buckets/:bucketName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const bucketName = c.req.param('bucketName');

    await apiClient.delete(
      `/accounts/${accountId}/r2/buckets/${bucketName}`
    );
    return c.json({ success: true, result: { name: bucketName } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

export default storage;
