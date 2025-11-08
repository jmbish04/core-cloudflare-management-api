import { Hono } from 'hono';
import { Env, Variables } from '../types';
import { HealthCheckService } from '../services/health-check';
import { generateOpenAPISpec, jsonToYaml } from '../services/openapi-generator';

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
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    // Import the main app to route requests internally
    // This avoids external HTTP requests and ensures middleware is applied
    const { default: mainApp } = await import('../index');
    
    // Create an internal fetch function that routes through the main app
    const internalFetch = async (request: Request): Promise<Response> => {
      // Make sure the request URL is absolute
      const url = new URL(request.url);
      if (!url.hostname) {
        // If relative URL, make it absolute
        const absoluteUrl = new URL(request.url, baseUrl);
        request = new Request(absoluteUrl.toString(), request);
      }
      
      // Route through the main app to ensure middleware is applied
      return await mainApp.fetch(request, c.env, c.executionCtx);
    };

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

    return c.json({
      success: true,
      result,
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

// Get latest health check
healthRoutes.get('/latest', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
    const result = await healthService.getLatestHealthCheck();

    if (!result) {
      return c.json({
        success: false,
        error: 'No health check data available',
      }, 404);
    }

    return c.json({
      success: true,
      result,
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
    const results = await healthService.getHealthCheckHistory(limit);

    return c.json({
      success: true,
      result: results,
      count: results.length,
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
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get health status summary
healthRoutes.get('/status', async (c) => {
  return c.json({ status: 'ok' });
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