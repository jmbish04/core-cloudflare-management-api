import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const ai = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Workers AI API Routes - 1:1 proxy to Cloudflare API
 */

// List available AI models
ai.get('/models', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/ai/models`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Run an AI model (prompt)
ai.post('/run', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json();
    const modelName = body.model || '@cf/meta/llama-2-7b-chat-int8';

    // For health check, use a simple test prompt
    const prompt = body.prompt || body.text || ['Hello'];
    const payload = {
      ...body,
      text: Array.isArray(prompt) ? prompt : [prompt],
    };

    const response = await apiClient.post(
      `/accounts/${accountId}/ai/run/${modelName}`,
      payload
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

// Run a specific AI model
ai.post('/run/:modelName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const modelName = c.req.param('modelName');
    const body = await c.req.json();

    const response = await apiClient.post(
      `/accounts/${accountId}/ai/run/${modelName}`,
      body
    );
    return c.json(response);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, error.status || 500);
  }
});

export default ai;

