-- Health Checks Table
CREATE TABLE IF NOT EXISTS health_checks (
    id TEXT PRIMARY KEY NOT NULL,
    check_time TEXT NOT NULL,
    overall_status TEXT NOT NULL, -- 'healthy', 'degraded', 'unhealthy'
    total_endpoints INTEGER NOT NULL,
    healthy_endpoints INTEGER NOT NULL,
    unhealthy_endpoints INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    results TEXT NOT NULL, -- JSON blob of detailed results
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_health_checks_time ON health_checks(check_time DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(overall_status);
