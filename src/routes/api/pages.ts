import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const pages = new Hono<{ Bindings: Env; Variables: Variables }>();

// List all Pages projects
pages.get('/projects', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');

    const response = await apiClient.get(
      `/accounts/${accountId}/pages/projects`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
});

// Get a single Pages project
pages.get('/projects/:projectName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    const response = await apiClient.get(
      `/accounts/${accountId}/pages/projects/${projectName}`
    );
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Create a Pages project
pages.post('/projects', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const response = await apiClient.post(
      `/accounts/${accountId}/pages/projects`,
      body
    );
    return c.json(response, 201);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
});

// Delete a Pages project
pages.delete('/projects/:projectName', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    await apiClient.delete(
      `/accounts/${accountId}/pages/projects/${projectName}`
    );
    return c.json({ success: true, result: { id: projectName } });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// List deployments for a Pages project
pages.get('/projects/:projectName/deployments', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    const response = await apiClient.get(
      `/accounts/${accountId}/pages/projects/${projectName}/deployments`
    );
    return c.json(response);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
});

export default pages;
