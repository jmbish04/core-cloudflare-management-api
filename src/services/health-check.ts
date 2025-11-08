import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc } from 'drizzle-orm';
import { Env, Variables, generateUUID } from '../types';
import * as schema from '../db/schema';
import { healthChecks, healthTests, healthTestResults } from '../db/schema';

export interface HealthCheckResult {
  overall_status: 'pass' | 'fail' | 'degraded';
  total_endpoints: number;
  healthy_endpoints: number;
  unhealthy_endpoints: number;
  degraded_endpoints: number;
  avg_response_time: number;
  checked_at: string;
  check_group_id: string;
  results: EndpointResult[];
}

export interface EndpointResult {
  endpoint: string;
  status: number;
  statusText: string;
  response_time_ms: number;
  outcome: 'pass' | 'fail';
  category?: string;
  path?: string;
  method?: string;
}

export class HealthCheckService {
  private env: Env;
  private db;
  private baseUrl: string;
  private authToken: string;
  private appFetch?: (request: Request) => Promise<Response>;

  constructor(env: Env, baseUrl: string, authToken: string, appFetch?: (request: Request) => Promise<Response>) {
    this.env = env;
    this.db = drizzle(env.DB, { schema });
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.appFetch = appFetch; // Optional: allows internal routing instead of HTTP requests
  }

  /**
   * Get default test definitions
   * These will be registered in the database on first run
   */
  private getDefaultTestDefinitions(): Array<{
    name: string;
    endpoint_path: string;
    http_method: string;
    category: string;
    description: string;
    request_body?: string;
  }> {
    return [
      // Tokens API (Read)
      {
        name: 'List Tokens',
        endpoint_path: '/api/tokens',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all user API tokens',
      },
      
      // Workers API (Read)
      {
        name: 'List Workers',
        endpoint_path: '/api/workers/scripts',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all Workers scripts',
      },
      
      // Storage API (Read)
      {
        name: 'List D1 Databases',
        endpoint_path: '/api/storage/d1/databases',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all D1 databases',
      },
      {
        name: 'List KV Namespaces',
        endpoint_path: '/api/storage/kv/namespaces',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all KV namespaces',
      },
      {
        name: 'List R2 Buckets',
        endpoint_path: '/api/storage/r2/buckets',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all R2 buckets',
      },
      
      // Vectorize API (Read)
      {
        name: 'List Vectorize Indexes',
        endpoint_path: '/api/vectorize/indexes',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all Vectorize indexes',
      },
      
      // Workers AI API (Read/Run)
      {
        name: 'List AI Models',
        endpoint_path: '/api/ai/models',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing available Workers AI models',
      },
      {
        name: 'Run AI Prompt',
        endpoint_path: '/api/ai/run',
        http_method: 'POST',
        category: 'api',
        description: 'Tests running an AI prompt with a simple "Hello" message',
        request_body: JSON.stringify({ model: '@cf/meta/llama-2-7b-chat-int8', text: ['Hello'] }),
      },
      
      // Additional Read Endpoints
      {
        name: 'Worker Deployments',
        endpoint_path: '/api/workers/deployments',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing worker deployments',
      },
      {
        name: 'Worker Settings',
        endpoint_path: '/api/workers/settings',
        http_method: 'GET',
        category: 'api',
        description: 'Tests retrieving worker account settings',
      },
      {
        name: 'List Pages Projects',
        endpoint_path: '/api/pages/projects',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing all Pages projects',
      },
      {
        name: 'Verify Token',
        endpoint_path: '/api/tokens/verify',
        http_method: 'GET',
        category: 'api',
        description: 'Tests token verification endpoint',
      },
      {
        name: 'List Build Tokens',
        endpoint_path: '/api/cicd/tokens',
        http_method: 'GET',
        category: 'api',
        description: 'Tests listing CI/CD build tokens',
      },
      
      // Health & Meta
      {
        name: 'Health Status',
        endpoint_path: '/health/status',
        http_method: 'GET',
        category: 'health',
        description: 'Tests basic health status endpoint',
      },
      {
        name: 'OpenAPI JSON',
        endpoint_path: '/openapi.json',
        http_method: 'GET',
        category: 'meta',
        description: 'Tests OpenAPI specification endpoint',
      },
    ];
  }

  /**
   * Ensure all health tests are registered in the database
   */
  private async ensureTestsRegistered(): Promise<void> {
    const defaultTests = this.getDefaultTestDefinitions();
    const now = new Date().toISOString();

    for (const testDef of defaultTests) {
      // Check if test already exists
      const existingData = await this.env.DB.prepare(
        'SELECT * FROM health_tests WHERE endpoint_path = ? LIMIT 1'
      ).bind(testDef.endpoint_path).first();
      const existing = existingData as any;

      if (!existing) {
        // Register new test
        await this.db.insert(healthTests).values({
          id: generateUUID(),
          name: testDef.name,
          endpoint_path: testDef.endpoint_path,
          http_method: testDef.http_method,
          category: testDef.category,
          description: testDef.description,
          request_body: testDef.request_body || null,
          enabled: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      } else if (existing.description !== testDef.description || existing.http_method !== testDef.http_method) {
        // Update existing test if definition changed
        await this.db
          .update(healthTests)
          .set({
            name: testDef.name,
            http_method: testDef.http_method,
            category: testDef.category,
            description: testDef.description,
            request_body: testDef.request_body || null,
            updated_at: now,
          })
          .where(eq(healthTests.id, existing.id));
      }
    }
  }

  /**
   * Get enabled and active tests from database
   */
  private async getTestsFromDatabase(): Promise<Array<{
    id: string;
    name: string;
    endpoint_path: string;
    http_method: string;
    category: string;
    description: string | null;
    request_body: string | null;
  }>> {
    // Use raw SQL to avoid parameter binding issues
    const result = await this.env.DB.prepare(
      'SELECT * FROM health_tests WHERE enabled = 1 AND is_active = 1'
    ).all();
    return result.results as any[];
  }

  /**
   * Get all health tests with their latest results
   * Returns array of objects with test definition and latest result
   */
  public async getTestsWithLatestResults(): Promise<any[]> {
    // Get all active tests using raw SQL to avoid parameter binding issues
    const testsResult = await this.env.DB.prepare(
      'SELECT * FROM health_tests WHERE is_active = 1 ORDER BY name ASC'
    ).all();
    const tests = testsResult.results as any[];

    // For each test, get the latest result
    const testsWithResults = await Promise.all(
      tests.map(async (test) => {
        const latestResultData = await this.env.DB.prepare(
          'SELECT * FROM health_test_results WHERE health_test_id = ? ORDER BY run_at DESC LIMIT 1'
        ).bind(test.id).first();
        const latestResult = latestResultData as any;

        return {
          test: {
            id: test.id,
            name: test.name,
            endpoint_path: test.endpoint_path,
            http_method: test.http_method,
            category: test.category,
            description: test.description,
            enabled: test.enabled,
            is_active: test.is_active,
            created_at: test.created_at,
            updated_at: test.updated_at,
          },
          latest_result: latestResult
            ? {
                id: latestResult.id,
                status: latestResult.status,
                status_text: latestResult.status_text,
                response_time_ms: latestResult.response_time_ms,
                outcome: latestResult.outcome,
                error_message: latestResult.error_message,
                run_at: latestResult.run_at,
                run_group_id: latestResult.run_group_id,
              }
            : null,
        };
      })
    );

    return testsWithResults;
  }

  public async runHealthCheck(): Promise<HealthCheckResult> {
    // Ensure all tests are registered
    await this.ensureTestsRegistered();
    
    // Get enabled tests from database
    const tests = await this.getTestsFromDatabase();
    const checkGroupId = generateUUID();
    const results: EndpointResult[] = [];
    let totalResponseTime = 0;

    for (const test of tests) {
      const startTime = Date.now();
      let status = 0;
      let statusText = 'Error';
      let outcome: 'pass' | 'fail' = 'fail';

      let responseBody: string | null = null;
      
      try {
        // Determine the target URL
        // For /api/* endpoints, call the Worker's own API (which proxies to Cloudflare)
        // For /health/* endpoints, call the Worker's health endpoints
        // For other endpoints, use as-is
        let url: string;
        let authHeader: string;
        
        if (test.endpoint_path.startsWith('/api/')) {
          // Call Worker's own API endpoints (they proxy to Cloudflare)
          url = `${this.baseUrl}${test.endpoint_path}`;
          authHeader = `Bearer ${this.authToken}`; // Use CLIENT_AUTH_TOKEN for Worker API
        } else if (test.endpoint_path.startsWith('/health/')) {
          // Call Worker's health endpoints (no auth required)
          url = `${this.baseUrl}${test.endpoint_path}`;
          authHeader = ''; // Health endpoints don't require auth
        } else {
          // Direct Cloudflare API call (for future use)
          // Convert /api/workers/scripts to /accounts/{account_id}/workers/scripts
          const cloudflarePath = test.endpoint_path.replace('/api', '');
          url = `https://api.cloudflare.com/client/v4${cloudflarePath}`;
          // Use Cloudflare API token from environment
          authHeader = `Bearer ${this.env.CLOUDFLARE_TOKEN}`;
        }
        
        const method = test.http_method;
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
        };
        
        // Add auth header if needed
        if (authHeader) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Authorization': authHeader,
          };
        }
        
        // Add body for POST/PUT/PATCH requests
        if (['POST', 'PUT', 'PATCH'].includes(method) && test.request_body) {
          fetchOptions.body = test.request_body;
        }
        
        // Use internal app fetch if available (faster, no external HTTP), otherwise use regular fetch
        const response = this.appFetch 
          ? await this.appFetch(new Request(url, fetchOptions))
          : await fetch(url, fetchOptions);
        
        status = response.status;
        statusText = response.statusText;
        
        // Handle 404s specifically - endpoint might not be implemented yet
        if (status === 404) {
          outcome = 'fail';
          statusText = 'Endpoint not found (check routing or API path)';
        } else {
          outcome = response.ok ? 'pass' : 'fail';
        }
        
        // Try to read response body for better error messages
        try {
          const bodyText = await response.text();
          if (bodyText) {
            responseBody = bodyText.substring(0, 500); // Store first 500 chars
            if (!response.ok && status !== 404) {
              // Parse error message from Cloudflare API response
              try {
                const errorJson = JSON.parse(bodyText);
                if (errorJson.errors && errorJson.errors.length > 0) {
                  statusText = errorJson.errors[0].message || statusText;
                } else if (errorJson.error) {
                  statusText = errorJson.error;
                }
              } catch {
                // Not JSON, use text
                statusText = `${response.statusText}: ${bodyText.substring(0, 100)}`;
              }
            }
          }
        } catch {
          // Ignore errors reading response body
        }
      } catch (e: any) {
        status = 0;
        statusText = e.message || 'Network error';
        outcome = 'fail';
      }

      const responseTime = Date.now() - startTime;
      totalResponseTime += responseTime;

      // Store result in database using raw SQL to avoid batch insert issues
      const resultId = generateUUID();
      try {
        await this.env.DB.prepare(
          `INSERT INTO health_test_results (id, health_test_id, run_group_id, status, status_text, response_time_ms, outcome, error_message, response_body, run_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          resultId,
          test.id,
          checkGroupId,
          status,
          statusText,
          responseTime,
          outcome,
          outcome === 'fail' ? statusText : null,
          responseBody,
          new Date().toISOString()
        ).run();
      } catch (dbError: any) {
        console.error('Failed to insert health test result:', {
          test: test.name,
          error: dbError.message,
        });
        // Continue processing other tests even if DB insert fails
      }

      // Also add to in-memory results for response
      results.push({
        endpoint: test.name,
        status,
        statusText,
        response_time_ms: responseTime,
        outcome,
        category: test.category,
        path: test.endpoint_path,
        method: test.http_method,
      });
    }

    const healthy = results.filter((r) => r.outcome === 'pass').length;
    const unhealthy = results.length - healthy;
    const overallStatus =
      unhealthy === 0 ? 'pass' : unhealthy === results.length ? 'fail' : 'degraded';

    return {
      overall_status: overallStatus,
      total_endpoints: results.length,
      healthy_endpoints: healthy,
      unhealthy_endpoints: unhealthy,
      degraded_endpoints: 0, // For future use
      avg_response_time: totalResponseTime / results.length,
      checked_at: new Date().toISOString(),
      check_group_id: checkGroupId,
      results,
    };
  }

  public async saveHealthCheck(result: HealthCheckResult): Promise<void> {
    // This method saves to the legacy health_checks table for backward compatibility
    // The main results are already saved to health_test_results in runHealthCheck()
    // Use raw SQL to avoid Drizzle batch insert issues with D1
    
    // Insert records one at a time using raw SQL to avoid parameter limit issues
    for (const res of result.results) {
      try {
        const id = generateUUID();
        await this.env.DB.prepare(
          `INSERT INTO health_checks (id, endpoint, status, status_text, response_time_ms, run_at, check_group_id, overall_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          res.endpoint,
          res.status,
          res.statusText,
          res.response_time_ms,
          result.checked_at,
          result.check_group_id,
          result.overall_status
        ).run();
      } catch (error: any) {
        // Log but don't throw - legacy table is for backward compatibility only
        console.error('Failed to insert record to legacy health_checks table:', {
          endpoint: res.endpoint,
          error: error.message,
        });
      }
    }
  }

  /**
   * Get all registered health tests (active only by default)
   */
  public async getRegisteredTests(includeInactive: boolean = false): Promise<any[]> {
    // Use raw SQL to avoid parameter binding issues with D1
    if (includeInactive) {
      const result = await this.env.DB.prepare(
        'SELECT * FROM health_tests ORDER BY name ASC'
      ).all();
      return result.results as any[];
    } else {
      // SQLite stores booleans as integers (1/0)
      const result = await this.env.DB.prepare(
        'SELECT * FROM health_tests WHERE is_active = 1 ORDER BY name ASC'
      ).all();
      return result.results as any[];
    }
  }

  /**
   * Get test results with test definitions joined
   */
  public async getTestResultsWithDefinitions(runGroupId?: string, limit: number = 100): Promise<any[]> {
    const results = await this.db.query.healthTestResults.findMany({
      where: runGroupId 
        ? (healthTestResults, { eq }) => eq(healthTestResults.run_group_id, runGroupId)
        : undefined,
      orderBy: (healthTestResults, { desc }) => [desc(healthTestResults.run_at)],
      limit,
      with: {
        health_test: true, // Join with health_tests table
      },
    });
    return results;
  }

  public async getLatestHealthCheck(): Promise<HealthCheckResult | null> {
    // Try to get from new health_test_results table first
    const latestResult = await this.db.query.healthTestResults.findFirst({
      orderBy: (healthTestResults, { desc }) => [desc(healthTestResults.run_at)],
    });

    if (latestResult) {
      const allResultsInGroup = await this.db.query.healthTestResults.findMany({
        where: (healthTestResults, { eq }) => eq(healthTestResults.run_group_id, latestResult.run_group_id),
        with: {
          health_test: true,
        },
      });

      const results: EndpointResult[] = allResultsInGroup.map((result) => ({
        endpoint: result.health_test.name,
        status: result.status,
        statusText: result.status_text,
        response_time_ms: result.response_time_ms,
        outcome: result.outcome as 'pass' | 'fail',
        category: result.health_test.category,
        path: result.health_test.endpoint_path,
        method: result.health_test.http_method,
      }));

      const healthy = results.filter((r) => r.outcome === 'pass').length;
      const unhealthy = results.length - healthy;
      const totalResponseTime = results.reduce((acc, r) => acc + r.response_time_ms, 0);

      return {
        overall_status: unhealthy === 0 ? 'pass' : unhealthy === results.length ? 'fail' : 'degraded',
        total_endpoints: results.length,
        healthy_endpoints: healthy,
        unhealthy_endpoints: unhealthy,
        degraded_endpoints: 0,
        avg_response_time: totalResponseTime / results.length,
        checked_at: latestResult.run_at,
        check_group_id: latestResult.run_group_id,
        results,
      };
    }

    // Fallback to legacy health_checks table
    const latestRun = await this.db.query.healthChecks.findFirst({
      orderBy: (healthChecks, { desc }) => [desc(healthChecks.run_at)],
    });

    if (!latestRun) {
      return null;
    }

    const allChecksInGroup = await this.db.query.healthChecks.findMany({
      where: (healthChecks, { eq }) => eq(healthChecks.check_group_id, latestRun.check_group_id),
    });

    const results: EndpointResult[] = allChecksInGroup.map((check) => ({
      endpoint: check.endpoint,
      status: check.status,
      statusText: check.statusText,
      response_time_ms: check.response_time_ms,
      outcome: check.status >= 200 && check.status < 300 ? 'pass' : 'fail',
    }));

    const healthy = results.filter((r) => r.outcome === 'pass').length;
    const unhealthy = results.length - healthy;
    const totalResponseTime = results.reduce((acc, r) => acc + r.response_time_ms, 0);

    return {
      overall_status: latestRun.overall_status as 'pass' | 'fail' | 'degraded',
      total_endpoints: results.length,
      healthy_endpoints: healthy,
      unhealthy_endpoints: unhealthy,
      degraded_endpoints: 0,
      avg_response_time: totalResponseTime / results.length,
      checked_at: latestRun.run_at,
      check_group_id: latestRun.check_group_id,
      results,
    };
  }

  public async getHealthCheckHistory(limit: number = 10): Promise<HealthCheckResult[]> {
    const latestRuns = await this.db.query.healthChecks.findMany({
      orderBy: (healthChecks, { desc }) => [desc(healthChecks.run_at)],
      limit: limit * 10, // Fetch more to account for multiple endpoints per run
    });

    const groupedByCheckId: { [key: string]: any[] } = {};
    for (const run of latestRuns) {
      if (!groupedByCheckId[run.check_group_id]) {
        groupedByCheckId[run.check_group_id] = [];
      }
      groupedByCheckId[run.check_group_id].push(run);
    }

    const history: HealthCheckResult[] = [];
    const groupIds = Object.keys(groupedByCheckId).slice(0, limit);

    for (const groupId of groupIds) {
      const group = groupedByCheckId[groupId];
      const firstRun = group[0];

      const results: EndpointResult[] = group.map((check) => ({
        endpoint: check.endpoint,
        status: check.status,
        statusText: check.statusText,
        response_time_ms: check.response_time_ms,
        outcome: check.status >= 200 && check.status < 300 ? 'pass' : 'fail',
      }));

      const healthy = results.filter((r) => r.outcome === 'pass').length;
      const unhealthy = results.length - healthy;
      const totalResponseTime = results.reduce((acc, r) => acc + r.response_time_ms, 0);

      history.push({
        overall_status: firstRun.overall_status as 'pass' | 'fail' | 'degraded',
        total_endpoints: results.length,
        healthy_endpoints: healthy,
        unhealthy_endpoints: unhealthy,
        degraded_endpoints: 0,
        avg_response_time: totalResponseTime / results.length,
        checked_at: firstRun.run_at,
        check_group_id: firstRun.check_group_id,
        results,
      });
    }

    return history;
  }
}
