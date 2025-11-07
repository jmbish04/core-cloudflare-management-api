import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const tokens = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * SDK Tokens Routes - 1:1 proxy to Cloudflare API
 * Basic token operations without the intelligent management layer
 */

// List all tokens
tokens.get('/', async (c) => {
  try {
    const cf = c.get('cf');

    const tokenList = await cf.user.tokens.list();

    return c.json({ success: true, result: tokenList });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get token details
tokens.get('/:tokenId', async (c) => {
  try {
    const cf = c.get('cf');
    const tokenId = c.req.param('tokenId');

    const token = await cf.user.tokens.get(tokenId);

    return c.json({ success: true, result: token });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Create token (basic - use /flows/token for intelligent creation)
tokens.post('/', async (c) => {
  try {
    const cf = c.get('cf');
    const body = await c.req.json();

    const token = await cf.user.tokens.create(body);

    return c.json({ success: true, result: token }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete token
tokens.delete('/:tokenId', async (c) => {
  try {
    const cf = c.get('cf');
    const tokenId = c.req.param('tokenId');

    await cf.user.tokens.delete(tokenId);

    return c.json({ success: true, result: { id: tokenId } });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Verify token
tokens.get('/verify', async (c) => {
  try {
    const cf = c.get('cf');

    const result = await cf.user.tokens.verify();

    return c.json({ success: true, result });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 401);
  }
});

export default tokens;
