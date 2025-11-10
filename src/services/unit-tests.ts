import { initDb, type DbClients } from '../db/client';
import { Env, generateUUID } from '../types';
import { CloudflareApiClient } from '../routes/api/apiClient';

type UnitTestStatus = 'pass' | 'fail';

interface UnitTestMetadata {
  path?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  expectedStatus?: number | number[];
  query?: string;
  requiresAuthHeader?: boolean;
  description?: string;
}

interface PersistedDefinition {
  id: string;
  test_key: string;
  name: string;
  scope: string;
  category: string | null;
  description: string | null;
  executor_key: string;
  error_meanings_json: string | null;
  error_solutions_json: string | null;
  metadata: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DefinitionWithParsedMetadata extends PersistedDefinition {
  metadataParsed: UnitTestMetadata;
  errorMeanings: Record<string, string>;
  errorSolutions: Record<string, string>;
}

interface ExecutionContext {
  env: Env;
  baseUrl: string;
  authToken: string;
  internalFetch?: (request: Request) => Promise<Response>;
}

interface ExecutionResult {
  status: UnitTestStatus;
  httpStatus?: number;
  httpStatusText?: string;
  totalMs: number;
  verboseOutput?: string;
  errorDetails?: string;
}

interface AIAnalysisResult {
  prompt: string | null;
  humanReadable: string | null;
  modelResponse: string | null;
}

interface RunSummary {
  sessionUuid: string;
  startedAt: string;
  completedAt: string;
  triggerSource: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  results: Array<{
    definition: DefinitionWithParsedMetadata;
    result: ExecutionResult;
    runAt: string;
    ai: AIAnalysisResult;
  }>;
}

type TestExecutor = (
  definition: DefinitionWithParsedMetadata,
  context: ExecutionContext
) => Promise<ExecutionResult>;

const DEFAULT_UNIT_TESTS: Array<{
  testKey: string;
  name: string;
  scope: string;
  category: string;
  description: string;
  executorKey: string;
  metadata: UnitTestMetadata;
  errorMeanings: Record<string, string>;
  errorSolutions: Record<string, string>;
}> = [
  {
    testKey: 'internal_health_endpoint',
    name: 'Internal Health Endpoint',
    scope: 'internal',
    category: 'health',
    description: 'Verifies the /health/status endpoint responds with HTTP 200.',
    executorKey: 'http',
    metadata: {
      path: '/health/status',
      method: 'GET',
      requiresAuthHeader: true,
      expectedStatus: 200,
      description: 'Confirms worker routes are mounted and reachable internally.',
    },
    errorMeanings: {
      '401': 'Authorization header missing or invalid client token.',
      '500': 'Health route threw an unhandled internal error.',
      network_error: 'Request to health endpoint failed to execute.',
    },
    errorSolutions: {
      '401': 'Ensure CLIENT_AUTH_TOKEN is set and the Authorization header is forwarded.',
      '500': 'Inspect worker logs for stack trace around /health/status handler.',
      network_error: 'Verify internalFetch is wired and the route is exported correctly.',
    },
  },
  {
    testKey: 'api_workers_list_scripts',
    name: 'Workers API - List Scripts',
    scope: 'external_api',
    category: 'workers',
    description: 'Uses the REST proxy to list Worker scripts through the API router.',
    executorKey: 'http',
    metadata: {
      path: '/api/workers/scripts',
      method: 'GET',
      requiresAuthHeader: true,
      expectedStatus: [200, 204],
      description: 'Confirms /api/workers/scripts proxy returns successfully with the Cloudflare token.',
    },
    errorMeanings: {
      '401': 'Cloudflare API token missing required permissions (Workers Scripts Read).',
      '403': 'Provided token is invalid or does not match the configured account.',
      '500': 'Proxy threw an exception or Cloudflare API returned server error.',
    },
    errorSolutions: {
      '401': 'Update CLOUDFLARE_TOKEN to include Workers Scripts Read scope.',
      '403': 'Ensure CLOUDFLARE_ACCOUNT_ID matches the token scope.',
      '500': 'Check Cloudflare API status or rotate the worker-level token.',
    },
  },
  {
    testKey: 'storage_d1_readiness',
    name: 'D1 Database Connectivity',
    scope: 'internal',
    category: 'storage',
    description: 'Performs a lightweight query against the D1 database to validate connectivity.',
    executorKey: 'd1',
    metadata: {
      description: 'Runs SELECT 1 to confirm the D1 binding is operational.',
    },
    errorMeanings: {
      d1_unavailable: 'D1 binding returned an error while executing a trivial query.',
    },
    errorSolutions: {
      d1_unavailable: 'Check D1 database binding configuration and pending migrations.',
    },
  },
  {
    testKey: 'assets_index_html',
    name: 'Static Assets Fetch',
    scope: 'internal',
    category: 'assets',
    description: 'Ensures the bound static assets namespace can serve the dashboard index.',
    executorKey: 'assets',
    metadata: {
      path: '/index.html',
      description: 'Fetches index.html from the ASSETS binding.',
    },
    errorMeanings: {
      not_found: 'Static assets binding did not contain index.html.',
      fetch_failed: 'Fetching index.html from ASSETS binding failed.',
    },
    errorSolutions: {
      not_found: 'Deploy the dashboard assets or verify the KV bucket contents.',
      fetch_failed: 'Ensure ASSETS binding points to the correct static asset bucket.',
    },
  },
  {
    testKey: 'cloudflare_token_verify',
    name: 'Cloudflare Token Verification',
    scope: 'external_api',
    category: 'security',
    description: 'Calls the Cloudflare API to verify the worker-managed token validity.',
    executorKey: 'cloudflare-token-verify',
    metadata: {
      description: 'Uses cf.user.tokens.verify via the REST client.',
    },
    errorMeanings: {
      '401': 'Cloudflare API rejected the token verification call.',
      api_error: 'Cloudflare API returned structured error while verifying token.',
    },
    errorSolutions: {
      '401': 'Rotate CLOUDFLARE_TOKEN or confirm the token is still active.',
      api_error: 'Review the returned error payload for details; ensure the token has verify permissions.',
    },
  },
];

export class UnitTestService {
  private readonly _db: DbClients;
  private readonly defaultTests = DEFAULT_UNIT_TESTS;

  constructor(private readonly env: Env) {
    this._db = initDb(env);
  }

  /**
   * Seed or update the test definitions stored in D1 so that
   * declarative metadata stays in sync with the code.
   */
  public async ensureDefinitionsRegistered(): Promise<void> {
    const nowIso = new Date().toISOString();

    for (const def of this.defaultTests) {
      const existing = await this._db.kysely
        .selectFrom('unit_test_definitions')
        .where('test_key', '=', def.testKey)
        .selectAll()
        .limit(1)
        .executeTakeFirst();

      const serializedMetadata = JSON.stringify(def.metadata ?? {});
      const serializedMeanings = JSON.stringify(def.errorMeanings ?? {});
      const serializedSolutions = JSON.stringify(def.errorSolutions ?? {});

      if (!existing) {
        await this._db.kysely
          .insertInto('unit_test_definitions')
          .values({
            id: generateUUID(),
            test_key: def.testKey,
            name: def.name,
            scope: def.scope,
            category: def.category,
            description: def.description,
            executor_key: def.executorKey,
            error_meanings_json: serializedMeanings,
            error_solutions_json: serializedSolutions,
            metadata: serializedMetadata,
            is_active: 1,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .execute();
      } else {
        const needsUpdate =
          existing.name !== def.name ||
          existing.scope !== def.scope ||
          existing.category !== def.category ||
          existing.description !== def.description ||
          existing.executor_key !== def.executorKey ||
          existing.error_meanings_json !== serializedMeanings ||
          existing.error_solutions_json !== serializedSolutions ||
          existing.metadata !== serializedMetadata ||
          !existing.is_active;

        if (needsUpdate) {
          await this._db.kysely
            .updateTable('unit_test_definitions')
            .set({
              name: def.name,
              scope: def.scope,
              category: def.category,
              description: def.description,
              executor_key: def.executorKey,
              error_meanings_json: serializedMeanings,
              error_solutions_json: serializedSolutions,
              metadata: serializedMetadata,
              is_active: 1,
              updated_at: nowIso,
            })
            .where('id', '=', existing.id)
            .execute();
        }
      }
    }
  }

  private parseDefinition(record: PersistedDefinition): DefinitionWithParsedMetadata {
    const metadataParsed: UnitTestMetadata = record.metadata
      ? safeJsonParse(record.metadata, {})
      : {};
    const errorMeanings = record.error_meanings_json
      ? safeJsonParse<Record<string, string>>(record.error_meanings_json, {})
      : {};
    const errorSolutions = record.error_solutions_json
      ? safeJsonParse<Record<string, string>>(record.error_solutions_json, {})
      : {};

    return {
      ...record,
      metadataParsed,
      errorMeanings,
      errorSolutions,
    };
  }

  private getExecutor(executorKey: string): TestExecutor {
    switch (executorKey) {
      case 'http':
        return this.executeHttpTest.bind(this);
      case 'd1':
        return this.executeD1Test.bind(this);
      case 'assets':
        return this.executeAssetsTest.bind(this);
      case 'cloudflare-token-verify':
        return this.executeCloudflareTokenVerify.bind(this);
      default:
        return async () => ({
          status: 'fail',
          totalMs: 0,
          errorDetails: `Unknown executor key: ${executorKey}`,
        });
    }
  }

  private async executeHttpTest(
    definition: DefinitionWithParsedMetadata,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const metadata = definition.metadataParsed;
    const method = (metadata.method || 'GET').toUpperCase();
    const path = metadata.path || '/';
    const expectedStatuses = Array.isArray(metadata.expectedStatus)
      ? metadata.expectedStatus
      : metadata.expectedStatus != null
      ? [metadata.expectedStatus]
      : [200];

    const url =
      path.startsWith('http://') || path.startsWith('https://')
        ? path
        : new URL(path, context.baseUrl).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(metadata.headers ?? {}),
    };

    if (metadata.requiresAuthHeader !== false) {
      headers.Authorization = `Bearer ${context.authToken}`;
    }

    const body =
      metadata.body !== undefined
        ? typeof metadata.body === 'string'
          ? metadata.body
          : JSON.stringify(metadata.body)
        : undefined;

    const request = new Request(url, {
      method,
      headers,
      body,
    });

    const executorFetch = context.internalFetch ?? fetch;
    const start = Date.now();
    try {
      const response = await executorFetch(request);
      const totalMs = Date.now() - start;
      const responseText = await response.text();

      const isPass = expectedStatuses.includes(response.status);

      return {
        status: isPass ? 'pass' : 'fail',
        httpStatus: response.status,
        httpStatusText: response.statusText,
        totalMs,
        verboseOutput: trimForStorage(responseText),
        errorDetails: isPass ? undefined : responseText.substring(0, 500),
      };
    } catch (error: any) {
      const totalMs = Date.now() - start;
      return {
        status: 'fail',
        totalMs,
        errorDetails: `HTTP test execution failed: ${error.message}`,
      };
    }
  }

  private async executeD1Test(
    definition: DefinitionWithParsedMetadata,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const start = Date.now();
    try {
      const result = await context.env.DB.prepare('SELECT 1 as ok').first();
      const totalMs = Date.now() - start;
      const ok = result && (result as any).ok === 1;
      return {
        status: ok ? 'pass' : 'fail',
        totalMs,
        verboseOutput: JSON.stringify(result),
        errorDetails: ok ? undefined : 'D1 query did not return expected value.',
      };
    } catch (error: any) {
      const totalMs = Date.now() - start;
      return {
        status: 'fail',
        totalMs,
        errorDetails: `D1 query failed: ${error.message || error}`,
      };
    }
  }

  private async executeAssetsTest(
    definition: DefinitionWithParsedMetadata,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const metadata = definition.metadataParsed;
    const path = metadata.path || '/index.html';
    const start = Date.now();
    try {
      const response = await context.env.ASSETS.fetch(
        new Request(`https://assets${path}`)
      );
      const totalMs = Date.now() - start;
      const text = await response.text();
      const isPass = response.ok && text.length > 0;
      return {
        status: isPass ? 'pass' : 'fail',
        httpStatus: response.status,
        httpStatusText: response.statusText,
        totalMs,
        verboseOutput: trimForStorage(text),
        errorDetails: isPass ? undefined : 'ASSETS binding did not return content.',
      };
    } catch (error: any) {
      const totalMs = Date.now() - start;
      return {
        status: 'fail',
        totalMs,
        errorDetails: `ASSETS fetch failed: ${error.message || error}`,
      };
    }
  }

  private async executeCloudflareTokenVerify(
    _: DefinitionWithParsedMetadata,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const start = Date.now();
    try {
      const client = new CloudflareApiClient({
        apiToken: context.env.CLOUDFLARE_TOKEN,
      });
      const response = await client.get('/user/tokens/verify');
      const totalMs = Date.now() - start;
      const text = JSON.stringify(response);
      return {
        status: 'pass',
        totalMs,
        verboseOutput: trimForStorage(text),
      };
    } catch (error: any) {
      const totalMs = Date.now() - start;
      const status = error?.status;
      return {
        status: 'fail',
        totalMs,
        httpStatus: typeof status === 'number' ? status : undefined,
        httpStatusText: error?.details?.status ?? error?.message,
        errorDetails:
          error?.details?.errors?.[0]?.message ||
          error?.message ||
          'Token verification failed',
      };
    }
  }

  private async analyzeWithAI(
    definition: DefinitionWithParsedMetadata,
    execResult: ExecutionResult
  ): Promise<AIAnalysisResult> {
    if (execResult.status === 'pass') {
      return { prompt: null, humanReadable: null, modelResponse: null };
    }

    if (!this.env.AI) {
      // Provide structured fallback without AI
      const firstMeaning =
        definition.errorMeanings[execResult.httpStatus?.toString() ?? ''] ??
        definition.errorMeanings['default'] ??
        'Unmapped failure encountered during unit test.';
      const firstSolution =
        definition.errorSolutions[execResult.httpStatus?.toString() ?? ''] ??
        definition.errorSolutions['default'] ??
        'Review worker logs and environment configuration.';
      return {
        prompt: null,
        humanReadable: `${firstMeaning} Suggested action: ${firstSolution}`,
        modelResponse: null,
      };
    }

    try {
      const errorMappings = {
        meanings: definition.errorMeanings,
        solutions: definition.errorSolutions,
      };

      const promptPayload = {
        test: {
          key: definition.testKey,
          name: definition.name,
          scope: definition.scope,
          description: definition.description,
          metadata: definition.metadataParsed,
        },
        execution: {
          status: execResult.status,
          httpStatus: execResult.httpStatus,
          httpStatusText: execResult.httpStatusText,
          totalMs: execResult.totalMs,
          verboseOutput: execResult.verboseOutput?.slice(0, 800),
          errorDetails: execResult.errorDetails,
        },
        errorMappings,
      };

      const prompt = `You are assisting with automated reliability tests for a Cloudflare Worker platform.
Test definition and execution details are provided below.
Return a concise, human-friendly explanation of the failure and a recommended remediation.
If remediation is already described in errorMappings.solutions, reference it, otherwise propose a practical next step.
Format the result as plain text.`;

      const aiResponse = await this.env.AI.run('@cf/openai/gpt-oss-120b', {
        instructions: prompt,
        input: JSON.stringify(promptPayload),
      });

      const responseAsString =
        typeof aiResponse === 'string'
          ? aiResponse
          : (aiResponse as any)?.response || JSON.stringify(aiResponse);

      return {
        prompt,
        humanReadable: responseAsString.trim(),
        modelResponse: responseAsString.trim(),
      };
    } catch (error: any) {
      const fallback = definition.errorSolutions['default'] ?? 'Review worker logs.';
      return {
        prompt: null,
        humanReadable: `AI analysis unavailable: ${error.message || error}. Suggested action: ${fallback}`,
        modelResponse: null,
      };
    }
  }

  private async getActiveDefinitions(): Promise<DefinitionWithParsedMetadata[]> {
    const rows = await this._db.kysely
      .selectFrom('unit_test_definitions')
      .where('is_active', '=', true)
      .orderBy('name')
      .selectAll()
      .execute();
    return rows.map((row) =>
      this.parseDefinition(row as PersistedDefinition)
    );
  }

  /**
   * Run unit tests and persist session/result records.
   */
  public async runUnitTests(
    triggerSource: string,
    context: ExecutionContext
  ): Promise<RunSummary> {
    await this.ensureDefinitionsRegistered();
    const definitions = await this.getActiveDefinitions();

    const sessionUuid = generateUUID();
    const startedAt = new Date().toISOString();

    await this.kysely
      .insertInto('unit_test_sessions')
      .values({
        session_uuid: sessionUuid,
        trigger_source: triggerSource,
        started_at: startedAt,
        completed_at: startedAt,
        total_tests: definitions.length,
        passed_tests: 0,
        failed_tests: 0,
        duration_ms: 0,
        notes: null,
        created_at: startedAt,
      })
      .execute();

    let passed = 0;
    let failed = 0;
    const results: RunSummary['results'] = [];
    const startMillis = Date.now();

    for (const definition of definitions) {
      const executor = this.getExecutor(definition.executorKey);
      const execResult = await executor(definition, context);
      if (execResult.status === 'pass') {
        passed += 1;
      } else {
        failed += 1;
      }

      const runAt = new Date().toISOString();
      const aiAnalysis = await this.analyzeWithAI(definition, execResult);

      await this._db.kysely
        .insertInto('unit_test_results')
        .values({
          id: generateUUID(),
          session_uuid: sessionUuid,
          test_definition_id: definition.id,
          status: execResult.status,
          http_status: execResult.httpStatus ?? null,
          http_status_text: execResult.httpStatusText ?? null,
          total_ms: execResult.totalMs,
          run_at: runAt,
          verbose_output: execResult.verboseOutput ?? null,
          error_details: execResult.errorDetails ?? null,
          ai_prompt_to_fix_error: aiAnalysis.prompt,
          ai_human_readable_error_description: aiAnalysis.humanReadable,
          ai_model_response: aiAnalysis.modelResponse,
          metadata: null,
        })
        .execute();

      results.push({
        definition,
        result: execResult,
        runAt,
        ai: aiAnalysis,
      });
    }

    const durationMs = Date.now() - startMillis;
    const completedAt = new Date().toISOString();

    await this.kysely
      .updateTable('unit_test_sessions')
      .set({
        completed_at: completedAt,
        total_tests: definitions.length,
        passed_tests: passed,
        failed_tests: failed,
        duration_ms: durationMs,
      })
      .where('session_uuid', '=', sessionUuid)
      .execute();

    return {
      sessionUuid,
      startedAt,
      completedAt,
      triggerSource,
      totalTests: definitions.length,
      passedTests: passed,
      failedTests: failed,
      durationMs,
      results,
    };
  }

  public async getActiveDefinitionsWithLatestResults(): Promise<
    Array<{
      definition: DefinitionWithParsedMetadata;
      latestResult: {
        status: UnitTestStatus;
        runAt: string;
        httpStatus?: number | null;
        httpStatusText?: string | null;
        totalMs?: number;
        aiSummary?: string | null;
      } | null;
    }>
  > {
    await this.ensureDefinitionsRegistered();
    const definitions = await this.getActiveDefinitions();

    const latestResults = await Promise.all(
      definitions.map(async (definition) => {
        const row = await this._db.kysely
          .selectFrom('unit_test_results')
          .where('test_definition_id', '=', definition.id)
          .orderBy('run_at', 'desc')
          .selectAll()
          .limit(1)
          .executeTakeFirst();

        if (!row) {
          return { definition, latestResult: null };
        }

        return {
          definition,
          latestResult: {
            status: row.status as UnitTestStatus,
            runAt: row.runAt,
            httpStatus: row.httpStatus ?? null,
            httpStatusText: row.httpStatusText ?? null,
            totalMs: row.totalMs ?? undefined,
            aiSummary: row.aiHumanReadableErrorDescription ?? null,
          },
        };
      })
    );

    return latestResults;
  }

  public async getLatestSession(): Promise<RunSummary | null> {
    const sessionRow = await this._db.kysely
      .selectFrom('unit_test_sessions')
      .orderBy('started_at', 'desc')
      .selectAll()
      .limit(1)
      .executeTakeFirst();

    if (!sessionRow) {
      return null;
    }

    return this.getSessionSummary(sessionRow.sessionUuid);
  }

  public async getSessionSummary(sessionUuid: string): Promise<RunSummary> {
    const sessionRow = await this._db.kysely
      .selectFrom('unit_test_sessions')
      .where('session_uuid', '=', sessionUuid)
      .selectAll()
      .limit(1)
      .executeTakeFirst();

    if (!sessionRow) {
      throw new Error(`Session ${sessionUuid} not found`);
    }

    const definitionRows = await this.listDefinitions(true);
    const definitionsById = new Map(
      definitionRows.map((def) => [def.id, def])
    );

    const resultsRows = await this._db.kysely
      .selectFrom('unit_test_results')
      .where('session_uuid', '=', sessionUuid)
      .selectAll()
      .execute();

    const results = resultsRows.map((row: any) => {
      const definition = definitionsById.get(row.test_definition_id);
      if (!definition) {
        throw new Error(
          `Missing test definition for result ${row.test_definition_id}`
        );
      }

      const executionResult: ExecutionResult = {
        status: row.status,
        httpStatus: row.http_status ?? undefined,
        httpStatusText: row.http_status_text ?? undefined,
        totalMs: row.total_ms ?? 0,
        verboseOutput: row.verbose_output ?? undefined,
        errorDetails: row.error_details ?? undefined,
      };

      const ai: AIAnalysisResult = {
        prompt: row.ai_prompt_to_fix_error ?? null,
        humanReadable: row.ai_human_readable_error_description ?? null,
        modelResponse: row.ai_model_response ?? null,
      };

      return {
        definition,
        result: executionResult,
        runAt: row.run_at,
        ai,
      };
    });

    return {
      sessionUuid: sessionRow.session_uuid,
      startedAt: sessionRow.started_at,
      completedAt: sessionRow.completed_at,
      triggerSource: sessionRow.trigger_source,
      totalTests: sessionRow.total_tests,
      passedTests: sessionRow.passed_tests,
      failedTests: sessionRow.failed_tests,
      durationMs: sessionRow.duration_ms,
      results,
    };
  }

  public async listDefinitions(includeInactive = false) {
    await this.ensureDefinitionsRegistered();
    let query = this._db.kysely
      .selectFrom('unit_test_definitions')
      .selectAll();

    if (!includeInactive) {
      query = query.where('is_active', '=', true);
    }

    const rows = await query.execute();
    return rows.map((row) => this.parseDefinition(row as PersistedDefinition));
  }
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function trimForStorage(value: string | undefined | null, limit = 2000): string {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}... [TRUNCATED]`;
}
