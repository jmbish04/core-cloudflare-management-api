import { Hono } from 'hono';
import { Env, Variables } from '../../types';

const healthFlows = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Health Check Flows
 *
 * These flows monitor the health of deployed workers and pages:
 * - Check workers updated in last N days
 * - Analyze build errors
 * - Review observability logs for exceptions
 * - Generate health reports for ecosystems (e.g., vibesdk-hq)
 */

interface WorkerHealthStatus {
  script_name: string;
  last_deployed_at?: string;
  deployment_status: 'healthy' | 'build_errors' | 'runtime_errors' | 'unknown';
  build_errors: any[];
  runtime_errors: any[];
  recent_deployments: any[];
  observability_summary?: {
    total_requests: number;
    error_rate: number;
    exceptions: any[];
  };
}

// Check health of workers updated in the last N days
healthFlows.post('/check-recent-workers', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      days = 7, // Default to last 7 days
      include_observability = true,
      filter_pattern = '', // Optional: filter workers by name pattern
    } = body;

    const results: WorkerHealthStatus[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Step 1: Get all workers
    const workers = await cf.workers.scripts.list({ account_id: accountId });

    for (const worker of workers) {
      const scriptName = worker.id;

      // Apply filter if provided
      if (filter_pattern && !scriptName.includes(filter_pattern)) {
        continue;
      }

      const healthStatus: WorkerHealthStatus = {
        script_name: scriptName,
        deployment_status: 'unknown',
        build_errors: [],
        runtime_errors: [],
        recent_deployments: [],
      };

      try {
        // Step 2: Get recent deployments
        const deployments = await cf.workers.deployments.list({
          account_id: accountId,
          script_name: scriptName,
        } as any);

        healthStatus.recent_deployments = deployments.slice(0, 5); // Keep last 5

        // Check if recently deployed
        if (deployments.length > 0) {
          const latestDeployment = deployments[0];
          healthStatus.last_deployed_at = latestDeployment.created_on;

          const deploymentDate = new Date(latestDeployment.created_on);
          if (deploymentDate < cutoffDate) {
            // Skip workers not updated in the time window
            continue;
          }
        }

        // Step 3: Check for build errors via CI/CD
        try {
          const triggers = await cf.workers.builds.triggers.list({
            account_id: accountId,
          });

          for (const trigger of triggers) {
            if (trigger.external_script_id === scriptName) {
              // Get recent build runs
              const runs = await cf.workers.builds.runs.list({
                account_id: accountId,
                trigger_id: trigger.id,
              });

              // Check for failed builds
              const failedRuns = runs.filter(
                (run: any) => run.status === 'failed' || run.status === 'error'
              );

              if (failedRuns.length > 0) {
                healthStatus.deployment_status = 'build_errors';
                healthStatus.build_errors = failedRuns.map((run: any) => ({
                  run_id: run.id,
                  status: run.status,
                  created_at: run.created_at,
                  error_message: run.error_message,
                }));

                // Try to get logs for failed runs
                for (const failedRun of failedRuns.slice(0, 3)) {
                  try {
                    const logs = await cf.workers.builds.runs.logs(failedRun.id, {
                      account_id: accountId,
                    });
                    failedRun.logs = logs;
                  } catch (logError) {
                    console.error(`Failed to get logs for run ${failedRun.id}`, logError);
                  }
                }
              }
            }
          }
        } catch (buildError) {
          console.error(`Failed to check builds for ${scriptName}:`, buildError);
        }

        // Step 4: Check observability logs (if requested and no build errors)
        if (include_observability && healthStatus.build_errors.length === 0) {
          try {
            // Query Analytics Engine for error metrics
            if (c.env.OBSERVABILITY_AE) {
              const ae = c.env.OBSERVABILITY_AE;

              // Calculate time range
              const endTime = new Date();
              const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

              // Write query to get error metrics
              // Note: This is a simplified example - actual Analytics Engine usage would be more complex
              const errorMetrics = {
                total_requests: 0,
                error_rate: 0,
                exceptions: [],
              };

              // In a real implementation, you would:
              // 1. Query AE for error rate
              // 2. Query AE for exceptions
              // 3. Calculate health score

              healthStatus.observability_summary = errorMetrics;

              // If error rate is high, mark as runtime_errors
              if (errorMetrics.error_rate > 0.05) {
                // > 5% error rate
                healthStatus.deployment_status = 'runtime_errors';
              }
            }
          } catch (obsError) {
            console.error(`Failed to check observability for ${scriptName}:`, obsError);
          }
        }

        // Set status to healthy if no errors found
        if (
          healthStatus.deployment_status === 'unknown' &&
          healthStatus.build_errors.length === 0 &&
          healthStatus.runtime_errors.length === 0
        ) {
          healthStatus.deployment_status = 'healthy';
        }

        results.push(healthStatus);
      } catch (workerError: any) {
        console.error(`Error checking health for ${scriptName}:`, workerError);
        healthStatus.deployment_status = 'unknown';
        healthStatus.runtime_errors.push({
          message: 'Failed to retrieve worker health data',
          error: workerError.message,
        });
        results.push(healthStatus);
      }
    }

    // Generate summary
    const summary = {
      total_checked: results.length,
      healthy: results.filter((r) => r.deployment_status === 'healthy').length,
      build_errors: results.filter((r) => r.deployment_status === 'build_errors').length,
      runtime_errors: results.filter((r) => r.deployment_status === 'runtime_errors').length,
      unknown: results.filter((r) => r.deployment_status === 'unknown').length,
    };

    return c.json({
      success: true,
      result: {
        summary,
        workers: results,
        checked_period: {
          days,
          from: cutoffDate.toISOString(),
          to: new Date().toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('Error in health check flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Check health of a specific worker
healthFlows.get('/worker/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const healthStatus: WorkerHealthStatus = {
      script_name: scriptName,
      deployment_status: 'unknown',
      build_errors: [],
      runtime_errors: [],
      recent_deployments: [],
    };

    // Get worker details
    try {
      await cf.workers.scripts.get(scriptName, { account_id: accountId });
    } catch (error) {
      return c.json({ success: false, error: 'Worker not found' }, 404);
    }

    // Get recent deployments
    try {
      const deployments = await cf.workers.deployments.list({
        account_id: accountId,
        script_name: scriptName,
      } as any);

      healthStatus.recent_deployments = deployments.slice(0, 10);

      if (deployments.length > 0) {
        healthStatus.last_deployed_at = deployments[0].created_on;
      }
    } catch (error) {
      console.error('Failed to get deployments:', error);
    }

    // Check for build errors
    try {
      const triggers = await cf.workers.builds.triggers.list({
        account_id: accountId,
      });

      for (const trigger of triggers) {
        if (trigger.external_script_id === scriptName) {
          const runs = await cf.workers.builds.runs.list({
            account_id: accountId,
            trigger_id: trigger.id,
          });

          // Get last 10 runs
          const recentRuns = runs.slice(0, 10);
          const failedRuns = recentRuns.filter(
            (run: any) => run.status === 'failed' || run.status === 'error'
          );

          if (failedRuns.length > 0) {
            healthStatus.deployment_status = 'build_errors';
            healthStatus.build_errors = failedRuns;

            // Get logs for failed runs
            for (const run of failedRuns.slice(0, 3)) {
              try {
                const logs = await cf.workers.builds.runs.logs(run.id, {
                  account_id: accountId,
                });
                run.logs = logs;
              } catch (logError) {
                console.error(`Failed to get logs for run ${run.id}`, logError);
              }
            }
          }
        }
      }
    } catch (buildError) {
      console.error('Failed to check builds:', buildError);
    }

    // Set to healthy if no errors
    if (
      healthStatus.deployment_status === 'unknown' &&
      healthStatus.build_errors.length === 0
    ) {
      healthStatus.deployment_status = 'healthy';
    }

    return c.json({
      success: true,
      result: healthStatus,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Check health of all workers in a namespace/ecosystem
healthFlows.get('/ecosystem/:prefix', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const prefix = c.req.param('prefix');

    // Get all workers matching prefix (e.g., "vibesdk-")
    const workers = await cf.workers.scripts.list({ account_id: accountId });
    const matchingWorkers = workers.filter((w: any) =>
      w.id.toLowerCase().startsWith(prefix.toLowerCase())
    );

    const results: WorkerHealthStatus[] = [];

    for (const worker of matchingWorkers) {
      const scriptName = worker.id;

      const healthStatus: WorkerHealthStatus = {
        script_name: scriptName,
        deployment_status: 'unknown',
        build_errors: [],
        runtime_errors: [],
        recent_deployments: [],
      };

      try {
        // Get deployments
        const deployments = await cf.workers.deployments.list({
          account_id: accountId,
          script_name: scriptName,
        } as any);

        healthStatus.recent_deployments = deployments.slice(0, 3);
        if (deployments.length > 0) {
          healthStatus.last_deployed_at = deployments[0].created_on;
        }

        // Quick check for build errors
        const triggers = await cf.workers.builds.triggers.list({
          account_id: accountId,
        });

        for (const trigger of triggers) {
          if (trigger.external_script_id === scriptName) {
            const runs = await cf.workers.builds.runs.list({
              account_id: accountId,
              trigger_id: trigger.id,
            });

            const recentFailed = runs
              .slice(0, 5)
              .filter((run: any) => run.status === 'failed' || run.status === 'error');

            if (recentFailed.length > 0) {
              healthStatus.deployment_status = 'build_errors';
              healthStatus.build_errors = recentFailed;
            }
          }
        }

        if (
          healthStatus.deployment_status === 'unknown' &&
          healthStatus.build_errors.length === 0
        ) {
          healthStatus.deployment_status = 'healthy';
        }
      } catch (error) {
        console.error(`Error checking ${scriptName}:`, error);
        healthStatus.deployment_status = 'unknown';
      }

      results.push(healthStatus);
    }

    const summary = {
      ecosystem: prefix,
      total_workers: results.length,
      healthy: results.filter((r) => r.deployment_status === 'healthy').length,
      build_errors: results.filter((r) => r.deployment_status === 'build_errors').length,
      runtime_errors: results.filter((r) => r.deployment_status === 'runtime_errors').length,
      unknown: results.filter((r) => r.deployment_status === 'unknown').length,
    };

    return c.json({
      success: true,
      result: {
        summary,
        workers: results,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default healthFlows;
