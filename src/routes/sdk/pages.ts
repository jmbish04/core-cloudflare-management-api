import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const pages = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * SDK Pages Routes - 1:1 proxy to Cloudflare API
 */

// List all projects
pages.get('/projects', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');

    const projects = await cf.pages.projects.list({ account_id: accountId });

    return c.json({ success: true, result: projects });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get project
pages.get('/projects/:projectName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    const project = await cf.pages.projects.get(projectName, { account_id: accountId });

    return c.json({ success: true, result: project });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Create project
pages.post('/projects', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const project = await cf.pages.projects.create({
      account_id: accountId,
      ...body,
    });

    return c.json({ success: true, result: project }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete project
pages.delete('/projects/:projectName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    await cf.pages.projects.delete(projectName, { account_id: accountId });

    return c.json({ success: true, result: { id: projectName } });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// List deployments
pages.get('/projects/:projectName/deployments', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const projectName = c.req.param('projectName');

    const deployments = await cf.pages.projects.deployments.list(projectName, { account_id: accountId });

    return c.json({ success: true, result: deployments });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default pages;
