import { Hono } from 'hono';
import { Env, Variables } from '../types';
import { HealthCheckService } from '../services/health-check';
import { UnitTestService } from '../services/unit-tests';
import { generateOpenAPISpec, jsonToYaml } from '../services/openapi-generator';

// Helper function to serialize test results for API responses
function serializeResult(result: any) {
  return {
    definition: {
      id: result.definition.id,
      test_key: result.definition.test_key,
      name: result.definition.name,
      scope: result.definition.scope,
      category: result.definition.category,
      description: result.definition.description,
      metadata: result.definition.metadataParsed || {},
    },
    result: {
      status: result.result.status,
      httpStatus: result.result.httpStatus,
      httpStatusText: result.result.httpStatusText,
      totalMs: result.result.totalMs,
      runAt: result.runAt,
    },
    ai: result.ai ? {
      prompt: result.ai.prompt,
      humanReadable: result.ai.humanReadable,
      modelResponse: result.ai.modelResponse,
    } : null,
  };
}

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
    const { auto_heal = false } = body; // Option to auto-heal after check

    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const internalFetch = await buildInternalFetch(c, baseUrl);

    const healthService = new HealthCheckService(c.env, baseUrl, authToken, internalFetch);
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

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
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

    return c.json({
      success: true,
      result: {
        ...result,
        healing: healingAttempts.length > 0 ? {
          attempts: healingAttempts,
          total_attempts: healingAttempts.length,
          successful: healingAttempts.filter((a: any) => a.status === 'success').length,
          failed: healingAttempts.filter((a: any) => a.status === 'failed').length,
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

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
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
    const body = await c.req.json();
    const { triggerSource = 'manual' } = body;

    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const { default: mainApp } = await import('../index');

    // Create an internal fetch function that routes through the main app
    const internalFetch = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      if (!url.hostname) {
        const absoluteUrl = new URL(request.url, baseUrl);
        request = new Request(absoluteUrl.toString(), request);
      }
      return await mainApp.fetch(request, c.env, c.executionCtx);
    };

    const unitTestService = new UnitTestService(c.env);
    await unitTestService.ensureDefinitionsRegistered(); // Ensure definitions are registered
    const summary = await unitTestService.runUnitTests(triggerSource, {
      env: c.env,
      baseUrl,
      authToken: c.env.CLIENT_AUTH_TOKEN,
      internalFetch,
    });

    return c.json({
      success: true,
      result: {
        session: {
          sessionUuid: summary.sessionUuid,
          startedAt: summary.startedAt,
          completedAt: summary.completedAt,
          triggerSource: summary.triggerSource,
          totalTests: summary.totalTests,
          passedTests: summary.passedTests,
          failedTests: summary.failedTests,
          durationMs: summary.durationMs,
        },
        results: summary.results.map(serializeResult),
      },
    });
  } catch (error: any) {
    console.error('Error in /tests/run:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack
    }, 500);
  }
});

healthRoutes.get('/unit-tests', async (c) => {
  try {
    const unitTestService = new UnitTestService(c.env);
    await unitTestService.ensureDefinitionsRegistered(); // Ensure definitions are registered
    const definitions = await unitTestService.getActiveDefinitionsWithLatestResults();
    return c.json({
      success: true,
      result: definitions.map((item) => ({
        definition: serializeDefinition(item.definition),
        latestResult: item.latestResult,
      })),
      count: definitions.length,
    });
  } catch (error: any) {
    console.error('Error in /unit-tests:', error);
    return c.json({
      success: false,
      error: error.message,
      details: error.stack
    }, 500);
  }
});

healthRoutes.get('/tests/session/latest', async (c) => {
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
});

healthRoutes.get('/tests/session/:sessionUuid', async (c) => {
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
});

// Get all registered health tests (list health checks endpoint)
healthRoutes.get('/tests', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;
    const includeInactive = c.req.query('include_inactive') === 'true';

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
    const tests = await healthService.getRegisteredTests(includeInactive);

    return c.json({
      success: true,
      result: tests,
      count: tests.length,
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

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
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

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
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
    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
    const failedResults = await healthService.getTestResultsWithDefinitions(health_check_group_id);

    const failedTests = failedResults
      .filter((result: any) => result.outcome === 'fail')
      .map((result: any) => ({
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

export default healthRoutes;
