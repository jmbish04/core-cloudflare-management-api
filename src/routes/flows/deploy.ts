import { Hono } from 'hono';
import { Env, Variables, generateUUID } from '../../types';
import {
  deployWorkerScript,
  buildWorkerBindings,
  mergeMigrations,
  createAssetUploadSession,
  uploadAssetBatch,
  createAssetManifest,
  WorkerMetadata,
  WorkerBinding,
} from '../../utils/deploy';

const deployFlows = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Deployment Orchestration Flows
 *
 * High-level workflows for deploying Cloudflare Workers:
 * - Deploy from raw content (code as string)
 * - Deploy from canvas with assets
 * - Deploy with full configuration (wrangler-style)
 * - Update existing deployments
 * - Rollback to previous versions
 * - Batch deployments
 */

// Deploy worker from raw content
deployFlows.post('/from-content', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      script_name,
      content,
      compatibility_date = '2024-06-01',
      compatibility_flags = [],
      bindings = {},
      vars = {},
      dispatch_namespace,
    } = body;

    if (!script_name || !content) {
      return c.json(
        { success: false, error: 'script_name and content are required' },
        400
      );
    }

    const result: any = {
      script_name,
      steps_completed: [],
      errors: [],
    };

    // Build worker bindings
    const workerBindings = buildWorkerBindings(bindings);

    // Build metadata
    const metadata: WorkerMetadata = {
      main_module: 'index.js',
      compatibility_date,
      compatibility_flags,
      bindings: workerBindings,
    };

    if (Object.keys(vars).length > 0) {
      metadata.vars = vars;
    }

    // Deploy worker
    try {
      await deployWorkerScript(
        cf,
        accountId,
        script_name,
        content,
        metadata,
        dispatch_namespace
      );
      result.steps_completed.push('worker_deployed');
    } catch (error: any) {
      result.errors.push({
        step: 'deploy_worker',
        error: error.message,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to deploy worker',
          details: error.message,
          partial_result: result,
        },
        500
      );
    }

    // Get deployment info
    try {
      const worker = await cf.workers.scripts.get(script_name, {
        account_id: accountId,
      });
      result.worker = worker;
      result.steps_completed.push('deployment_verified');
    } catch (error) {
      console.error('Failed to verify deployment:', error);
    }

    return c.json(
      {
        success: true,
        result,
        message: `Worker '${script_name}' deployed successfully`,
      },
      201
    );
  } catch (error: any) {
    console.error('Error in deploy-from-content flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Deploy worker from canvas/editor with assets
deployFlows.post('/from-canvas', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      script_name,
      content,
      assets = {},
      compatibility_date = '2024-06-01',
      compatibility_flags = [],
      bindings = {},
      vars = {},
      asset_config = {},
      dispatch_namespace,
    } = body;

    if (!script_name || !content) {
      return c.json(
        { success: false, error: 'script_name and content are required' },
        400
      );
    }

    const result: any = {
      script_name,
      steps_completed: [],
      errors: [],
      assets_uploaded: 0,
    };

    const hasAssets = Object.keys(assets).length > 0;

    // Build asset manifest
    let assetJwt: string | undefined;
    if (hasAssets) {
      try {
        // Convert assets to proper format
        const assetFiles = new Map<string, ArrayBuffer>();
        for (const [path, content] of Object.entries(assets)) {
          if (typeof content === 'string') {
            const encoder = new TextEncoder();
            assetFiles.set(path, encoder.encode(content).buffer as ArrayBuffer);
          }
        }

        // Create manifest
        const manifest = await createAssetManifest(assetFiles);
        result.steps_completed.push('asset_manifest_created');

        // Create upload session
        const uploadSession = await createAssetUploadSession(
          cf,
          accountId,
          script_name,
          manifest,
          dispatch_namespace
        );
        result.steps_completed.push('asset_upload_session_created');

        // Upload assets
        if (uploadSession.buckets && uploadSession.buckets.length > 0) {
          const hashToContent = new Map<string, ArrayBuffer>();
          for (const [path, info] of Object.entries(manifest)) {
            const content = assetFiles.get(path);
            if (content) {
              hashToContent.set(info.hash, content);
            }
          }

          let completionToken = uploadSession.jwt;
          for (const bucket of uploadSession.buckets) {
            const token = await uploadAssetBatch(
              cf,
              accountId,
              uploadSession.jwt,
              bucket,
              hashToContent
            );
            if (token) {
              completionToken = token;
            }
            result.assets_uploaded += bucket.length;
          }
          assetJwt = completionToken;
          result.steps_completed.push('assets_uploaded');
        } else {
          assetJwt = uploadSession.jwt;
        }
      } catch (error: any) {
        result.errors.push({
          step: 'asset_upload',
          error: error.message,
        });
        return c.json(
          {
            success: false,
            error: 'Failed to upload assets',
            details: error.message,
            partial_result: result,
          },
          500
        );
      }
    }

    // Build worker bindings
    const workerBindings = buildWorkerBindings(bindings, hasAssets, asset_config.binding);

    // Build metadata
    const metadata: WorkerMetadata = {
      main_module: 'index.js',
      compatibility_date,
      compatibility_flags,
      bindings: workerBindings,
    };

    if (assetJwt) {
      metadata.assets = {
        jwt: assetJwt,
        config: {
          not_found_handling: asset_config.not_found_handling,
          run_worker_first: asset_config.run_worker_first,
          binding: asset_config.binding,
        },
      };
    }

    if (Object.keys(vars).length > 0) {
      metadata.vars = vars;
    }

    // Deploy worker
    try {
      await deployWorkerScript(
        cf,
        accountId,
        script_name,
        content,
        metadata,
        dispatch_namespace
      );
      result.steps_completed.push('worker_deployed');
    } catch (error: any) {
      result.errors.push({
        step: 'deploy_worker',
        error: error.message,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to deploy worker',
          details: error.message,
          partial_result: result,
        },
        500
      );
    }

    return c.json(
      {
        success: true,
        result,
        message: `Worker '${script_name}' deployed with ${result.assets_uploaded} assets`,
      },
      201
    );
  } catch (error: any) {
    console.error('Error in deploy-from-canvas flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Deploy worker with full configuration (wrangler-style)
deployFlows.post('/with-config', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      script_name,
      content,
      config, // Full wrangler-style config
      dispatch_namespace,
    } = body;

    if (!script_name || !content || !config) {
      return c.json(
        {
          success: false,
          error: 'script_name, content, and config are required',
        },
        400
      );
    }

    const result: any = {
      script_name,
      steps_completed: [],
      errors: [],
    };

    // Extract bindings from config
    const bindings = {
      kv: config.kv_namespaces || [],
      d1: config.d1_databases || [],
      r2: config.r2_buckets || [],
      durable_objects: config.durable_objects?.bindings || [],
      services: config.services || [],
    };

    const workerBindings = buildWorkerBindings(bindings);

    // Build metadata
    const metadata: WorkerMetadata = {
      main_module: 'index.js',
      compatibility_date: config.compatibility_date || '2024-06-01',
      compatibility_flags: config.compatibility_flags,
      bindings: workerBindings,
    };

    // Handle migrations for Durable Objects
    if (config.migrations) {
      const mergedMigration = mergeMigrations(config.migrations);
      if (mergedMigration) {
        metadata.migrations = mergedMigration;
        // Extract DO classes for exported_handlers
        const doClasses = [
          ...(mergedMigration.new_classes || []),
          ...(mergedMigration.new_sqlite_classes || []),
        ];
        if (doClasses.length > 0) {
          metadata.exported_handlers = doClasses;
        }
      }
    }

    if (config.vars && Object.keys(config.vars).length > 0) {
      metadata.vars = config.vars;
    }

    // Deploy worker
    try {
      await deployWorkerScript(
        cf,
        accountId,
        script_name,
        content,
        metadata,
        dispatch_namespace
      );
      result.steps_completed.push('worker_deployed');
    } catch (error: any) {
      result.errors.push({
        step: 'deploy_worker',
        error: error.message,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to deploy worker',
          details: error.message,
          partial_result: result,
        },
        500
      );
    }

    return c.json(
      {
        success: true,
        result,
        message: `Worker '${script_name}' deployed with configuration`,
      },
      201
    );
  } catch (error: any) {
    console.error('Error in deploy-with-config flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update existing deployment
deployFlows.put('/update/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const body = await c.req.json();

    const {
      content,
      vars,
      compatibility_date,
      compatibility_flags,
      dispatch_namespace,
    } = body;

    const result: any = {
      script_name: scriptName,
      steps_completed: [],
      errors: [],
    };

    // Get current worker to preserve bindings
    let currentWorker: any;
    try {
      currentWorker = await cf.workers.scripts.get(scriptName, {
        account_id: accountId,
      });
      result.steps_completed.push('current_deployment_fetched');
    } catch (error: any) {
      return c.json(
        { success: false, error: `Worker '${scriptName}' not found` },
        404
      );
    }

    // Build metadata preserving existing bindings
    const metadata: WorkerMetadata = {
      main_module: 'index.js',
      compatibility_date:
        compatibility_date || currentWorker.compatibility_date || '2024-06-01',
      compatibility_flags:
        compatibility_flags || currentWorker.compatibility_flags,
      bindings: currentWorker.bindings || [],
    };

    if (vars) {
      metadata.vars = vars;
    }

    // Deploy updated worker
    try {
      await deployWorkerScript(
        cf,
        accountId,
        scriptName,
        content || currentWorker.script,
        metadata,
        dispatch_namespace
      );
      result.steps_completed.push('worker_updated');
    } catch (error: any) {
      result.errors.push({
        step: 'update_worker',
        error: error.message,
      });
      return c.json(
        {
          success: false,
          error: 'Failed to update worker',
          details: error.message,
          partial_result: result,
        },
        500
      );
    }

    return c.json({
      success: true,
      result,
      message: `Worker '${scriptName}' updated successfully`,
    });
  } catch (error: any) {
    console.error('Error in update deployment flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Rollback to previous deployment
deployFlows.post('/rollback/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const body = await c.req.json();

    const { version_id, dispatch_namespace } = body;

    const result: any = {
      script_name: scriptName,
      steps_completed: [],
      errors: [],
    };

    // Get deployment history
    let deployments: any[];
    try {
      deployments = await (cf.workers.scripts.deployments as any).list({
        account_id: accountId,
        script_name: scriptName,
      } as any);
      result.steps_completed.push('deployment_history_fetched');
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: `Failed to get deployment history for '${scriptName}'`,
          details: error.message,
        },
        500
      );
    }

    // Find target deployment
    const targetDeployment = version_id
      ? deployments.find((d: any) => d.id === version_id)
      : deployments[1]; // Previous deployment

    if (!targetDeployment) {
      return c.json(
        { success: false, error: 'Target deployment not found' },
        404
      );
    }

    result.target_deployment = {
      id: targetDeployment.id,
      created_on: targetDeployment.created_on,
    };

    // Note: Actual rollback would require storing worker content
    // In practice, you'd need to store versions in R2 or use Workers Versions API
    // For now, return information about the target version

    return c.json({
      success: true,
      result,
      message: `Rollback information retrieved for '${scriptName}'`,
      note: 'Actual rollback requires worker content to be stored. Consider using Workers Versions API.',
    });
  } catch (error: any) {
    console.error('Error in rollback flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Batch deploy multiple workers
deployFlows.post('/batch', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const { workers, dispatch_namespace } = body;

    if (!Array.isArray(workers) || workers.length === 0) {
      return c.json(
        { success: false, error: 'workers array is required' },
        400
      );
    }

    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const worker of workers) {
      const { script_name, content, bindings = {}, vars = {} } = worker;

      const workerResult: any = {
        script_name,
        success: false,
        steps_completed: [],
        errors: [],
      };

      try {
        // Build bindings
        const workerBindings = buildWorkerBindings(bindings);

        // Build metadata
        const metadata: WorkerMetadata = {
          main_module: 'index.js',
          compatibility_date: worker.compatibility_date || '2024-06-01',
          compatibility_flags: worker.compatibility_flags,
          bindings: workerBindings,
        };

        if (Object.keys(vars).length > 0) {
          metadata.vars = vars;
        }

        // Deploy worker
        await deployWorkerScript(
          cf,
          accountId,
          script_name,
          content,
          metadata,
          dispatch_namespace
        );

        workerResult.success = true;
        workerResult.steps_completed.push('deployed');
        successCount++;
      } catch (error: any) {
        workerResult.errors.push({
          step: 'deploy',
          error: error.message,
        });
        failureCount++;
      }

      results.push(workerResult);
    }

    return c.json({
      success: failureCount === 0,
      result: {
        total: workers.length,
        successful: successCount,
        failed: failureCount,
        deployments: results,
      },
      message: `Batch deployment completed: ${successCount}/${workers.length} successful`,
    });
  } catch (error: any) {
    console.error('Error in batch deploy flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get deployment status and history
deployFlows.get('/status/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');

    const status: any = {
      script_name: scriptName,
    };

    // Get worker details
    try {
      const workerResponse = await cf.workers.scripts.get(scriptName, {
        account_id: accountId,
      });
      const worker: any = await workerResponse.json();
      status.worker = {
        id: worker.id,
        created_on: worker.created_on,
        modified_on: worker.modified_on,
        compatibility_date: worker.compatibility_date,
        bindings: worker.bindings?.length || 0,
      };
    } catch (error) {
      return c.json(
        { success: false, error: `Worker '${scriptName}' not found` },
        404
      );
    }

    // Get deployment history
    try {
      const deployments = await (cf.workers.scripts.deployments as any).list({
        account_id: accountId,
        script_name: scriptName,
      } as any);
      status.deployments = deployments.slice(0, 10).map((d: any) => ({
        id: d.id,
        created_on: d.created_on,
        source: d.source,
      }));
      status.deployment_count = deployments.length;
    } catch (error) {
      console.error('Failed to get deployment history:', error);
    }

    // Get subdomain info
    try {
      const subdomainResponse = await cf.workers.subdomains.get({
        account_id: accountId,
      });
      const subdomain = (subdomainResponse as any).subdomain;
      status.url = `https://${scriptName}.${subdomain}.workers.dev`;
    } catch (error) {
      console.error('Failed to get subdomain:', error);
    }

    return c.json({
      success: true,
      result: status,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete deployment
deployFlows.delete('/:scriptName', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const scriptName = c.req.param('scriptName');
    const dispatchNamespace = c.req.query('dispatch_namespace');

    await cf.workers.scripts.delete(scriptName, {
      account_id: accountId,
    });

    return c.json({
      success: true,
      message: `Worker '${scriptName}' deleted successfully`,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default deployFlows;
