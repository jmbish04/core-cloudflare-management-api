import { Env, Variables, generateUUID } from '../types';
import { initDb, type DbClients } from '../db/client';

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
  private db: DbClients;
  private baseUrl: string;
  private authToken: string;
  private appFetch?: (request: Request) => Promise<Response>;

  constructor(env: Env, baseUrl: string, authToken: string, appFetch?: (request: Request) => Promise<Response>) {
    this.env = env;
    this.db = initDb(env);
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
      const existing = await this.db.kysely
        .selectFrom('health_tests')
        .where('endpoint_path', '=', testDef.endpoint_path)
        .selectAll()
        .limit(1)
        .executeTakeFirst();

      if (!existing) {
        // Register new test
        await this.db.kysely
          .insertInto('health_tests')
          .values({
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
          })
          .execute();
      } else if (existing.description !== testDef.description || existing.http_method !== testDef.http_method) {
        // Update existing test if definition changed
        await this.db.kysely
          .updateTable('health_tests')
          .set({
            name: testDef.name,
            http_method: testDef.http_method,
            category: testDef.category,
            description: testDef.description,
            request_body: testDef.request_body || null,
            updated_at: now,
          })
          .where('id', '=', existing.id)
          .execute();
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
    const result = await this.db.kysely
      .selectFrom('health_tests')
      .where('enabled', '=', true)
      .where('is_active', '=', true)
      .select(['id', 'name', 'endpoint_path', 'http_method', 'category', 'description', 'request_body'])
      .execute();
    return result;
  }

  /**
   * Get all health tests with their latest results
   * Returns array of objects with test definition and latest result
   */
  public async getTestsWithLatestResults(): Promise<any[]> {
    try {
      // Ensure tests are registered first
      await this.ensureTestsRegistered();

      // Get all active tests using Kysely
      const tests = await this.db.kysely
        .selectFrom('health_tests')
        .where('is_active', '=', true)
        .orderBy('name')
        .selectAll()
        .execute();

      // For each test, get the latest result using Kysely
      const testsWithResults = await Promise.all(
        tests.map(async (test) => {
          try {
            const latestResult = await this.db.kysely
              .selectFrom('health_test_results')
              .where('health_test_id', '=', test.id)
              .orderBy('run_at', 'desc')
              .selectAll()
              .limit(1)
              .executeTakeFirst();

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
                    health_test_id: latestResult.health_test_id,
                    status: latestResult.status,
                    status_text: latestResult.status_text,
                    response_time_ms: latestResult.response_time_ms,
                    outcome: latestResult.outcome,
                    error_message: latestResult.error_message,
                    response_body: latestResult.response_body,
                    run_at: latestResult.run_at,
                    run_group_id: latestResult.run_group_id || null,
                  }
                : null,
            };
          } catch (error: any) {
            console.error(`Error fetching result for test ${test.id}:`, error);
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
              latest_result: null,
            };
          }
        })
      );

      return testsWithResults;
    } catch (error: any) {
      console.error('Error in getTestsWithLatestResults:', error);
      throw error;
    }
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

      // Store result in database using Kysely
      const resultId = generateUUID();
      try {
        await this.db.kysely
          .insertInto('health_test_results')
          .values({
            id: resultId,
            health_test_id: test.id,
            run_group_id: checkGroupId,
            status: status,
            status_text: statusText,
            response_time_ms: responseTime,
            outcome: outcome,
            error_message: outcome === 'fail' ? statusText : null,
            response_body: responseBody,
            run_at: new Date().toISOString(),
          })
          .execute();
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
    let query = this.db.kysely
      .selectFrom('health_test_results')
      .innerJoin('health_tests', 'health_tests.id', 'health_test_results.health_test_id')
      .select([
        'health_test_results.id',
        'health_test_results.health_test_id',
        'health_test_results.run_group_id',
        'health_test_results.status',
        'health_test_results.status_text',
        'health_test_results.response_time_ms',
        'health_test_results.outcome',
        'health_test_results.error_message',
        'health_test_results.response_body',
        'health_test_results.run_at',
        'health_tests.name',
        'health_tests.endpoint_path',
        'health_tests.http_method',
        'health_tests.category',
        'health_tests.description',
      ])
      .orderBy('health_test_results.run_at', 'desc')
      .limit(limit);

    if (runGroupId) {
      query = query.where('health_test_results.run_group_id', '=', runGroupId);
    }

    const results = await query.execute();

    // Transform results to match the expected format
    return results.map(result => ({
      id: result.id,
      health_test_id: result.health_test_id,
      run_group_id: result.run_group_id,
      status: result.status,
      status_text: result.status_text,
      response_time_ms: result.response_time_ms,
      outcome: result.outcome,
      error_message: result.error_message,
      response_body: result.response_body,
      run_at: result.run_at,
      health_test: {
        name: result.name,
        endpoint_path: result.endpoint_path,
        http_method: result.http_method,
        category: result.category,
        description: result.description,
      },
    }));
  }

  public async getLatestHealthCheck(): Promise<HealthCheckResult | null> {
    // Try to get from new health_test_results table first
    const latestResult = await this.db.kysely
      .selectFrom('health_test_results')
      .select(['run_group_id', 'run_at'])
      .orderBy('run_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (latestResult) {
      const allResultsInGroup = await this.db.kysely
        .selectFrom('health_test_results')
        .innerJoin('health_tests', 'health_tests.id', 'health_test_results.health_test_id')
        .where('health_test_results.run_group_id', '=', latestResult.run_group_id)
        .select([
          'health_test_results.status',
          'health_test_results.status_text',
          'health_test_results.response_time_ms',
          'health_test_results.outcome',
          'health_tests.name',
          'health_tests.category',
          'health_tests.endpoint_path',
          'health_tests.http_method',
        ])
        .execute();

      const results: EndpointResult[] = allResultsInGroup.map((result) => ({
        endpoint: result.name,
        status: result.status,
        statusText: result.status_text,
        response_time_ms: result.response_time_ms,
        outcome: result.outcome as 'pass' | 'fail',
        category: result.category,
        path: result.endpoint_path,
        method: result.http_method,
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

    // No fallback needed for now
    return null;
  }

}
