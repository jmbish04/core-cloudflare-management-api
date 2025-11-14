import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const projectsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// Projects functionality has been removed (table dropped in migration 0012)
// All projects endpoints return 410 Gone

projectsRouter.post('/', async (c) => {
  return c.json({
    success: false,
    error: 'Projects functionality has been removed',
    message: 'The projects table was dropped in migration 0012'
  }, 410);
});

projectsRouter.get('/', async (c) => {
  return c.json({
    success: false,
    error: 'Projects functionality has been removed',
    message: 'The projects table was dropped in migration 0012'
  }, 410);
});

projectsRouter.get('/:projectId', async (c) => {
  return c.json({
    success: false,
    error: 'Projects functionality has been removed',
    message: 'The projects table was dropped in migration 0012'
  }, 410);
});

projectsRouter.put('/:projectId', async (c) => {
  return c.json({
    success: false,
    error: 'Projects functionality has been removed',
    message: 'The projects table was dropped in migration 0012'
  }, 410);
});

projectsRouter.delete('/:projectId', async (c) => {
  return c.json({
    success: false,
    error: 'Projects functionality has been removed',
    message: 'The projects table was dropped in migration 0012'
  }, 410);
});

export default projectsRouter;
