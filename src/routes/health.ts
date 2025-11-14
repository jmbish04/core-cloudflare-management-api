import { Hono } from 'hono';
import { Env, Variables, generateUUID } from '../types';
import { HealthCheckService } from '../services/health-check';
import { autoTuneThreshold } from '../services/coachTelemetry';
import { generateOpenAPISpec, jsonToYaml } from '../services/openapi-generator';
import { initDb, Database } from '../db/client';
import { Kysely } from 'kysely';


const healthRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Health & Documentation Routes
 *
 * - Health check endpoints
 * - OpenAPI documentation (JSON/YAML)
 * - System status
 */

// Run comprehensive health check
healthRoutes.post('/check', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { auto_heal = true } = body; // Auto-heal enabled by default

    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const internalFetch = await buildInternalFetch(c, baseUrl);

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, internalFetch, loggingService);
    const result = await healthService.runHealthCheck();

    // Save to legacy health_checks table (for backward compatibility)
    // Note: Results are already saved to health_test_results in runHealthCheck()
    try {
      await healthService.saveHealthCheck(result);
    } catch (saveError: any) {
      // Log but don't fail the health check - legacy table is optional
      console.warn('Failed to save to legacy health_checks table:', saveError.message);
    }

    // If auto-heal is enabled and there are failures, trigger self-healing
    let healingResults = null;
    if (auto_heal && result.unhealthy_endpoints > 0) {
      try {
        const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || '';
        const { SelfHealingService } = await import('../services/self-healing');
        const healingService = new SelfHealingService(c.env, accountId);
        
        // Get failed tests
        const failedResults = await healthService.getTestResultsWithDefinitions(result.check_group_id);
        const failedTests = failedResults
          .filter((r: any) => r.outcome === 'fail')
          .map((r: any) => ({
            test_result_id: r.id,
            test_id: r.health_test_id,
            test_name: r.health_test?.name || 'Unknown',
            endpoint_path: r.health_test?.endpoint_path || '',
            http_method: r.health_test?.http_method || 'GET',
            status: r.status,
            status_text: r.status_text,
            error_message: r.error_message,
            response_body: r.response_body,
            health_check_group_id: result.check_group_id,
          }));

        if (failedTests.length > 0) {
          healingResults = await healingService.analyzeAndHeal(result.check_group_id, failedTests);
        }
      } catch (healError: any) {
        console.error('Auto-healing failed:', healError);
        // Don't fail the health check if healing fails
      }
    }

    return c.json({
      success: true,
      result,
      healing: healingResults ? {
        attempted: true,
        results: healingResults,
      } : null,
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    return c.json({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }, 500);
  }
});

// Get latest health check with full self-healing details
healthRoutes.get('/latest', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;
    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || '';

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    const result = await healthService.getLatestHealthCheck();

    if (!result) {
      return c.json({
        success: false,
        error: 'No health check data available',
      }, 404);
    }

    // Get self-healing attempts with steps for this health check
    const { SelfHealingService } = await import('../services/self-healing');
    const healingService = new SelfHealingService(c.env, accountId);
    const healingAttempts = await healingService.getHealingAttempts(result.check_group_id);

    // Format response to match frontend expectations (legacy unit test format)
    return c.json({
      success: true,
      result: {
        session: {
          sessionUuid: result.check_group_id,
          startedAt: result.checked_at,
          completedAt: result.checked_at,
          status: result.overall_status,
          totalTests: result.total_endpoints,
          passedTests: result.healthy_endpoints,
          failedTests: result.unhealthy_endpoints,
          avgResponseTime: result.avg_response_time,
        },
        tests: result.results.map((r: any) => ({
          testKey: r.endpoint,
          name: r.endpoint,
          status: r.outcome,
          runAt: result.checked_at,
          responseTimeMs: r.response_time_ms,
          statusCode: r.status,
          statusText: r.statusText,
          category: r.category,
          scope: 'api',
        })),
        selfHealing: healingAttempts.length > 0 ? {
          results: healingAttempts.map((a: any) => ({
            testKey: a.health_test_id,
            status: a.status,
            aiAnalysis: a.ai_analysis,
            aiRecommendation: a.ai_recommendation,
            healingAction: a.healing_action,
            actionDetails: a.action_details,
            steps: a.steps || [],
          })),
        } : null,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get health check history
healthRoutes.get('/history', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    // Health check history not implemented yet
    const results: any[] = [];

    return c.json({
      success: true,
      result: results,
      count: results.length,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

const buildInternalFetch = async (ctx: any, baseUrl: string) => {
  const { default: mainApp } = await import('../index');
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url, baseUrl);
    const absoluteRequest = new Request(url.toString(), request);
    return await mainApp.fetch(absoluteRequest, ctx.env, ctx.executionCtx);
  };
};

const serializeDefinition = (definition: any) => ({
  id: definition.id,
  testKey: definition.testKey,
  name: definition.name,
  scope: definition.scope,
  category: definition.category,
  description: definition.description,
  executorKey: definition.executorKey,
  metadata: definition.metadataParsed,
  errorMeanings: definition.errorMeanings,
  errorSolutions: definition.errorSolutions,
  isActive: definition.isActive,
  createdAt: definition.createdAt,
  updatedAt: definition.updatedAt,
});

const serializeResult = (item: any) => ({
  definitionId: item.definition.id,
  testKey: item.definition.testKey,
  name: item.definition.name,
  status: item.result.status,
  runAt: item.runAt,
  httpStatus: item.result.httpStatus ?? null,
  httpStatusText: item.result.httpStatusText ?? null,
  totalMs: item.result.totalMs,
  verboseOutput: item.result.verboseOutput ?? null,
  errorDetails: item.result.errorDetails ?? null,
  aiPromptToFixError: item.ai.prompt,
  aiHumanReadableErrorDescription: item.ai.humanReadable,
  aiModelResponse: item.ai.modelResponse,
  metadata: item.definition.metadataParsed,
  errorMeanings: item.definition.errorMeanings,
  errorSolutions: item.definition.errorSolutions,
});

healthRoutes.post('/tests/run', async (c) => {
  try {
    let body: { triggerSource?: string };
    try {
      body = (await c.req.json()) as { triggerSource?: string };
    } catch {
      body = {};
    }
    const { triggerSource = 'manual' } = body;

    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const internalFetch = await buildInternalFetch(c, baseUrl);

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, internalFetch, loggingService);
    const result = await healthService.runHealthCheck();

    // Save to legacy health_checks table (for backward compatibility)
    // Note: Results are already saved to health_test_results in runHealthCheck()
    try {
      await healthService.saveHealthCheck(result);
    } catch (saveError: any) {
      // Log but don't fail the health check - legacy table is optional
      console.warn('Failed to save to legacy health_checks table:', saveError.message);
    }

    // If auto-heal is enabled and there are failures, trigger self-healing
    let healingResults = null;
    if (result.unhealthy_endpoints > 0) {
      try {
        const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || '';
        const { SelfHealingService } = await import('../services/self-healing');
        const healingService = new SelfHealingService(c.env, accountId);

        // Get failed tests
        const failedResults = await healthService.getTestResultsWithDefinitions(result.check_group_id);
        const failedTests = failedResults
          .filter((r: any) => r.outcome === 'fail')
          .map((r: any) => ({
            test_result_id: r.id,
            test_id: r.health_test_id,
            test_name: r.health_test?.name || 'Unknown',
            endpoint_path: r.health_test?.endpoint_path || '',
            http_method: r.health_test?.http_method || 'GET',
            status: r.status,
            status_text: r.status_text,
            error_message: r.error_message,
            response_body: r.response_body,
            health_check_group_id: result.check_group_id,
          }));

        if (failedTests.length > 0) {
          healingResults = await healingService.analyzeAndHeal(result.check_group_id, failedTests);
        }
      } catch (healError: any) {
        console.error('Self-healing failed:', healError);
        // Don't fail the health check if healing fails
      }
    }

    return c.json({
      success: true,
      result: {
        ...result,
        healing_results: healingResults,
        trigger_source: triggerSource,
      },
    });
  } catch (error: any) {
    console.error('Error in /tests/run:', error);
    return c.json({
      success: false,
      error: error.message || 'Internal server error'
    }, 500);
  }
});

healthRoutes.get('/unit-tests', async (c) => {
  // Unit tests have been consolidated into health checks
  return c.json({
    success: false,
    error: 'Unit tests endpoint deprecated - use /health/tests instead',
    message: 'Unit tests have been consolidated into the health check system'
  }, 410);
});

healthRoutes.get('/tests/session/latest', async (c) => {
  // Unit tests have been consolidated into health checks
  return c.json({
    success: false,
    error: 'Unit tests endpoint deprecated - use /health/tests/results instead',
    message: 'Unit tests have been consolidated into the health check system'
  }, 410);
  /* Old code - deprecated
  try {
    const unitTestService = new UnitTestService(c.env);
    await unitTestService.ensureDefinitionsRegistered(); // Ensure definitions are registered
    const session = await unitTestService.getLatestSession();
    if (!session) {
      return c.json({
        success: true,
        result: null,
        message: 'No unit test sessions recorded yet.',
      });
    }
    return c.json({
      success: true,
      result: {
        session: {
          sessionUuid: session.sessionUuid,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          triggerSource: session.triggerSource,
          totalTests: session.totalTests,
          passedTests: session.passedTests,
          failedTests: session.failedTests,
          durationMs: session.durationMs,
        },
        results: session.results.map(serializeResult),
      },
    });
  } catch (error: any) {
    console.error('Error in /tests/session/latest:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack
    }, 500);
  }
  */
});

healthRoutes.get('/tests/session/:sessionUuid', async (c) => {
  // Unit tests have been consolidated into health checks
  return c.json({
    success: false,
    error: 'Unit tests endpoint deprecated - use /health/tests/results instead',
    message: 'Unit tests have been consolidated into the health check system'
  }, 410);
  /* Old code - deprecated
  try {
    const sessionUuid = c.req.param('sessionUuid');
    const unitTestService = new UnitTestService(c.env);
    const session = await unitTestService.getSessionSummary(sessionUuid);
    return c.json({
      success: true,
      result: {
        session: {
          sessionUuid: session.sessionUuid,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          triggerSource: session.triggerSource,
          totalTests: session.totalTests,
          passedTests: session.passedTests,
          failedTests: session.failedTests,
          durationMs: session.durationMs,
        },
        results: session.results.map(serializeResult),
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
  */
});

// Get all registered health tests (list health checks endpoint)
healthRoutes.get('/tests', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;
    const includeInactive = c.req.query('include_inactive') === 'true';

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    const tests = await healthService.getRegisteredTests(includeInactive);

    // Format tests to match frontend expectations (legacy unit test format)
    const formattedTests = tests.map((test: any) => ({
      testKey: test.test_key || test.id,
      name: test.name,
      scope: test.scope,
      category: test.category,
      description: test.description,
      executorKey: test.executor_key,
      endpointPath: test.endpoint_path,
      httpMethod: test.http_method,
      enabled: test.enabled === 1,
      isActive: test.is_active === 1,
      latestResult: null, // Will be populated by frontend if needed
    }));

    return c.json({
      success: true,
      result: formattedTests,
      count: formattedTests.length,
    });
  } catch (error: any) {
    console.error('Error fetching health tests:', error);
    return c.json({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }, 500);
  }
});

// Get test results with definitions
healthRoutes.get('/results', async (c) => {
  try {
    const runGroupId = c.req.query('run_group_id');
    const limit = parseInt(c.req.query('limit') || '100');
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    const results = await healthService.getTestResultsWithDefinitions(
      runGroupId || undefined,
      limit
    );

    return c.json({
      success: true,
      result: results,
      count: results.length,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get all health tests with their latest results (for frontend)
healthRoutes.get('/tests-with-results', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    const testsWithResults = await healthService.getTestsWithLatestResults();

    return c.json({
      success: true,
      result: testsWithResults,
      count: testsWithResults.length,
    });
  } catch (error: any) {
    console.error('Error in /tests-with-results:', error);
    return c.json({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }, 500);
  }
});

// Database sync endpoints for health tests
healthRoutes.post('/db/tokens', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    await healthService.syncTokensFromApiResponse(null); // Force token verification update

    return c.json({
      success: true,
      message: 'Token table sync completed successfully'
    });
  } catch (error: any) {
    console.error('Token table sync failed:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack
    }, 500);
  }
});

healthRoutes.post('/db/permissions', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    const result = await healthService.syncPermissionsMap();

    if (result.success) {
      return c.json({
        success: true,
        message: result.message,
        permissionsCount: result.permissionsCount
      });
    } else {
      return c.json({
        success: false,
        error: result.message,
        permissionsCount: result.permissionsCount
      }, 500);
    }
  } catch (error: any) {
    console.error('API permissions map sync failed:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack
    }, 500);
  }
});

// Logging and session management endpoints

// Get recent sessions
healthRoutes.get('/sessions', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const requestType = c.req.query('request_type');

    const db = initDb(c.env);
    let query = db
      .selectFrom('sessions')
      .selectAll()
      .orderBy('started_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (requestType) {
      query = query.where('request_type', '=', requestType);
    }

    const sessions = await query.execute();

    return c.json({
      success: true,
      result: sessions,
      count: sessions.length,
      limit,
      offset,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get actions for a specific session
healthRoutes.get('/sessions/:sessionId/actions', async (c) => {
  try {
    const sessionId = c.req.param('sessionId');
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');

    const db = initDb(c.env);
    const actions = await db
      .selectFrom('actions_log')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('sequence_number', 'asc')
      .limit(limit)
      .offset(offset)
      .execute();

    return c.json({
      success: true,
      result: actions,
      session_id: sessionId,
      count: actions.length,
      limit,
      offset,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get recent actions across all sessions
healthRoutes.get('/actions', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');
    const offset = parseInt(c.req.query('offset') || '0');
    const actionType = c.req.query('action_type');
    const sessionId = c.req.query('session_id');

    const db = initDb(c.env);
    let query = db
      .selectFrom('actions_log')
      .innerJoin('sessions', 'sessions.session_id', 'actions_log.session_id')
      .select([
        'actions_log.id',
        'actions_log.session_id',
        'actions_log.action_type',
        'actions_log.action_name',
        'actions_log.timestamp',
        'actions_log.duration_ms',
        'actions_log.status',
        'actions_log.input_data',
        'actions_log.output_data',
        'actions_log.error_message',
        'actions_log.sequence_number',
        'sessions.request_type',
        'sessions.request_path',
        'sessions.account_id',
        'sessions.user_id',
      ])
      .orderBy('actions_log.timestamp', 'desc')
      .limit(limit)
      .offset(offset);

    if (actionType) {
      query = query.where('actions_log.action_type', '=', actionType);
    }

    if (sessionId) {
      query = query.where('actions_log.session_id', '=', sessionId);
    }

    const actions = await query.execute();

    return c.json({
      success: true,
      result: actions,
      count: actions.length,
      limit,
      offset,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get session statistics
healthRoutes.get('/sessions/stats', async (c) => {
  try {
    const db = initDb(c.env);

    // Get request type distribution
    const requestTypeStats = await db
      .selectFrom('sessions')
      .select(['request_type'])
      .select((eb) => eb.fn.count('request_type').as('count'))
      .groupBy('request_type')
      .execute();

    // Get recent error sessions
    const errorSessions = await db
      .selectFrom('sessions')
      .select(['session_id', 'request_type', 'error_message', 'started_at'])
      .where('error_message', 'is not', null)
      .orderBy('started_at', 'desc')
      .limit(10)
      .execute();

    // Get average response times
    const avgResponseTime = await db
      .selectFrom('sessions')
      .select((eb) => eb.fn.avg('duration_ms').as('avg_duration'))
      .where('duration_ms', 'is not', null)
      .executeTakeFirst();

    return c.json({
      success: true,
      result: {
        request_type_distribution: requestTypeStats,
        recent_errors: errorSessions,
        average_response_time_ms: avgResponseTime?.avg_duration || null,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get comprehensive system statistics and metrics
healthRoutes.get('/stats', async (c) => {
  try {
    const db = initDb(c.env);
    const days = parseInt(c.req.query('days') || '30');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    // Basic session stats
    const sessionStats = await db
      .selectFrom('sessions')
      .select([
        (eb) => eb.fn.count('id').as('total_sessions'),
        (eb) => eb.fn.avg('duration_ms').as('avg_response_time'),
        (eb) => eb.fn.min('started_at').as('earliest_session'),
        (eb) => eb.fn.max('started_at').as('latest_session'),
      ])
      .where('started_at', '>=', cutoffDateStr)
      .executeTakeFirst();

    // Request type breakdown
    const requestTypeStats = await db
      .selectFrom('sessions')
      .select(['request_type'])
      .select((eb) => eb.fn.count('request_type').as('count'))
      .where('started_at', '>=', cutoffDateStr)
      .groupBy('request_type')
      .execute();

    // Error rate
    const errorStats = await db
      .selectFrom('sessions')
      .select([
        (eb) => eb.fn.count('id').as('total_sessions'),
        (eb) => eb.fn.countAll().as('error_sessions'),
      ])
      .where('started_at', '>=', cutoffDateStr)
      .where('error_message', 'is not', null)
      .executeTakeFirst();
    
    const totalSessionsForError = await db
      .selectFrom('sessions')
      .select((eb) => eb.fn.count('id').as('total'))
      .where('started_at', '>=', cutoffDateStr)
      .executeTakeFirst();
    
    const errorStatsFixed = {
      total_sessions: totalSessionsForError?.total || 0,
      error_sessions: errorStats?.error_sessions || 0,
    };

    // Action statistics
    const totalActions = await db
      .selectFrom('actions_log')
      .innerJoin('sessions', 'sessions.session_id', 'actions_log.session_id')
      .select([
        (eb) => eb.fn.count('actions_log.id').as('total_actions'),
        (eb) => eb.fn.avg('actions_log.duration_ms').as('avg_action_time'),
      ])
      .where('sessions.started_at', '>=', cutoffDateStr)
      .executeTakeFirst();
    
    const failedActions = await db
      .selectFrom('actions_log')
      .innerJoin('sessions', 'sessions.session_id', 'actions_log.session_id')
      .select((eb) => eb.fn.count('actions_log.id').as('failed'))
      .where('sessions.started_at', '>=', cutoffDateStr)
      .where('actions_log.status', '=', 'failed')
      .executeTakeFirst();
    
    const actionStats = {
      total_actions: totalActions?.total_actions || 0,
      failed_actions: failedActions?.failed || 0,
      avg_action_time: totalActions?.avg_action_time || 0,
    };

    // Health check statistics
    const healthStats = await db
      .selectFrom('health_test_results')
      .select([
        (eb) => eb.fn.count('id').as('total_tests'),
        (eb) => eb.fn.sum(
          eb.case().when('outcome', '=', 'fail').then(1).else(0).end()
        ).as('failed_tests'),
        (eb) => eb.fn.sum(
          eb.case().when('outcome', '=', 'pass').then(1).else(0).end()
        ).as('passed_tests'),
        (eb) => eb.fn.avg('response_time_ms').as('avg_response_time'),
      ])
      .where('run_at', '>=', cutoffDateStr)
      .executeTakeFirst();

    // Self-healing statistics
    const healingStats = await db
      .selectFrom('self_healing_attempts')
      .select([
        (eb) => eb.fn.count('id').as('total_attempts'),
        (eb) => eb.fn.sum(
          eb.case().when('status', '=', 'success').then(1).else(0).end()
        ).as('successful_healings'),
        (eb) => eb.fn.sum(
          eb.case().when('status', '=', 'failed').then(1).else(0).end()
        ).as('failed_healings'),
      ])
      .where('created_at', '>=', cutoffDateStr)
      .executeTakeFirst();

    // Token and permissions stats
    const tokenStats = await db
      .selectFrom('manage_tokens')
      .select([
        (eb) => eb.fn.count('id').as('total_tokens'),
        (eb) => eb.fn.sum(
          eb.case().when('status', '=', 'active').then(1).else(0).end()
        ).as('active_tokens'),
        (eb) => eb.fn.sum(
          eb.case().when('status', '=', 'inactive').then(1).else(0).end()
        ).as('inactive_tokens'),
        (eb) => eb.fn.sum(
          eb.case().when('status', '=', 'deleted').then(1).else(0).end()
        ).as('deleted_tokens'),
      ])
      .executeTakeFirst();

    const permissionStats = await db
      .selectFrom('api_permissions_map')
      .select([
        (eb) => eb.fn.count('id').as('total_permissions'),
      ])
      .executeTakeFirst();

    return c.json({
      success: true,
      result: {
        period_days: days,
        sessions: sessionStats || { total_sessions: 0, avg_response_time: 0 },
        request_types: requestTypeStats || [],
        error_rate: errorStatsFixed ? {
          total_sessions: Number(errorStatsFixed.total_sessions) || 0,
          error_sessions: Number(errorStatsFixed.error_sessions) || 0,
          error_rate_percent: Number(errorStatsFixed.total_sessions) > 0 ?
            ((Number(errorStatsFixed.error_sessions) / Number(errorStatsFixed.total_sessions)) * 100).toFixed(2) : '0',
        } : { total_sessions: 0, error_sessions: 0, error_rate_percent: '0' },
        actions: actionStats || { total_actions: 0, failed_actions: 0, avg_action_time: 0 },
        health_checks: healthStats || { total_tests: 0, failed_tests: 0, passed_tests: 0, avg_response_time: 0 },
        self_healing: healingStats ? {
          total_attempts: Number(healingStats.total_attempts) || 0,
          successful_healings: Number(healingStats.successful_healings) || 0,
          failed_healings: Number(healingStats.failed_healings) || 0,
          success_rate_percent: Number(healingStats.total_attempts) > 0 ?
            ((Number(healingStats.successful_healings) / Number(healingStats.total_attempts)) * 100).toFixed(2) : '0',
        } : { total_attempts: 0, successful_healings: 0, failed_healings: 0, success_rate_percent: '0' },
        tokens: tokenStats ? {
          total_tokens: Number(tokenStats.total_tokens) || 0,
          active_tokens: Number(tokenStats.active_tokens) || 0,
          inactive_tokens: Number(tokenStats.inactive_tokens) || 0,
          deleted_tokens: Number(tokenStats.deleted_tokens) || 0,
        } : { total_tokens: 0, active_tokens: 0, inactive_tokens: 0, deleted_tokens: 0 },
        permissions: permissionStats || { total_permissions: 0 },
      },
    });
  } catch (error: any) {
    console.error('Error in /health/stats:', error);
    return c.json({ success: false, error: error.message, stack: error.stack }, 500);
  }
});

// Get AI insights carousel data
healthRoutes.get('/insights', async (c) => {
  try {
    const db = initDb(c.env);
    const days = parseInt(c.req.query('days') || '30');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    // Get recent actions for AI analysis (limit to prevent token overflow)
    const recentActions = await db
      .selectFrom('actions_log')
      .innerJoin('sessions', 'sessions.session_id', 'actions_log.session_id')
      .select([
        'actions_log.action_type',
        'actions_log.action_name',
        'actions_log.status',
        'actions_log.duration_ms',
        'sessions.request_type',
        'sessions.request_method',
        'sessions.request_path',
        'actions_log.timestamp',
      ])
      .where('actions_log.timestamp', '>=', cutoffDateStr)
      .orderBy('actions_log.timestamp', 'desc')
      .limit(500) // Limit for AI processing
      .execute();

    // Get failed health tests with self-healing data
    const failedTestsWithHealing = await db
      .selectFrom('health_test_results')
      .innerJoin('health_tests', 'health_tests.id', 'health_test_results.health_test_id')
      .leftJoin('self_healing_attempts', 'self_healing_attempts.health_test_result_id', 'health_test_results.id')
      .select([
        'health_test_results.id',
        'health_test_results.status',
        'health_test_results.status_text',
        'health_test_results.outcome',
        'health_test_results.run_at',
        'health_tests.name',
        'health_tests.category',
        'health_tests.endpoint_path',
        'self_healing_attempts.status as healing_status',
        'self_healing_attempts.ai_analysis',
        'self_healing_attempts.effectiveness_analysis',
      ])
      .where('health_test_results.outcome', '=', 'fail')
      .where('health_test_results.run_at', '>=', cutoffDateStr)
      .orderBy('health_test_results.run_at', 'desc')
      .limit(100)
      .execute();

    // Get session activity patterns
    const sessionPatterns = await db
      .selectFrom('sessions')
      .select([
        'request_type',
        'request_method',
        'status_code',
        'duration_ms',
        'started_at',
      ])
      .where('started_at', '>=', cutoffDateStr)
      .orderBy('started_at', 'desc')
      .limit(200)
      .execute();

    // Prepare data for AI analysis
    const insightsData = {
      period_days: days,
      actions_summary: {
        total_actions: recentActions.length,
        action_types: recentActions.reduce((acc, action) => {
          acc[action.action_type] = (acc[action.action_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        status_breakdown: recentActions.reduce((acc, action) => {
          acc[action.status] = (acc[action.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      failed_tests: failedTestsWithHealing.map(test => ({
        test_name: test.name,
        category: test.category,
        endpoint: test.endpoint_path,
        status: test.status,
        error: test.status_text,
        healing_attempted: !!test.healing_status,
        healing_status: test.healing_status,
        ai_insights: test.ai_analysis,
        effectiveness: test.effectiveness_analysis,
      })),
      session_patterns: {
        request_types: sessionPatterns.reduce((acc, session) => {
          acc[session.request_type] = (acc[session.request_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        response_times: sessionPatterns
          .filter(s => s.duration_ms)
          .map(s => s.duration_ms),
        status_codes: sessionPatterns.reduce((acc, session) => {
          if (session.status_code) {
            acc[session.status_code] = (acc[session.status_code] || 0) + 1;
          }
          return acc;
        }, {} as Record<number, number>),
      },
    };

    // Use AI to generate insights (simplified version - in production you'd call an AI service)
    let aiInsights = [];
    try {
      aiInsights = await generateAiInsights(insightsData, db, days);
    } catch (insightError: any) {
      console.error('Error generating insights:', insightError);
      // Return basic insight if generation fails
      aiInsights = [{
        type: 'system_info',
        title: 'System Overview',
        insight: `Monitoring ${insightsData.actions_summary.total_actions} actions and ${insightsData.failed_tests.length} test results over the last ${days} days.`,
        priority: 'info',
        ai_prompt: 'Review system health and performance metrics.'
      }];
    }

    return c.json({
      success: true,
      result: {
        data: insightsData,
        insights: aiInsights,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error in /health/insights:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Mark an insight as fixed
healthRoutes.post('/insights/mark-fixed', async (c) => {
  try {
    const body = await c.req.json();
    const { insight_type, insight_category, fix_description, fixed_by = 'manual' } = body;

    if (!insight_type || !fix_description) {
      return c.json({
        success: false,
        error: 'insight_type and fix_description are required',
      }, 400);
    }

    const db = initDb(c.env);
    const now = new Date().toISOString();
    const fixId = generateUUID();

    await db
      .insertInto('insight_fixes')
      .values({
        id: fixId,
        insight_type,
        insight_category: insight_category || null,
        fix_description,
        fixed_at: now,
        fixed_by,
        metadata: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return c.json({
      success: true,
      result: {
        id: fixId,
        insight_type,
        insight_category,
        fix_description,
        fixed_at: now,
        fixed_by,
      },
      message: `Insight '${insight_type}' marked as fixed. Future insights will filter out data before ${now}.`,
    });
  } catch (error: any) {
    console.error('Error marking insight as fixed:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get all insight fixes
healthRoutes.get('/insights/fixes', async (c) => {
  try {
    const db = initDb(c.env);
    const fixes = await db
      .selectFrom('insight_fixes')
      .selectAll()
      .orderBy('fixed_at', 'desc')
      .execute();

    return c.json({
      success: true,
      result: fixes,
      count: fixes.length,
    });
  } catch (error: any) {
    console.error('Error fetching insight fixes:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete an insight fix (to re-enable the insight)
healthRoutes.delete('/insights/fixes/:fixId', async (c) => {
  try {
    const fixId = c.req.param('fixId');
    const db = initDb(c.env);

    await db
      .deleteFrom('insight_fixes')
      .where('id', '=', fixId)
      .execute();

    return c.json({
      success: true,
      message: `Insight fix ${fixId} deleted. The insight will now reappear if the issue persists.`,
    });
  } catch (error: any) {
    console.error('Error deleting insight fix:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// AI insights generation function
async function generateAiInsights(data: any, db?: Kysely<Database>, days: number = 30) {
  const insights = [];

  // Get all insight fixes to filter out already-resolved issues
  const insightFixes = db ? await db
    .selectFrom('insight_fixes')
    .select(['insight_type', 'insight_category', 'fixed_at', 'fix_description'])
    .execute() : [];

  // Helper function to check if an insight type was recently fixed
  const wasRecentlyFixed = (insightType: string, category?: string): { fixed: boolean; fixDate?: string; description?: string } => {
    const relevantFixes = insightFixes.filter(fix => {
      const typeMatches = fix.insight_type === insightType;
      const categoryMatches = !category || !fix.insight_category || fix.insight_category === category;
      return typeMatches && categoryMatches;
    });

    if (relevantFixes.length === 0) return { fixed: false };

    // Get the most recent fix
    const latestFix = relevantFixes.sort((a, b) => 
      new Date(b.fixed_at).getTime() - new Date(a.fixed_at).getTime()
    )[0];

    return {
      fixed: true,
      fixDate: latestFix.fixed_at,
      description: latestFix.fix_description
    };
  };

  // Helper function to get cutoff date for data filtering (only consider data after the fix)
  const getDataCutoffDate = (insightType: string, category?: string): Date | null => {
    const fixInfo = wasRecentlyFixed(insightType, category);
    return fixInfo.fixed ? new Date(fixInfo.fixDate!) : null;
  };

  // Analyze action patterns with specific details
  const actionTypes = Object.entries(data.actions_summary.action_types);
  if (actionTypes.length > 0) {
    const mostCommonAction = actionTypes.reduce((a: [string, any], b: [string, any]) => (a[1] as number) > (b[1] as number) ? a : b);
    const totalActions = Number(data.actions_summary.total_actions);
    const percentage = ((Number(mostCommonAction[1]) / totalActions) * 100).toFixed(1);
    
    // Get top 3 actions for context
    const top3Actions = actionTypes
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);

    const recommendation = mostCommonAction[0] === 'cloudflare_api_call' 
      ? 'High external API usage detected:\n• Monitor rate limits\n• Consider caching responses\n• Review API call frequency' 
      : mostCommonAction[0] === 'request_received' 
      ? 'Heavy inbound traffic:\n• Ensure worker scaling is configured properly\n• Monitor CPU usage\n• Consider rate limiting if needed' 
      : 'Review action distribution to optimize system performance';

    // Only show action patterns if there's an imbalance or issue
    if (Number(percentage) > 80 || mostCommonAction[0] === 'error') {
      insights.push({
        type: 'action_patterns',
        title: `${mostCommonAction[0]} Dominates System Activity`,
        insight: `Out of ${totalActions.toLocaleString()} total actions, ${mostCommonAction[0]} accounts for ${percentage}% (${Number(mostCommonAction[1]).toLocaleString()} occurrences).\n\nTop 3 actions:\n${top3Actions.join('\n')}\n\n${recommendation}`,
        priority: 'info',
        usefulness: mostCommonAction[0] === 'error' ? 'high' : 'medium',
        ai_prompt: `${mostCommonAction[0]} actions dominate system activity at ${percentage}% (${Number(mostCommonAction[1]).toLocaleString()} occurrences out of ${totalActions.toLocaleString()} total). Top actions: ${top3Actions.join(', ')}. Analyze:\n1. Whether this action distribution is expected for the workload\n2. Opportunities to optimize ${mostCommonAction[0]} operations\n3. ${mostCommonAction[0] === 'cloudflare_api_call' ? 'Caching strategies to reduce API calls' : mostCommonAction[0] === 'request_received' ? 'Load balancing and scaling recommendations' : 'Performance optimizations for dominant actions'}\n\nProvide specific recommendations to optimize system efficiency.`
      });
    }
  }

  // Analyze error patterns with specific failure details
  const failedActions = Number(data.actions_summary.status_breakdown.failed) || 0;
  const totalActions = Number(data.actions_summary.total_actions);
  const errorRate = totalActions > 0 ? (failedActions / totalActions) * 100 : 0;

  // Check if error_analysis was recently fixed
  const errorAnalysisFix = wasRecentlyFixed('error_analysis');

  // Only show error insights if there are significant failures AND it wasn't recently fixed
  if (!errorAnalysisFix.fixed && errorRate > 10) {
    // Get specific failed action types
    const failedByType = Object.entries(data.actions_summary.action_types)
      .filter(([_, count]) => Number(count) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3);
    
    insights.push({
      type: 'error_analysis',
      title: `Critical: ${errorRate.toFixed(1)}% Action Failure Rate`,
      insight: `${failedActions.toLocaleString()} out of ${totalActions.toLocaleString()} actions failed. This is ${(errorRate / 10).toFixed(1)}x above the 10% threshold.\n\nImmediate actions:\n1) Check /health/analytics for error patterns\n2) Review recent deployments (last 24h)\n3) Verify Cloudflare API token permissions\n4) Check D1 database connection health\n\nMost active action types: ${failedByType.map(([name]) => name).join(', ')}.`,
      priority: 'high',
      usefulness: 'critical', // Critical because error rate is dangerously high
      ai_prompt: `Analyze the Cloudflare Worker error logs and identify the root cause of the ${errorRate.toFixed(1)}% action failure rate. ${failedActions} out of ${totalActions} actions are failing. Focus on these action types: ${failedByType.map(([name]) => name).join(', ')}. Check:\n1. Recent code changes in the last 24 hours\n2. API token permissions and expiration\n3. D1 database connection issues\n4. Cloudflare API rate limits or service issues\n\nProvide specific fixes for each identified issue.`
    });
  } else if (!errorAnalysisFix.fixed && errorRate > 5) {
    insights.push({
      type: 'error_analysis',
      title: `Elevated Error Rate: ${errorRate.toFixed(1)}%`,
      insight: `${failedActions} actions failed out of ${totalActions.toLocaleString()} total. While below critical threshold (10%), this is elevated.\n\nRecommended actions:\n1) Review error logs in /health/analytics\n2) Check for intermittent API issues\n3) Monitor trend over next hour`,
      priority: 'medium',
      usefulness: 'high', // High because errors are elevated and need attention
      ai_prompt: `Review the Cloudflare Worker logs and identify why ${failedActions} actions are failing (${errorRate.toFixed(1)}% error rate). This is elevated but not critical. Look for:\n1. Intermittent failures or patterns\n2. Specific endpoints or operations causing issues\n3. Recent configuration changes\n\nSuggest preventive measures to reduce the error rate below 5%.`
    });
  } else if (errorAnalysisFix.fixed && errorRate < 5) {
    // Auto-clear the fix if error rate is now good
    // This will be handled by the auto-detection task
  }
  // Skip "excellent" insights - no action needed when everything is working

    // Analyze self-healing effectiveness with specific test details
    const failedTests = data.failed_tests;
    const healedTests = failedTests.filter((t: any) => t.healing_status === 'success');
    const healingRate = failedTests.length > 0 ? (healedTests.length / failedTests.length) * 100 : 0;

  // Check if self_healing was recently fixed
  const selfHealingFix = wasRecentlyFixed('self_healing');

  // Only show self-healing insights if there are failures that need attention AND it wasn't recently fixed
  if (!selfHealingFix.fixed && failedTests.length > 0) {
    const failedTestNames = failedTests.slice(0, 3).map((t: any) => t.test_name).join(', ');
    const healedTestNames = healedTests.slice(0, 2).map((t: any) => t.test_name).join(', ');
    const stillFailingTests = failedTests.filter((t: any) => t.healing_status !== 'success').slice(0, 2).map((t: any) => t.test_name).join(', ');
    
    if (healingRate === 0) {
      // Critical: Healing completely failed
      insights.push({
        type: 'self_healing',
        title: `AI Self-Healing: 0% Success Rate`,
        insight: `None of ${failedTests.length} failed tests were automatically healed.\n\nFailed tests: ${failedTestNames}\n\nAction required:\n1) Review AI healing logs in /health/self-healing\n2) Check if Cloudflare AI binding is configured\n3) Verify API token has required permissions for healing actions\n4) Consider manual intervention for: ${failedTestNames}`,
        priority: 'high',
        usefulness: 'critical', // Critical because healing system is completely broken
        ai_prompt: `The AI self-healing system failed to heal any of the ${failedTests.length} failed tests: ${failedTestNames}. Investigate why the healing attempts failed:\n1. Review the healing attempt logs in the self_healing_attempts table\n2. Check if the Cloudflare AI binding is properly configured\n3. Verify the API token has sufficient permissions\n4. Analyze the error messages from failed healing attempts\n\nProvide specific fixes to improve the healing success rate and manual steps to resolve: ${failedTestNames}.`
      });
    } else if (healingRate < 50) {
      // High: Healing is working but below target
      insights.push({
        type: 'self_healing',
        title: `AI Self-Healing: ${healingRate.toFixed(1)}% Success (Below Target)`,
        insight: `${healedTests.length} of ${failedTests.length} failed tests were healed.\n\nSuccessfully healed: ${healedTestNames || 'none'}\nStill failing: ${stillFailingTests}\n\nRecommendations:\n1) Review healing attempt logs\n2) Check if failures are due to permissions or configuration issues\n3) Consider updating healing strategies`,
        priority: 'medium',
        usefulness: 'high', // High because healing needs improvement
        ai_prompt: `AI self-healing is at ${healingRate.toFixed(1)}% success rate (${healedTests.length}/${failedTests.length}). Successfully healed: ${healedTestNames}. Still failing: ${stillFailingTests}. Analyze:\n1. Why some tests heal successfully while others don't\n2. Common patterns in failed healing attempts\n3. Permission or configuration issues preventing healing\n\nProvide strategies to improve healing success rate above 50% and specific fixes for: ${stillFailingTests}.`
      });
    }
    // Skip "good healing" insights when healing rate is >50% - system is working as expected
  } else if (selfHealingFix.fixed && healingRate > 50) {
    // Auto-clear the fix if healing is now working well
    // This will be handled by the auto-detection task
  }

  // Skip traffic distribution - not useful without geographic data

    // Analyze response times with percentiles
    const responseTimes = data.session_patterns.response_times;
    if (responseTimes.length > 0) {
      const sortedTimes = [...responseTimes].sort((a: number, b: number) => a - b);
      const avgResponseTime = responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length;
      const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.50)];
      const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
      const slowRequests = sortedTimes.filter(t => t > 5000).length;

    // Only show performance insights if there are issues
    if (avgResponseTime > 5000) {
      insights.push({
        type: 'performance',
        title: `Performance Issue: ${avgResponseTime.toFixed(0)}ms Average`,
        insight: `Response times are critically slow. ${slowRequests} requests (${((slowRequests / sortedTimes.length) * 100).toFixed(1)}%) exceeded 5s.\n\nImmediate actions:\n1) Check D1 query performance\n2) Review Cloudflare API response times\n3) Identify slow endpoints in /health/analytics\n4) Consider adding indexes to D1 tables\n5) Enable query caching where possible`,
        priority: 'high',
        usefulness: 'critical', // Critical because performance is severely degraded
        chart_data: {
          type: 'percentile',
          values: { avg: avgResponseTime, p50, p95, p99 },
          threshold: 5000,
          unit: 'ms'
        },
        ai_prompt: `Response times are critically slow with ${avgResponseTime.toFixed(0)}ms average (P95: ${p95.toFixed(0)}ms, P99: ${p99.toFixed(0)}ms). ${slowRequests} requests exceeded 5 seconds. Analyze the worker code and:\n1. Identify slow D1 queries and suggest index optimizations\n2. Review Cloudflare API calls for bottlenecks\n3. Find endpoints with highest response times\n4. Suggest caching strategies for frequently accessed data\n5. Recommend code optimizations to reduce CPU time\n\nProvide specific code changes to improve performance.`
      });
    } else if (avgResponseTime > 2000) {
      insights.push({
        type: 'performance',
        title: `Moderate Performance: ${avgResponseTime.toFixed(0)}ms Average`,
        insight: `Response times are acceptable but could be improved.\n\nRecommendations:\n1) Profile slow queries\n2) Optimize D1 indexes\n3) Review worker CPU time\n4) Consider edge caching for static responses`,
        priority: 'medium',
        usefulness: 'medium', // Medium because performance is OK but could be better
        chart_data: {
          type: 'percentile',
          values: { avg: avgResponseTime, p50, p95, p99 },
          threshold: 2000,
          unit: 'ms'
        },
        ai_prompt: `Response times average ${avgResponseTime.toFixed(0)}ms (P95: ${p95.toFixed(0)}ms). While acceptable, there's room for improvement. Review the codebase and:\n1. Identify queries that could benefit from indexes\n2. Find opportunities for caching\n3. Analyze CPU-intensive operations\n4. Suggest optimizations to bring average response time under 1 second\n\nProvide specific recommendations with code examples.`
      });
    }
    // Skip "excellent performance" - no action needed when everything is fast
  }

    // Analyze failed test categories with detailed failure patterns from D1
    const failedCategories = failedTests.reduce((acc: Record<string, any[]>, test: any) => {
      if (!acc[test.category]) acc[test.category] = [];
      acc[test.category].push(test);
      return acc;
    }, {} as Record<string, any[]>);

  const categoryEntries = Object.entries(failedCategories);
  if (categoryEntries.length > 0 && db) {
    const worstCategory = categoryEntries.reduce((a, b) => (a[1] as any[]).length > (b[1] as any[]).length ? a : b);
    const categoryName = worstCategory[0];
    const testsInCategory = worstCategory[1] as any[];
    const totalFailed = failedTests.length;
    const percentage = ((testsInCategory.length / totalFailed) * 100).toFixed(1);
    
    const allCategories = categoryEntries
      .sort((a, b) => (b[1] as any[]).length - (a[1] as any[]).length)
      .map(([cat, tests]) => `${cat} (${(tests as any[]).length})`)
      .join(', ');

    // Query detailed failure patterns for this category
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString();

    const detailedFailures = await db
      .selectFrom('health_test_results')
      .innerJoin('health_tests', 'health_tests.id', 'health_test_results.health_test_id')
      .select([
        'health_tests.name',
        'health_tests.endpoint_path',
        'health_tests.http_method',
        'health_test_results.status',
        'health_test_results.status_text',
        'health_test_results.error_message',
        'health_test_results.run_at',
      ])
      .where('health_tests.category', '=', categoryName)
      .where('health_test_results.outcome', '=', 'fail')
      .where('health_test_results.run_at', '>=', cutoffDateStr)
      .orderBy('health_test_results.run_at', 'asc')
      .execute();

    // Group failures by endpoint/method
    const failuresByEndpoint = detailedFailures.reduce((acc: Record<string, any>, failure: any) => {
      const key = `${failure.http_method} ${failure.endpoint_path}`;
      if (!acc[key]) {
        acc[key] = {
          method: failure.http_method,
          endpoint: failure.endpoint_path,
          name: failure.name,
          first_seen: failure.run_at,
          last_seen: failure.run_at,
          occurrences: 0,
          status_codes: {} as Record<number, number>,
          errors: new Set<string>(),
        };
      }
      acc[key].occurrences++;
      acc[key].last_seen = failure.run_at;
      acc[key].status_codes[failure.status] = (acc[key].status_codes[failure.status] || 0) + 1;
      if (failure.error_message) {
        acc[key].errors.add(failure.error_message);
      } else if (failure.status_text) {
        acc[key].errors.add(failure.status_text);
      }
      return acc;
    }, {} as Record<string, any>);

    // Sort by occurrences and format
    const topFailures = Object.values(failuresByEndpoint)
      .sort((a: any, b: any) => b.occurrences - a.occurrences)
      .slice(0, 10);

    const failureDetails = topFailures.length > 0 
      ? topFailures.map((f: any) => {
          const firstSeen = new Date(f.first_seen).toLocaleDateString();
          const lastSeen = new Date(f.last_seen).toLocaleDateString();
          const mostCommonStatus = Object.entries(f.status_codes)
            .sort((a: any, b: any) => b[1] - a[1])[0];
          const statusCode = mostCommonStatus ? mostCommonStatus[0] : 'Unknown';
          const errorSummary = Array.from(f.errors).slice(0, 2).join('; ');
          
          return `• ${f.method} ${f.endpoint}\n  First: ${firstSeen} | Last: ${lastSeen} | Count: ${f.occurrences}\n  Status: ${statusCode} | Error: ${errorSummary || 'Unknown error'}`;
        }).join('\n\n')
      : 'No detailed failure data available for this period.';

    const rootCauseAnalysis = categoryName === 'api' 
      ? 'Common API failure causes:\n• Invalid or expired API tokens\n• Insufficient permissions\n• Rate limit exceeded\n• Cloudflare API service issues' 
      : categoryName === 'database' 
      ? 'Common database failure causes:\n• Connection timeout\n• Query syntax errors\n• Missing indexes causing slow queries\n• Schema migration issues' 
      : categoryName === 'auth' 
      ? 'Common auth failure causes:\n• Token expiration\n• Invalid permission scopes\n• Missing required headers\n• Account access issues' 
      : `Review ${categoryName} system components and recent changes`;

    insights.push({
      type: 'failure_analysis',
      title: `${categoryName} Failures: ${testsInCategory.length} Tests (${percentage}%)`,
      insight: `${testsInCategory.length} of ${totalFailed} failed tests are in ${categoryName} category.\n\nCategory breakdown: ${allCategories}\n\n📊 Detailed Failure Patterns (Last ${days} Days):\n\n${failureDetails}\n\n${rootCauseAnalysis}`,
      priority: 'high',
      usefulness: 'critical',
      ai_prompt: `Analyze and fix ${categoryName} category failures. ${testsInCategory.length} tests failing (${percentage}% of all failures).\n\nDetailed failure data:\n${topFailures.map((f: any) => `\n${f.method} ${f.endpoint}:\n- Occurrences: ${f.occurrences}\n- First seen: ${new Date(f.first_seen).toISOString()}\n- Last seen: ${new Date(f.last_seen).toISOString()}\n- Status codes: ${JSON.stringify(f.status_codes)}\n- Errors: ${Array.from(f.errors).join(', ')}`).join('\n')}\n\nInvestigate:\n1. Root cause for each failing endpoint\n2. ${categoryName === 'api' ? 'API token validity, permissions, and rate limits' : categoryName === 'database' ? 'Database connection, query performance, and schema' : categoryName === 'auth' ? 'Authentication configuration and token management' : `${categoryName} system configuration`}\n3. Pattern analysis across failures\n4. Recent code or config changes\n\nProvide:\n- Specific fix for each endpoint\n- Code changes needed\n- Configuration updates\n- Preventive measures`
    });
  }

  // Auto-detection: Mark insights as fixed if the issue has been resolved
  if (db) {
    try {
      const now = new Date().toISOString();
      
      // Check error_analysis: if error rate is now < 5% and it was previously marked as an issue
      if (errorAnalysisFix.fixed && errorRate < 5) {
        // Issue is resolved, we can optionally log this or just let it stay marked as fixed
        console.log(`✅ Auto-detection: error_analysis issue resolved (error rate: ${errorRate.toFixed(1)}%)`);
      }

      // Check self_healing: if healing rate is now > 50% and it was previously marked as an issue
      if (selfHealingFix.fixed && healingRate > 50) {
        console.log(`✅ Auto-detection: self_healing issue resolved (healing rate: ${healingRate.toFixed(1)}%)`);
      }

      // Auto-mark as fixed if issue was NOT previously fixed but is now resolved
      // Error analysis: if error rate drops below 5% for 2+ consecutive checks
      if (!errorAnalysisFix.fixed && errorRate < 5 && failedActions === 0) {
        await db
          .insertInto('insight_fixes')
          .values({
            id: generateUUID(),
            insight_type: 'error_analysis',
            insight_category: null,
            fix_description: `Auto-resolved: Error rate dropped to ${errorRate.toFixed(2)}% with zero failed actions`,
            fixed_at: now,
            fixed_by: 'auto',
            metadata: JSON.stringify({ error_rate: errorRate, failed_actions: failedActions }),
            created_at: now,
            updated_at: now,
          })
          .execute();
        console.log(`🤖 Auto-marked error_analysis as fixed (error rate: ${errorRate.toFixed(1)}%)`);
      }

      // Self-healing: if healing rate is > 80% and no failed tests
      if (!selfHealingFix.fixed && healingRate > 80 && failedTests.length === 0) {
        await db
          .insertInto('insight_fixes')
          .values({
            id: generateUUID(),
            insight_type: 'self_healing',
            insight_category: null,
            fix_description: `Auto-resolved: Healing rate improved to ${healingRate.toFixed(1)}% with no failed tests`,
            fixed_at: now,
            fixed_by: 'auto',
            metadata: JSON.stringify({ healing_rate: healingRate, failed_tests_count: failedTests.length }),
            created_at: now,
            updated_at: now,
          })
          .execute();
        console.log(`🤖 Auto-marked self_healing as fixed (healing rate: ${healingRate.toFixed(1)}%)`);
      }
    } catch (autoDetectError: any) {
      console.error('Auto-detection error (non-fatal):', autoDetectError);
      // Don't fail insight generation if auto-detection fails
    }
  }

  return insights;
}

// Get health status summary
healthRoutes.get('/status', async (c) => {
  return c.json({ status: 'ok' });
});

// Self-healing endpoint - analyze and attempt to heal failed tests
healthRoutes.post('/heal', async (c) => {
  try {
    const body = await c.req.json();
    const { health_check_group_id, auto_heal = true } = body;

    if (!health_check_group_id) {
      return c.json({
        success: false,
        error: 'health_check_group_id is required',
      }, 400);
    }

    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;
    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || '';

    // Get failed tests from the health check group
    const loggingService = c.get('loggingService');
    const healthService = new HealthCheckService(c.env, baseUrl, authToken, undefined, loggingService);
    const failedResults = await healthService.getTestResultsWithDefinitions(health_check_group_id);

    const failedTests = failedResults
      .filter((result: any) => result.outcome === 'fail')
      .map((result: any) => ({
        test_result_id: result.id,
        test_id: result.health_test_id,
        test_name: result.health_test?.name || 'Unknown',
        endpoint_path: result.health_test?.endpoint_path || '',
        http_method: result.health_test?.http_method || 'GET',
        status: result.status,
        status_text: result.status_text,
        error_message: result.error_message,
        response_body: result.response_body,
        health_check_group_id,
      }));

    if (failedTests.length === 0) {
      return c.json({
        success: true,
        message: 'No failed tests to heal',
        result: [],
      });
    }

    // Initialize self-healing service
    const { SelfHealingService } = await import('../services/self-healing');
    const healingService = new SelfHealingService(c.env, accountId);

    // Analyze and heal
    const healingResults = await healingService.analyzeAndHeal(health_check_group_id, failedTests);

    return c.json({
      success: true,
      result: healingResults,
      message: `Analyzed ${failedTests.length} failed test(s) and attempted healing`,
    });
  } catch (error: any) {
    console.error('Self-healing failed:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack,
    }, 500);
  }
});

// Get healing attempts for a health check group (with full step details)
healthRoutes.get('/heal/:healthCheckGroupId', async (c) => {
  try {
    const healthCheckGroupId = c.req.param('healthCheckGroupId');
    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || '';

    const { SelfHealingService } = await import('../services/self-healing');
    const healingService = new SelfHealingService(c.env, accountId);
    const attempts = await healingService.getHealingAttempts(healthCheckGroupId);

    return c.json({
      success: true,
      result: attempts,
      count: attempts.length,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// Get healing steps for a specific attempt (for real-time updates)
healthRoutes.get('/heal/:healthCheckGroupId/steps/:attemptId', async (c) => {
  try {
    const attemptId = c.req.param('attemptId');
    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || '';

    const { SelfHealingService } = await import('../services/self-healing');
    const healingService = new SelfHealingService(c.env, accountId);
    const steps = await healingService.getHealingSteps(attemptId);

    return c.json({
      success: true,
      result: steps,
      count: steps.length,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
});

// Get OpenAPI JSON specification
healthRoutes.get('/openapi.json', (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const workerUrl = 'https://core-cloudflare-manager-api.hacolby.workers.dev';
    const spec = generateOpenAPISpec(baseUrl, baseUrl.includes('localhost') ? workerUrl : undefined);

    return c.json(spec);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get OpenAPI YAML specification
healthRoutes.get('/openapi.yaml', (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const workerUrl = `https://core-cloudflare-manager-api.${c.env.CLOUDFLARE_ACCOUNT_ID}.workers.dev`;
    const spec = generateOpenAPISpec(baseUrl, baseUrl.includes('localhost') ? workerUrl : undefined);
    const yaml = jsonToYaml(spec);

    return c.text(yaml, 200, {
      'Content-Type': 'application/x-yaml',
    });
  } catch (error: any) {
    return c.text('error: ' + error.message, 500);
  }
});

// Get self-healing status for a session
healthRoutes.get('/tests/session/:sessionUuid/healing', async (c) => {
  try {
    const sessionUuid = c.req.param('sessionUuid');

    const { SelfHealingService } = await import('../services/self-healing');
    const healingService = new SelfHealingService(c.env, c.env.CLOUDFLARE_ACCOUNT_ID || '');

    // Get all healing attempts for this session
    const healingResults = await healingService.getHealingAttemptsForSession(sessionUuid);

    return c.json({
      success: true,
      result: {
        sessionUuid,
        results: healingResults,
      },
    });
  } catch (error: any) {
    console.error('Error getting healing status:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack
    }, 500);
  }
});

export default healthRoutes;
