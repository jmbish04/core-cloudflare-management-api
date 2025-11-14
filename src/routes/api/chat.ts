import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const chatRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// Chat functionality has been removed (tables dropped in migration 0012)
// All chat endpoints return 410 Gone

chatRouter.post('/rooms', async (c) => {
  return c.json({
    success: false,
    error: 'Chat functionality has been removed',
    message: 'The chat system tables were dropped in migration 0012'
  }, 410);
});

chatRouter.get('/rooms', async (c) => {
  return c.json({
    success: false,
    error: 'Chat functionality has been removed',
    message: 'The chat system tables were dropped in migration 0012'
  }, 410);
});

chatRouter.post('/threads', async (c) => {
  return c.json({
    success: false,
    error: 'Chat functionality has been removed',
    message: 'The chat system tables were dropped in migration 0012'
  }, 410);
});

chatRouter.get('/threads/:roomId', async (c) => {
  return c.json({
    success: false,
    error: 'Chat functionality has been removed',
    message: 'The chat system tables were dropped in migration 0012'
  }, 410);
});

chatRouter.post('/messages', async (c) => {
  return c.json({
    success: false,
    error: 'Chat functionality has been removed',
    message: 'The chat system tables were dropped in migration 0012'
  }, 410);
});

chatRouter.get('/messages/:threadId', async (c) => {
  return c.json({
    success: false,
    error: 'Chat functionality has been removed',
    message: 'The chat system tables were dropped in migration 0012'
  }, 410);
});

export default chatRouter;
