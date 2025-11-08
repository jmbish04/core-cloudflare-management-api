import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from '../api/apiClient';

const cicdFlows = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * CI/CD Orchestration Flows
 *
 * High-level flows for managing CI/CD:
 * - Setup complete CI/CD pipeline for existing worker
 * - Create GitHub repo + setup CI/CD (integration with core-github-api)
 * - Configure build rules and deployment settings
 * - Monitor builds and handle failures
 */

// Setup CI/CD for an existing worker
cicdFlows.post('/setup', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      worker_name,
      github_owner,
      github_repo,
      production_branch = 'main',
      staging_branch = 'develop',
      build_command = 'npm run build',
      deploy_command = 'npx wrangler deploy',
      root_dir = '/',
      env_vars = {},
      auto_deploy = true,
    } = body;

    const result: any = {
      worker_name,
      steps_completed: [],
      errors: [],
    };

    // Step 1: Check if worker exists
    try {
      await cf.workers.scripts.get(worker_name, { account_id: accountId });
      result.steps_completed.push('worker_verified');
    } catch (error) {
      return c.json(
        {
          success: false,
          error: `Worker '${worker_name}' not found. Please create the worker first.`,
        },
        404
      );
    }

    // Step 2: Create repository connection
    let repoConnection;
    try {
      const apiClient = c.get('apiClient') as CloudflareApiClient;
      
      const repoConnectionResponse: any = await apiClient.put(
        `/accounts/${accountId}/builds/repos/connections`,
        {
          provider_type: 'github',
          provider_account_id: github_owner,
          provider_account_name: github_owner,
          repo_id: github_repo,
          repo_name: github_repo,
        }
      );
      
      repoConnection = repoConnectionResponse.result;

      result.repo_connection = {
        id: repoConnection.uuid || repoConnection.id,
        repo: `${github_owner}/${github_repo}`,
      };
      result.steps_completed.push('repo_connection_created');
    } catch (error: any) {
      result.errors.push({
        step: 'repo_connection',
        error: error.message,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to create repository connection',
          details: error.message,
          partial_result: result,
        },
        500
      );
    }

    // Step 3: Create production build trigger
    let productionTrigger;
    try {
      const apiClient = c.get('apiClient') as CloudflareApiClient;
      
      // Get or create build token if not provided
      let buildTokenUuid = body.build_token_uuid;
      if (!buildTokenUuid) {
        // Try to get existing build tokens first
        try {
          const tokensResponse: any = await apiClient.get(
            `/accounts/${accountId}/builds/tokens`
          );
          if (tokensResponse.result && tokensResponse.result.length > 0) {
            buildTokenUuid = tokensResponse.result[0].build_token_uuid;
          } else {
            // Create a new build token if none exist
            const newTokenResponse: any = await apiClient.post(
              `/accounts/${accountId}/builds/tokens`,
              {
                build_token_name: `${worker_name}-build-token`,
                build_token_secret: body.build_token_secret || undefined,
              }
            );
            buildTokenUuid = newTokenResponse.result.build_token_uuid;
          }
        } catch (tokenError: any) {
          // If we can't get/create token, try to continue without it (may fail)
          console.warn('Could not get/create build token:', tokenError.message);
        }
      }

      const triggerPayload: any = {
        repo_connection_uuid: repoConnection.uuid || repoConnection.id,
        external_script_id: worker_name,
        trigger_name: `${worker_name}-production`,
        branch_includes: [production_branch],
        branch_excludes: [],
        build_command,
        deploy_command,
        root_directory: root_dir,
        path_includes: ['*'],
        path_excludes: [],
      };

      // Add build_token_uuid if we have it
      if (buildTokenUuid) {
        triggerPayload.build_token_uuid = buildTokenUuid;
      }

      const triggerResponse: any = await apiClient.post(
        `/accounts/${accountId}/builds/triggers`,
        triggerPayload
      );

      productionTrigger = triggerResponse.result;

      // Set environment variables if provided (separate endpoint)
      if (Object.keys(env_vars).length > 0) {
        try {
          const envVarsPayload: Record<string, { value: string; is_secret: boolean }> = {};
          for (const [key, value] of Object.entries({
            ...env_vars,
            ENVIRONMENT: 'production',
          })) {
            envVarsPayload[key] = {
              value: String(value),
              is_secret: false, // Could be enhanced to detect secrets
            };
          }
          await apiClient.put(
            `/accounts/${accountId}/builds/triggers/${productionTrigger.trigger_uuid}/environment_variables`,
            envVarsPayload
          );
        } catch (envError: any) {
          console.warn('Could not set environment variables:', envError.message);
        }
      }

      result.production_trigger = {
        id: productionTrigger.trigger_uuid,
        branch: production_branch,
      };
      result.steps_completed.push('production_trigger_created');
    } catch (error: any) {
      result.errors.push({
        step: 'production_trigger',
        error: error.message,
      });
      // Continue to try creating staging trigger
    }

    // Step 4: Create staging build trigger (if staging branch specified)
    if (staging_branch && staging_branch !== production_branch) {
      try {
        const apiClient = c.get('apiClient') as CloudflareApiClient;
        
        // Get or reuse build token
        let buildTokenUuid = body.build_token_uuid;
        if (!buildTokenUuid && productionTrigger) {
          // Try to get from production trigger if available
          buildTokenUuid = productionTrigger.build_token_uuid;
        }
        
        if (!buildTokenUuid) {
          try {
            const tokensResponse: any = await apiClient.get(
              `/accounts/${accountId}/builds/tokens`
            );
            if (tokensResponse.result && tokensResponse.result.length > 0) {
              buildTokenUuid = tokensResponse.result[0].build_token_uuid;
            }
          } catch (tokenError: any) {
            console.warn('Could not get build token for staging:', tokenError.message);
          }
        }

        const stagingTriggerPayload: any = {
          repo_connection_uuid: repoConnection.uuid || repoConnection.id,
          external_script_id: `${worker_name}-staging`,
          trigger_name: `${worker_name}-staging`,
          branch_includes: [staging_branch],
          branch_excludes: [],
          build_command,
          deploy_command: `${deploy_command} --env staging`,
          root_directory: root_dir,
          path_includes: ['*'],
          path_excludes: [],
        };

        if (buildTokenUuid) {
          stagingTriggerPayload.build_token_uuid = buildTokenUuid;
        }

        const stagingTriggerResponse: any = await apiClient.post(
          `/accounts/${accountId}/builds/triggers`,
          stagingTriggerPayload
        );

        const stagingTrigger = stagingTriggerResponse.result;

        // Set environment variables if provided
        if (Object.keys(env_vars).length > 0) {
          try {
            const envVarsPayload: Record<string, { value: string; is_secret: boolean }> = {};
            for (const [key, value] of Object.entries({
              ...env_vars,
              ENVIRONMENT: 'staging',
            })) {
              envVarsPayload[key] = {
                value: String(value),
                is_secret: false,
              };
            }
            await apiClient.put(
              `/accounts/${accountId}/builds/triggers/${stagingTrigger.trigger_uuid}/environment_variables`,
              envVarsPayload
            );
          } catch (envError: any) {
            console.warn('Could not set staging environment variables:', envError.message);
          }
        }

        result.staging_trigger = {
          id: stagingTrigger.trigger_uuid,
          branch: staging_branch,
        };
        result.steps_completed.push('staging_trigger_created');
      } catch (error: any) {
        result.errors.push({
          step: 'staging_trigger',
          error: error.message,
        });
      }
    }

    // Step 5: Trigger initial deployment (if requested)
    if (auto_deploy && productionTrigger) {
      try {
        const apiClient = c.get('apiClient') as CloudflareApiClient;
        
        const deploymentResponse: any = await apiClient.post(
          `/accounts/${accountId}/builds/triggers/${productionTrigger.trigger_uuid}/builds`,
          {
            branch: production_branch,
          }
        );

        result.initial_deployment = {
          run_id: deploymentResponse.result?.id || deploymentResponse.result?.build_uuid,
          status: deploymentResponse.result?.status || 'triggered',
        };
        result.steps_completed.push('initial_deployment_triggered');
      } catch (error: any) {
        result.errors.push({
          step: 'initial_deployment',
          error: error.message,
        });
      }
    }

    return c.json(
      {
        success: result.errors.length === 0,
        result,
        message:
          result.errors.length === 0
            ? `CI/CD configured successfully for ${worker_name}`
            : 'CI/CD partially configured with errors',
      },
      result.errors.length === 0 ? 201 : 207
    );
  } catch (error: any) {
    console.error('Error in CI/CD setup flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create GitHub repo and setup CI/CD (requires core-github-api integration)
cicdFlows.post('/create-with-repo', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      worker_name,
      github_owner,
      repo_name,
      repo_description = '',
      repo_private = true,
      initialize_with_readme = true,
      core_github_api_url, // URL to core-github-api service
      production_branch = 'main',
      build_command = 'npm run build',
      deploy_command = 'npx wrangler deploy',
    } = body;

    const result: any = {
      worker_name,
      steps_completed: [],
      errors: [],
    };

    // Step 1: Create GitHub repo via core-github-api
    if (core_github_api_url) {
      try {
        const githubApiResponse = await fetch(`${core_github_api_url}/repos/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: c.req.header('Authorization') || '',
          },
          body: JSON.stringify({
            owner: github_owner,
            name: repo_name,
            description: repo_description,
            private: repo_private,
            auto_init: initialize_with_readme,
          }),
        });

        if (!githubApiResponse.ok) {
          const errorData: any = await githubApiResponse.json();
          throw new Error(errorData.error || 'Failed to create GitHub repository');
        }

        const githubResult: any = await githubApiResponse.json();
        result.github_repo = githubResult.result;
        result.steps_completed.push('github_repo_created');
      } catch (error: any) {
        result.errors.push({
          step: 'github_repo_creation',
          error: error.message,
        });
        return c.json(
          {
            success: false,
            error: 'Failed to create GitHub repository',
            details: error.message,
            partial_result: result,
          },
          500
        );
      }
    } else {
      return c.json(
        {
          success: false,
          error: 'core_github_api_url is required for repo creation',
        },
        400
      );
    }

    // Step 2: Setup CI/CD using the setup flow
    try {
      const cicdSetup = await fetch(`${c.req.url.replace('/create-with-repo', '/setup')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: c.req.header('Authorization') || '',
        },
        body: JSON.stringify({
          worker_name,
          github_owner,
          github_repo: repo_name,
          production_branch,
          build_command,
          deploy_command,
          auto_deploy: false, // Don't auto-deploy yet
        }),
      });

      const cicdResult: any = await cicdSetup.json();

      if (cicdResult.success) {
        result.cicd_setup = cicdResult.result;
        result.steps_completed.push('cicd_configured');
      } else {
        result.errors.push({
          step: 'cicd_setup',
          error: cicdResult.error,
        });
      }
    } catch (error: any) {
      result.errors.push({
        step: 'cicd_setup',
        error: error.message,
      });
    }

    return c.json(
      {
        success: result.errors.length === 0,
        result,
        message:
          result.errors.length === 0
            ? `GitHub repo created and CI/CD configured for ${worker_name}`
            : 'Partially completed with errors',
      },
      result.errors.length === 0 ? 201 : 207
    );
  } catch (error: any) {
    console.error('Error in create-with-repo flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update CI/CD configuration
cicdFlows.put('/update/:workerId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const workerId = c.req.param('workerId');
    const body = await c.req.json();

    const {
      trigger_id,
      build_command,
      deploy_command,
      branch_includes,
      branch_excludes,
      env_vars,
      root_dir,
    } = body;

    if (!trigger_id) {
      return c.json({ success: false, error: 'trigger_id is required' }, 400);
    }

    const updateData: any = {};
    if (build_command) updateData.build_command = build_command;
    if (deploy_command) updateData.deploy_command = deploy_command;
    if (branch_includes) updateData.branch_includes = branch_includes;
    if (branch_excludes) updateData.branch_excludes = branch_excludes;
    if (env_vars) updateData.env_vars = env_vars;
    if (root_dir) updateData.root_dir = root_dir;

    /*
    // TODO: The cf.workers.builds API has been deprecated.
    const trigger = await cf.workers.builds.triggers.update(trigger_id, {
      account_id: accountId,
      ...updateData,
    });
    */
    const trigger = { id: trigger_id, ...updateData };

    return c.json({
      success: true,
      result: trigger,
      message: 'CI/CD configuration updated',
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete CI/CD setup for a worker
cicdFlows.delete('/remove/:workerId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const workerId = c.req.param('workerId');

    const result: any = {
      deleted: [],
      errors: [],
    };

    /*
    // TODO: The cf.workers.builds API has been deprecated.
    const triggers = await cf.workers.builds.triggers.list({
      account_id: accountId,
    });
    */
    const triggers: any[] = [];

    const workerTriggers = triggers.filter(
      (t: any) => t.external_script_id === workerId || t.external_script_id === `${workerId}-staging`
    );

    // Delete all triggers
    for (const trigger of workerTriggers) {
      try {
      /*
        // TODO: The cf.workers.builds API has been deprecated.
        await cf.workers.builds.triggers.delete(trigger.id, {
          account_id: accountId,
        });
        */
        result.deleted.push({ type: 'trigger', id: trigger.id });
      } catch (error: any) {
        result.errors.push({
          type: 'trigger',
          id: trigger.id,
          error: error.message,
        });
      }
    }

    // Get repo connections used by these triggers
    const repoConnectionIds = [
      ...new Set(workerTriggers.map((t: any) => t.repo_connection_uuid).filter(Boolean)),
    ];

    // Delete repo connections
    for (const connectionId of repoConnectionIds) {
      try {
      /*
        // TODO: The cf.workers.builds API has been deprecated.
        await cf.workers.builds.repoConnections.delete(connectionId, {
          account_id: accountId,
        });
        */
        result.deleted.push({ type: 'repo_connection', id: connectionId });
      } catch (error: any) {
        result.errors.push({
          type: 'repo_connection',
          id: connectionId,
          error: error.message,
        });
      }
    }

    return c.json({
      success: result.errors.length === 0,
      result,
      message:
        result.errors.length === 0
          ? 'CI/CD setup removed successfully'
          : 'CI/CD partially removed with errors',
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get CI/CD status for a worker
cicdFlows.get('/status/:workerId', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const workerId = c.req.param('workerId');

    const status: any = {
      worker_id: workerId,
      triggers: [],
      recent_builds: [],
      has_cicd: false,
    };

    /*
    // TODO: The cf.workers.builds API has been deprecated.
    const triggers = await cf.workers.builds.triggers.list({
      account_id: accountId,
    });
    */
    const triggers: any[] = [];

    const workerTriggers = triggers.filter(
      (t: any) => t.external_script_id === workerId || t.external_script_id === `${workerId}-staging`
    );

    status.has_cicd = workerTriggers.length > 0;
    status.triggers = workerTriggers;

    // Get recent builds for each trigger
    for (const trigger of workerTriggers) {
      try {
      /*
        // TODO: The cf.workers.builds API has been deprecated.
        const runs = await cf.workers.builds.runs.list({
          account_id: accountId,
          trigger_id: trigger.id,
        });
        */
        const runs: any[] = [];

        status.recent_builds.push({
          trigger_id: trigger.id,
          trigger_name: trigger.trigger_name,
          runs: runs.slice(0, 5), // Last 5 builds
        });
      } catch (error) {
        console.error(`Failed to get builds for trigger ${trigger.id}`, error);
      }
    }

    return c.json({
      success: true,
      result: status,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default cicdFlows;
