import { Context, Next } from 'hono';
import { Env } from '../types';

/**
 * Authentication middleware
 * Validates Bearer token against WORKER_API_KEY secret
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing Authorization header',
        },
      },
      401
    );
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid Authorization header format. Expected: Bearer <token>',
        },
      },
      401
    );
  }

  const validToken = c.env.WORKER_API_KEY;

  if (token !== validToken) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Invalid API key',
        },
      },
      403
    );
  }

  // Store auth key prefix for audit logging (first 8 chars)
  c.set('authKeyUsed' as any, token.substring(0, 8) + '...');

  await next();
}
