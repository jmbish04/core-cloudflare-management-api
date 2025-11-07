import { Env, generateUUID } from '../types';
import Cloudflare from 'cloudflare';

export interface EndpointTest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  requiresAuth?: boolean;
  expectedStatus?: number;
  testData?: any;
  category: 'sdk' | 'flows' | 'health' | 'meta';
}

export interface EndpointTestResult {
  endpoint: string;
  method: string;
  description: string;
  status: 'success' | 'failure' | 'error';
  statusCode?: number;
  responseTime: number;
  error?: string;
  category: string;
}

export interface HealthCheckResult {
  id: string;
  check_time: string;
  overall_status: 'healthy' | 'degraded' | 'unhealthy';
  total_endpoints: number;
  healthy_endpoints: number;
  unhealthy_endpoints: number;
  response_time_ms: number;
  results: EndpointTestResult[];
  metadata?: Record<string, any>;
}

/**
 * Health Check Service
 * Tests all API endpoints and generates comprehensive health reports
 */
export class HealthCheckService {
  private env: Env;
  private baseUrl: string;
  private authToken: string;

  constructor(env: Env, baseUrl: string, authToken: string) {
    this.env = env;
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  /**
   * Get all endpoints to test
   */
  private getEndpointsToTest(): EndpointTest[] {
    return [
      // Meta endpoints
      {
        method: 'GET',
        path: '/health',
        description: 'Health check endpoint',
        requiresAuth: false,
        expectedStatus: 200,
        category: 'meta',
      },
      {
        method: 'GET',
        path: '/openapi.json',
        description: 'OpenAPI JSON schema',
        requiresAuth: false,
        expectedStatus: 200,
        category: 'meta',
      },
      {
        method: 'GET',
        path: '/openapi.yaml',
        description: 'OpenAPI YAML schema',
        requiresAuth: false,
        expectedStatus: 200,
        category: 'meta',
      },

      // SDK - Workers
      {
        method: 'GET',
        path: '/sdk/workers/scripts',
        description: 'List workers',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },
      {
        method: 'GET',
        path: '/sdk/workers/deployments',
        description: 'List deployments',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },

      // SDK - Storage
      {
        method: 'GET',
        path: '/sdk/storage/kv/namespaces',
        description: 'List KV namespaces',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },
      {
        method: 'GET',
        path: '/sdk/storage/d1/databases',
        description: 'List D1 databases',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },
      {
        method: 'GET',
        path: '/sdk/storage/r2/buckets',
        description: 'List R2 buckets',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },

      // SDK - Tokens
      {
        method: 'GET',
        path: '/sdk/tokens',
        description: 'List API tokens',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },

      // SDK - CI/CD
      {
        method: 'GET',
        path: '/sdk/cicd/repo-connections',
        description: 'List repo connections',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },
      {
        method: 'GET',
        path: '/sdk/cicd/triggers',
        description: 'List build triggers',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'sdk',
      },

      // Flows - Token
      {
        method: 'GET',
        path: '/flows/token',
        description: 'List managed tokens',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'flows',
      },

      // Flows - Health
      {
        method: 'GET',
        path: '/flows/health/recent',
        description: 'Get recent health checks',
        requiresAuth: true,
        expectedStatus: 200,
        category: 'flows',
      },

      // Health Service
      {
        method: 'GET',
        path: '/health/status',
        description: 'Get health service status',
        requiresAuth: false,
        expectedStatus: 200,
        category: 'health',
      },
    ];
  }

  /**
   * Test a single endpoint
   */
  private async testEndpoint(test: EndpointTest): Promise<EndpointTestResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${test.path}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (test.requiresAuth) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(url, {
        method: test.method,
        headers,
        body: test.testData ? JSON.stringify(test.testData) : undefined,
      });

      const responseTime = Date.now() - startTime;
      const expectedStatus = test.expectedStatus || 200;

      if (response.status === expectedStatus || (response.status >= 200 && response.status < 300)) {
        return {
          endpoint: test.path,
          method: test.method,
          description: test.description,
          status: 'success',
          statusCode: response.status,
          responseTime,
          category: test.category,
        };
      } else {
        return {
          endpoint: test.path,
          method: test.method,
          description: test.description,
          status: 'failure',
          statusCode: response.status,
          responseTime,
          error: `Expected ${expectedStatus}, got ${response.status}`,
          category: test.category,
        };
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      return {
        endpoint: test.path,
        method: test.method,
        description: test.description,
        status: 'error',
        responseTime,
        error: error.message,
        category: test.category,
      };
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const checkId = generateUUID();
    const checkTime = new Date().toISOString();
    const startTime = Date.now();

    const endpoints = this.getEndpointsToTest();
    const results: EndpointTestResult[] = [];

    // Test all endpoints
    for (const endpoint of endpoints) {
      const result = await this.testEndpoint(endpoint);
      results.push(result);
    }

    const totalTime = Date.now() - startTime;

    // Calculate stats
    const totalEndpoints = results.length;
    const healthyEndpoints = results.filter((r) => r.status === 'success').length;
    const unhealthyEndpoints = totalEndpoints - healthyEndpoints;

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    const healthPercentage = (healthyEndpoints / totalEndpoints) * 100;

    if (healthPercentage === 100) {
      overallStatus = 'healthy';
    } else if (healthPercentage >= 80) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    // Group results by category
    const resultsByCategory = results.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = [];
      }
      acc[result.category].push(result);
      return acc;
    }, {} as Record<string, EndpointTestResult[]>);

    return {
      id: checkId,
      check_time: checkTime,
      overall_status: overallStatus,
      total_endpoints: totalEndpoints,
      healthy_endpoints: healthyEndpoints,
      unhealthy_endpoints: unhealthyEndpoints,
      response_time_ms: totalTime,
      results,
      metadata: {
        by_category: Object.keys(resultsByCategory).map((category) => ({
          category,
          total: resultsByCategory[category].length,
          healthy: resultsByCategory[category].filter((r) => r.status === 'success').length,
          unhealthy: resultsByCategory[category].filter((r) => r.status !== 'success').length,
        })),
      },
    };
  }

  /**
   * Save health check result to D1
   */
  async saveHealthCheck(result: HealthCheckResult): Promise<void> {
    const db = this.env.TOKEN_AUDIT_DB;

    await db
      .prepare(
        `INSERT INTO health_checks (
          id, check_time, overall_status, total_endpoints,
          healthy_endpoints, unhealthy_endpoints, response_time_ms,
          results, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        result.id,
        result.check_time,
        result.overall_status,
        result.total_endpoints,
        result.healthy_endpoints,
        result.unhealthy_endpoints,
        result.response_time_ms,
        JSON.stringify(result.results),
        JSON.stringify(result.metadata)
      )
      .run();

    // Also write to Analytics Engine if available
    if (this.env.OBSERVABILITY_AE) {
      this.env.OBSERVABILITY_AE.writeDataPoint({
        blobs: [result.overall_status, 'health_check'],
        doubles: [
          result.total_endpoints,
          result.healthy_endpoints,
          result.unhealthy_endpoints,
          result.response_time_ms,
        ],
        indexes: [result.id],
      });
    }
  }

  /**
   * Get latest health check from D1
   */
  async getLatestHealthCheck(): Promise<HealthCheckResult | null> {
    const db = this.env.TOKEN_AUDIT_DB;

    const result = await db
      .prepare('SELECT * FROM health_checks ORDER BY check_time DESC LIMIT 1')
      .first<any>();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      check_time: result.check_time,
      overall_status: result.overall_status,
      total_endpoints: result.total_endpoints,
      healthy_endpoints: result.healthy_endpoints,
      unhealthy_endpoints: result.unhealthy_endpoints,
      response_time_ms: result.response_time_ms,
      results: JSON.parse(result.results),
      metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
    };
  }

  /**
   * Get health check history
   */
  async getHealthCheckHistory(limit: number = 10): Promise<HealthCheckResult[]> {
    const db = this.env.TOKEN_AUDIT_DB;

    const results = await db
      .prepare('SELECT * FROM health_checks ORDER BY check_time DESC LIMIT ?')
      .bind(limit)
      .all<any>();

    return (results.results || []).map((result) => ({
      id: result.id,
      check_time: result.check_time,
      overall_status: result.overall_status,
      total_endpoints: result.total_endpoints,
      healthy_endpoints: result.healthy_endpoints,
      unhealthy_endpoints: result.unhealthy_endpoints,
      response_time_ms: result.response_time_ms,
      results: JSON.parse(result.results),
      metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
    }));
  }
}
