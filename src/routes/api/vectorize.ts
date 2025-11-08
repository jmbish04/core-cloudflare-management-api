import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const vectorize = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Vectorize API Routes - 1:1 proxy to Cloudflare API
 */

// List all Vectorize indexes
vectorize.get('/indexes', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/vectorize/indexes`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Get a specific Vectorize index
vectorize.get('/indexes/:indexName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const indexName = c.req.param('indexName');

    const response = await apiClient.get(
      `/accounts/${accountId}/vectorize/indexes/${indexName}`
    );
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

export default vectorize;

