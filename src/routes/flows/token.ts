import { Hono } from 'hono';
import { Env, Variables, ManagedToken, CreateTokenRequest, generateUUID, calculateExpiresAt } from '../../types';

const tokenFlows = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Intelligent Token Management Flows
 *
 * This provides the value-add layer over basic token APIs:
 * - Enforces 50-token limit with intelligent cleanup
 * - Stores tokens securely in MANAGED_SECRETS (user never sees value)
 * - Maintains audit trail in D1 with context and purpose
 * - Supports TTL-based auto-cleanup
 * - Tracks token usage and related resources
 */

// Create managed token with intelligent workflow
tokenFlows.post('/create', async (c) => {
  try {
    const cf = c.get('cf');
    const db = c.env.TOKEN_AUDIT_DB;
    const accountId = c.get('accountId');
    const secretStoreId = c.env.MANAGED_SECRETS_STORE;
    const body: CreateTokenRequest = await c.req.json();

    // Step 1: Check token count and enforce 50-token limit
    const countResult = await db
      .prepare("SELECT COUNT(*) as count FROM managed_tokens WHERE status = 'active'")
      .first<{ count: number }>();

    const activeCount = countResult?.count || 0;

    if (activeCount >= 50) {
      // Try to clean up expired tokens first
      const now = new Date().toISOString();
      await db
        .prepare("UPDATE managed_tokens SET status = 'expired' WHERE expires_at < ? AND status = 'active'")
        .bind(now)
        .run();

      // Check again
      const newCountResult = await db
        .prepare("SELECT COUNT(*) as count FROM managed_tokens WHERE status = 'active'")
        .first<{ count: number }>();

      if ((newCountResult?.count || 0) >= 50) {
        return c.json(
          {
            success: false,
            error: 'Token limit (50) reached. Please revoke unused tokens or wait for TTL expiration.',
            active_count: newCountResult?.count,
          },
          400
        );
      }
    }

    // Step 2: Create token via Cloudflare API
    let tokenResponse;
    try {
      tokenResponse = await cf.user.tokens.create({
        name: body.name,
        policies: body.policies,
        not_before: body.not_before,
        expires_on: body.expires_on || calculateExpiresAt(body.ttl_days),
        condition: body.condition,
      });
    } catch (error: any) {
      console.error('Failed to create token via Cloudflare API:', error);
      return c.json(
        {
          success: false,
          error: 'Failed to create token',
          details: error.message,
        },
        500
      );
    }

    // Step 3: Store token value in Secret Store via SDK
    const secretKey = `MANAGED_TOKEN_${body.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
    try {
      await cf.accounts.secrets.create(accountId, secretStoreId, {
        name: secretKey,
        text: tokenResponse.value,
        type: 'secret_text',
      });
    } catch (error: any) {
      // Rollback: Delete the token we just created
      console.error('Failed to save token to Secret Store, rolling back:', error);
      try {
        await cf.user.tokens.delete(tokenResponse.id);
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      return c.json(
        {
          success: false,
          error: 'Failed to save token to Secret Store. Operation rolled back.',
          details: error.message,
        },
        500
      );
    }

    // Step 4: Store metadata in D1
    const tokenRecord: ManagedToken = {
      id: generateUUID(),
      token_name: body.name,
      token_id: tokenResponse.id,
      purpose: body.purpose,
      created_at: new Date().toISOString(),
      created_by: c.req.header('x-user-id') || 'system',
      expires_at: body.expires_on || calculateExpiresAt(body.ttl_days),
      ttl_days: body.ttl_days,
      permissions: JSON.stringify(body.permissions),
      related_resources: body.related_resources ? JSON.stringify(body.related_resources) : undefined,
      secret_key: secretKey,
      status: 'active',
      use_count: 0,
      metadata: JSON.stringify({
        policies: body.policies,
        condition: body.condition,
      }),
    };

    try {
      await db
        .prepare(
          `INSERT INTO managed_tokens (
            id, token_name, token_id, purpose, created_at, created_by,
            expires_at, ttl_days, permissions, related_resources,
            secret_key, status, use_count, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          tokenRecord.id,
          tokenRecord.token_name,
          tokenRecord.token_id,
          tokenRecord.purpose,
          tokenRecord.created_at,
          tokenRecord.created_by,
          tokenRecord.expires_at,
          tokenRecord.ttl_days,
          tokenRecord.permissions,
          tokenRecord.related_resources,
          tokenRecord.secret_key,
          tokenRecord.status,
          tokenRecord.use_count,
          tokenRecord.metadata
        )
        .run();
    } catch (error: any) {
      // Rollback: Delete token and secret
      console.error('Failed to save token metadata to D1, rolling back:', error);
      try {
        await cf.user.tokens.delete(tokenResponse.id);
        await cf.accounts.secrets.delete(accountId, secretStoreId, secretKey);
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      return c.json(
        {
          success: false,
          error: 'Failed to save token metadata to D1. Operation rolled back.',
          details: error.message,
        },
        500
      );
    }

    // Step 5: Return success (note: token value is NOT returned)
    return c.json(
      {
        success: true,
        result: {
          id: tokenRecord.id,
          token_id: tokenRecord.token_id,
          token_name: tokenRecord.token_name,
          purpose: tokenRecord.purpose,
          expires_at: tokenRecord.expires_at,
          secret_key: secretKey, // Internal reference only
          message: 'Token created and stored securely. Value is in MANAGED_SECRETS.',
        },
      },
      201
    );
  } catch (error: any) {
    console.error('Error in token creation flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get managed token (retrieves actual value from secret store)
tokenFlows.get('/:tokenId/value', async (c) => {
  try {
    const cf = c.get('cf');
    const db = c.env.TOKEN_AUDIT_DB;
    const accountId = c.get('accountId');
    const secretStoreId = c.env.MANAGED_SECRETS_STORE;
    const tokenId = c.req.param('tokenId');

    // Get token metadata
    const record = await db
      .prepare('SELECT * FROM managed_tokens WHERE id = ? OR token_id = ?')
      .bind(tokenId, tokenId)
      .first<ManagedToken>();

    if (!record) {
      return c.json({ success: false, error: 'Token not found' }, 404);
    }

    if (record.status !== 'active') {
      return c.json({ success: false, error: `Token is ${record.status}` }, 400);
    }

    // Retrieve actual token value from Secret Store
    const secretResponse = await cf.accounts.secrets.get(
      accountId,
      secretStoreId,
      record.secret_key
    );

    // Update last_used_at and use_count
    await db
      .prepare('UPDATE managed_tokens SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?')
      .bind(new Date().toISOString(), record.id)
      .run();

    return c.json({
      success: true,
      result: {
        value: secretResponse.value || secretResponse.text,
        metadata: record,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// List all managed tokens
tokenFlows.get('/', async (c) => {
  try {
    const db = c.env.TOKEN_AUDIT_DB;
    const status = c.req.query('status') || 'active';

    const query = status === 'all'
      ? 'SELECT * FROM managed_tokens ORDER BY created_at DESC'
      : 'SELECT * FROM managed_tokens WHERE status = ? ORDER BY created_at DESC';

    const result = await (status === 'all'
      ? db.prepare(query).all<ManagedToken>()
      : db.prepare(query).bind(status).all<ManagedToken>());

    return c.json({
      success: true,
      result: result.results,
      count: result.results?.length || 0,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Revoke managed token
tokenFlows.delete('/:tokenId', async (c) => {
  try {
    const cf = c.get('cf');
    const db = c.env.TOKEN_AUDIT_DB;
    const accountId = c.get('accountId');
    const secretStoreId = c.env.MANAGED_SECRETS_STORE;
    const tokenId = c.req.param('tokenId');

    // Get token record
    const record = await db
      .prepare('SELECT * FROM managed_tokens WHERE id = ? OR token_id = ?')
      .bind(tokenId, tokenId)
      .first<ManagedToken>();

    if (!record) {
      return c.json({ success: false, error: 'Token not found' }, 404);
    }

    // Delete from Cloudflare
    await cf.user.tokens.delete(record.token_id);

    // Delete from secret store
    await cf.accounts.secrets.delete(accountId, secretStoreId, record.secret_key);

    // Update status in D1
    await db
      .prepare("UPDATE managed_tokens SET status = 'revoked' WHERE id = ?")
      .bind(record.id)
      .run();

    return c.json({
      success: true,
      result: { id: record.id, token_id: record.token_id },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Cleanup expired tokens (can be called by scheduled handler)
tokenFlows.post('/cleanup', async (c) => {
  try {
    const cf = c.get('cf');
    const db = c.env.TOKEN_AUDIT_DB;
    const accountId = c.get('accountId');
    const secretStoreId = c.env.MANAGED_SECRETS_STORE;
    const now = new Date().toISOString();

    // Find expired tokens
    const expiredTokens = await db
      .prepare("SELECT * FROM managed_tokens WHERE expires_at < ? AND status = 'active'")
      .bind(now)
      .all<ManagedToken>();

    let cleaned = 0;

    for (const token of expiredTokens.results || []) {
      try {
        // Delete from Cloudflare
        await cf.user.tokens.delete(token.token_id);

        // Delete from secret store
        await cf.accounts.secrets.delete(accountId, secretStoreId, token.secret_key);

        // Update status
        await db
          .prepare("UPDATE managed_tokens SET status = 'expired' WHERE id = ?")
          .bind(token.id)
          .run();

        cleaned++;
      } catch (error) {
        console.error(`Failed to cleanup token ${token.id}:`, error);
      }
    }

    return c.json({
      success: true,
      result: {
        cleaned_count: cleaned,
        total_expired: expiredTokens.results?.length || 0,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get token audit trail
tokenFlows.get('/:tokenId/audit', async (c) => {
  try {
    const db = c.env.TOKEN_AUDIT_DB;
    const tokenId = c.req.param('tokenId');

    const record = await db
      .prepare('SELECT * FROM managed_tokens WHERE id = ? OR token_id = ?')
      .bind(tokenId, tokenId)
      .first<ManagedToken>();

    if (!record) {
      return c.json({ success: false, error: 'Token not found' }, 404);
    }

    return c.json({
      success: true,
      result: {
        ...record,
        secret_key: '[REDACTED]', // Never expose secret key
        permissions: JSON.parse(record.permissions),
        related_resources: record.related_resources ? JSON.parse(record.related_resources) : null,
        metadata: record.metadata ? JSON.parse(record.metadata) : null,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default tokenFlows;
