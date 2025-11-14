import { Hono } from 'hono';
import { Env, Variables } from '../types';
import { TokenManagerService } from '../services/token-manager';

const tokenRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /tokens/health
 * Check the health of both account and user tokens
 */
tokenRoutes.get('/health', async (c) => {
  try {
    const autoHeal = c.req.query('auto_heal') === 'true';
    const tokenManager = new TokenManagerService(c.env);

    const report = await tokenManager.checkTokenHealth(autoHeal);

    return c.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    console.error('Token health check failed:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to check token health',
        message: error.message,
      },
      500
    );
  }
});

/**
 * POST /tokens/heal
 * Attempt to auto-heal both tokens by adding missing permissions
 */
tokenRoutes.post('/heal', async (c) => {
  try {
    const tokenManager = new TokenManagerService(c.env);

    const report = await tokenManager.checkTokenHealth(true);

    if (report.overall_health === 'healthy') {
      return c.json({
        success: true,
        message: 'All tokens are already healthy',
        data: report,
      });
    }

    if (!report.auto_heal_results) {
      return c.json({
        success: false,
        message: 'Auto-heal was not performed (tokens may be invalid or inactive)',
        data: report,
      });
    }

    const accountHealSuccess = report.auto_heal_results.account_token?.success ?? true;
    const userHealSuccess = report.auto_heal_results.user_token?.success ?? true;

    if (accountHealSuccess && userHealSuccess) {
      return c.json({
        success: true,
        message: 'Successfully healed all tokens',
        data: report,
      });
    } else {
      return c.json(
        {
          success: false,
          message: 'Failed to heal some tokens',
          data: report,
        },
        500
      );
    }
  } catch (error: any) {
    console.error('Token healing failed:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to heal tokens',
        message: error.message,
      },
      500
    );
  }
});

/**
 * GET /tokens/history
 * Get token health check history
 */
tokenRoutes.get('/history', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10', 10);
    const tokenManager = new TokenManagerService(c.env);

    const history = await tokenManager.getTokenHealthHistory(limit);

    return c.json({
      success: true,
      data: {
        history,
        count: history.length,
      },
    });
  } catch (error: any) {
    console.error('Failed to get token health history:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to get token health history',
        message: error.message,
      },
      500
    );
  }
});

/**
 * GET /tokens/status
 * Quick status check (no auto-heal)
 */
tokenRoutes.get('/status', async (c) => {
  try {
    const tokenManager = new TokenManagerService(c.env);
    const report = await tokenManager.checkTokenHealth(false);

    return c.json({
      success: true,
      data: {
        overall_health: report.overall_health,
        account_token: {
          is_valid: report.account_token.is_valid,
          is_active: report.account_token.is_active,
          has_all_permissions: report.account_token.has_all_permissions,
          missing_permissions_count: report.account_token.missing_permissions.length,
        },
        user_token: {
          is_valid: report.user_token.is_valid,
          is_active: report.user_token.is_active,
          has_all_permissions: report.user_token.has_all_permissions,
          missing_permissions_count: report.user_token.missing_permissions.length,
        },
        recommendations: report.recommendations,
      },
    });
  } catch (error: any) {
    console.error('Token status check failed:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to check token status',
        message: error.message,
      },
      500
    );
  }
});

/**
 * GET /tokens/permission-groups
 * List all available permission groups from Cloudflare API
 */
tokenRoutes.get('/permission-groups', async (c) => {
  try {
    const tokenManager = new TokenManagerService(c.env);
    const groups = await tokenManager.listPermissionGroups();

    return c.json({
      success: true,
      data: {
        permission_groups: groups,
        count: groups.length,
      },
    });
  } catch (error: any) {
    console.error('Failed to list permission groups:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to list permission groups',
        message: error.message,
      },
      500
    );
  }
});

export default tokenRoutes;

