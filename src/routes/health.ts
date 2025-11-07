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

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
    const result = await healthService.runHealthCheck();

    // Save to D1
    await healthService.saveHealthCheck(result);

    return c.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
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

// Get health status summary
healthRoutes.get('/status', async (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const authToken = c.env.CLIENT_AUTH_TOKEN;

    const healthService = new HealthCheckService(c.env, baseUrl, authToken);
    const latestCheck = await healthService.getLatestHealthCheck();

    if (!latestCheck) {
      return c.json({
        success: true,
        result: {
          status: 'unknown',
          message: 'No health check data available',
        },
      });
    }

    return c.json({
      success: true,
      result: {
        status: latestCheck.overall_status,
        last_check: latestCheck.check_time,
        healthy_endpoints: latestCheck.healthy_endpoints,
        total_endpoints: latestCheck.total_endpoints,
        health_percentage: Math.round((latestCheck.healthy_endpoints / latestCheck.total_endpoints) * 100),
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get OpenAPI JSON specification
healthRoutes.get('/openapi.json', (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const spec = generateOpenAPISpec(baseUrl);

    return c.json(spec);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Get OpenAPI YAML specification
healthRoutes.get('/openapi.yaml', (c) => {
  try {
    const baseUrl = new URL(c.req.url).origin;
    const spec = generateOpenAPISpec(baseUrl);
    const yaml = jsonToYaml(spec);

    return c.text(yaml, 200, {
      'Content-Type': 'application/x-yaml',
    });
  } catch (error: any) {
    return c.text('error: ' + error.message, 500);
  }
});

export default healthRoutes;
