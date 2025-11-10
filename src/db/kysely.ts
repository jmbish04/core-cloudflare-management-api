import {
  CompiledQuery,
  DatabaseConnection,
  Dialect,
  Driver,
  Kysely,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';

type D1PreparedStatement = {
  bind: (...params: any[]) => D1PreparedStatement;
  all: () => Promise<{ results?: any[]; meta?: any }>;
  run: () => Promise<{ meta?: any }>;
  first: () => Promise<any>;
};

type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
};

class D1Dialect implements Dialect {
  constructor(private readonly database: D1Database) {}

  createAdapter() {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new D1Driver(this.database);
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler() {
    return new SqliteQueryCompiler();
  }
}

class D1Driver implements Driver {
  constructor(private readonly database: D1Database) {}

  async init(): Promise<void> {
    // No-op for D1
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.database);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('BEGIN'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('COMMIT'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('ROLLBACK'));
  }

  async releaseConnection(): Promise<void> {
    // Connections are stateless in D1
  }

  async destroy(): Promise<void> {
    // No-op
  }
}

class D1Connection implements DatabaseConnection {
  constructor(private readonly database: D1Database) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const sql = compiledQuery.sql;
    const params = compiledQuery.parameters ?? [];
    const statement = this.database.prepare(sql);

    const command = sql.trim().split(/\s+/)[0]?.toLowerCase();
    const isSelect = command === 'select' || command === 'with' || command === 'pragma';

    if (isSelect) {
      const result = await statement.bind(...params).all();
      const rows = (result?.results ?? []) as R[];
      const meta = result?.meta ?? {};
      const changes = Number(meta?.changes ?? 0);
      const lastRowId = meta?.last_row_id ?? meta?.lastRowid ?? null;
      return {
        rows,
        numAffectedRows: BigInt(changes),
        insertId: lastRowId != null ? BigInt(lastRowId) : undefined,
      };
    }

    const result = await statement.bind(...params).run();
    const meta = (result as any)?.meta ?? {};
    const changes = Number(meta?.changes ?? (result as any)?.changes ?? 0);
    const lastRowId = meta?.last_row_id ?? meta?.lastRowid ?? null;
    return {
      rows: [] as R[],
      numAffectedRows: BigInt(changes),
      insertId: lastRowId != null ? BigInt(lastRowId) : undefined,
    };
  }

  streamQuery<R>(
    compiledQuery: CompiledQuery,
    _chunkSize?: number
  ): AsyncIterableIterator<QueryResult<R>> {
    const self = this;
    async function* iterator() {
      yield await self.executeQuery<R>(compiledQuery);
    }
    return iterator();
  }
}

export interface UnitTestSessionsTable {
  session_uuid: string;
  trigger_source: string;
  started_at: string;
  completed_at: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  duration_ms: number;
  notes: string | null;
  created_at: string;
}

export interface HealthTestsTable {
  id: string;
  name: string;
  endpoint_path: string;
  http_method: string;
  category: string;
  description: string | null;
  request_body: string | null;
  enabled: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface HealthTestResultsTable {
  id: string;
  health_test_id: string;
  status: number;
  status_text: string;
  response_time_ms: number;
  outcome: 'pass' | 'fail';
  error_message: string | null;
  response_body: string | null;
  run_at: string;
  run_group_id: string | null;
}

export interface HealthChecksTable {
  check_group_id: string;
  run_at: string;
  total_endpoints: number;
  healthy_endpoints: number;
  unhealthy_endpoints: number;
  overall_status: string;
  duration_ms: number;
}

export interface UnitTestKyselyDatabase {
  unit_test_sessions: UnitTestSessionsTable;
  health_tests: HealthTestsTable;
  health_test_results: HealthTestResultsTable;
  health_checks: HealthChecksTable;
}

export function createD1Kysely(db: D1Database) {
  return new Kysely<UnitTestKyselyDatabase>({
    dialect: new D1Dialect(db),
  });
}
