// @ts-nocheck
import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from '../api/apiClient';
import {
  deployWorkerScript,
  buildWorkerBindings,
  createAssetUploadSession,
  uploadAssetBatch,
  createAssetManifest,
  WorkerMetadata,
} from '../../utils/deploy';

const githubDeployFlows = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GitHub-First Deployment Flows
 * 
 * Default workflow: Everything goes to GitHub, then:
 * 1. Create/update GitHub repository
 * 2. Attach repo to Cloudflare Worker
 * 3. Set up CI/CD triggers
 * 4. Monitor builds with AI-powered analysis
 * 5. Auto-fix common issues (package-lock.json, etc.)
 * 
 * Also supports:
 * - Fast pass-through for simple deployments (2-3 assets, SPA, API proxy)
 * - Smart binding detection from wrangler.jsonc
 * - Automatic binding creation via Cloudflare API
 */

// Main GitHub-first deployment flow
githubDeployFlows.post('/deploy-with-github', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const body = await c.req.json();

    const {
      worker_name,
      github_owner,
      github_repo,
      worker_content, // Worker script content
      wrangler_config, // wrangler.jsonc content (optional)
      assets = {}, // Simple assets map { path: content } (max 2-3 for fast pass)
      production_branch = 'main',
      build_command = 'npm run build',
      deploy_command = 'npm run deploy',
      create_github_repo = true, // Default: create repo if doesn't exist
      core_github_api_url, // URL to core-github-api service
      auto_fix_builds = true, // Enable AI-powered auto-fix
    } = body;

    const result: any = {
      worker_name,
      steps_completed: [],
      errors: [],
      bindings_created: [],
    };

    // Step 1: Parse wrangler.jsonc and detect required bindings
    let detectedBindings: any = {};
    let compatibilityDate = '2024-06-01';
    let compatibilityFlags: string[] = [];
    
    if (wrangler_config) {
      try {
        const config = typeof wrangler_config === 'string' 
          ? JSON.parse(wrangler_config.replace(/\/\/.*$/gm, '')) // Remove comments
          : wrangler_config;

        compatibilityDate = config.compatibility_date || compatibilityDate;
        compatibilityFlags = config.compatibility_flags || [];

        // Detect bindings
        detectedBindings = {
          kv: config.kv_namespaces || [],
          d1: config.d1_databases || [],
          r2: config.r2_buckets || [],
          vectorize: config.vectorize || [],
          durable_objects: config.durable_objects?.bindings || [],
          services: config.services || [],
          analytics_engine: config.analytics_engine_datasets || [],
          queues: config.queues?.producers || [],
        };

        result.steps_completed.push('wrangler_config_parsed');
        result.detected_bindings = Object.keys(detectedBindings).filter(
          key => Array.isArray(detectedBindings[key]) && detectedBindings[key].length > 0
        );
      } catch (error: any) {
        result.errors.push({
          step: 'parse_wrangler_config',
          error: error.message,
        });
      }
    }

    // Step 2: Create required bindings via Cloudflare API
    const createdBindings: any = {
      kv: [],
      d1: [],
      r2: [],
      vectorize: [],
      durable_objects: [],
    };

    // Create KV namespaces using Cloudflare SDK
    for (const kv of detectedBindings.kv || []) {
      if (!kv.id && !kv.namespace_id) {
        try {
          const namespace = await cf.kv.namespaces.create({
            account_id: accountId,
            title: kv.binding || `kv-${worker_name}`,
          });
          createdBindings.kv.push({
            binding: kv.binding,
            id: namespace.id,
            namespace_id: namespace.id,
          });
          result.bindings_created.push({ type: 'kv', name: kv.binding, id: namespace.id });
        } catch (error: any) {
          result.errors.push({
            step: 'create_kv',
            binding: kv.binding,
            error: error.message,
          });
        }
      } else {
        // Use existing binding
        createdBindings.kv.push({
          binding: kv.binding,
          id: kv.id || kv.namespace_id,
          namespace_id: kv.id || kv.namespace_id,
        });
      }
    }

    // Create D1 databases using Cloudflare SDK
    for (const d1 of detectedBindings.d1 || []) {
      if (!d1.database_id) {
        try {
          const database = await cf.d1.database.create({
            account_id: accountId,
            name: d1.binding || `d1-${worker_name}`,
          });
          createdBindings.d1.push({
            binding: d1.binding,
            database_id: database.uuid,
            database_name: database.name,
          });
          result.bindings_created.push({ type: 'd1', name: d1.binding, id: database.uuid });
        } catch (error: any) {
          result.errors.push({
            step: 'create_d1',
            binding: d1.binding,
            error: error.message,
          });
        }
      } else {
        // Use existing binding
        createdBindings.d1.push({
          binding: d1.binding,
          database_id: d1.database_id,
          database_name: d1.database_name,
        });
      }
    }

    // Create R2 buckets using Cloudflare SDK
    for (const r2 of detectedBindings.r2 || []) {
      if (!r2.bucket_name) {
        try {
          const bucketName = (r2.binding || `r2-${worker_name}`).toLowerCase();
          const bucket = await cf.r2.buckets.create({
            account_id: accountId,
            name: bucketName,
          });
          createdBindings.r2.push({
            binding: r2.binding,
            bucket_name: bucketName,
          });
          result.bindings_created.push({ type: 'r2', name: r2.binding, bucket: bucketName });
        } catch (error: any) {
          result.errors.push({
            step: 'create_r2',
            binding: r2.binding,
            error: error.message,
          });
        }
      } else {
        // Use existing binding
        createdBindings.r2.push({
          binding: r2.binding,
          bucket_name: r2.bucket_name,
        });
      }
    }

    // Create Vectorize indexes using Cloudflare SDK
    for (const vec of detectedBindings.vectorize || []) {
      if (!vec.index_name) {
        try {
          const indexName = vec.binding || `vectorize-${worker_name}`;
          const index = await cf.vectorize.indexes.create({
            account_id: accountId,
            name: indexName,
            config: vec.config || {
              dimensions: 768,
              metric: 'cosine',
            },
          });
          createdBindings.vectorize.push({
            binding: vec.binding,
            index_name: indexName,
            index_id: index.id,
          });
          result.bindings_created.push({ type: 'vectorize', name: vec.binding, id: index.id });
        } catch (error: any) {
          result.errors.push({
            step: 'create_vectorize',
            binding: vec.binding,
            error: error.message,
          });
        }
      } else {
        // Use existing binding
        createdBindings.vectorize.push({
          binding: vec.binding,
          index_name: vec.index_name,
          index_id: vec.index_id,
        });
      }
    }

    if (result.bindings_created.length > 0) {
      result.steps_completed.push('bindings_created');
    }

    // Step 3: Create or get GitHub repository
    let githubRepoInfo: any = null;
    if (create_github_repo && core_github_api_url) {
      try {
        const githubApiResponse = await fetch(`${core_github_api_url}/repos/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: c.req.header('Authorization') || '',
          },
          body: JSON.stringify({
            owner: github_owner,
            name: github_repo,
            description: `Cloudflare Worker: ${worker_name}`,
            private: true,
            auto_init: true,
          }),
        });

        if (githubApiResponse.ok) {
          githubRepoInfo = await githubApiResponse.json();
          result.steps_completed.push('github_repo_created');
        } else {
          // Try to get existing repo
          const getRepoResponse = await fetch(`${core_github_api_url}/repos/${github_owner}/${github_repo}`, {
            headers: {
              Authorization: c.req.header('Authorization') || '',
            },
          });
          if (getRepoResponse.ok) {
            githubRepoInfo = await getRepoResponse.json();
            result.steps_completed.push('github_repo_found');
          }
        }
      } catch (error: any) {
        result.errors.push({
          step: 'github_repo',
          error: error.message,
        });
      }
    }

    // Step 4: Deploy worker using standard Workers Scripts API
    // We'll use the existing deploy utilities which handle the standard API
    try {
      // Check if worker exists
      try {
        await cf.workers.scripts.get(worker_name, { account_id: accountId });
        result.steps_completed.push('worker_found');
      } catch (error: any) {
        // Worker doesn't exist yet - will be created on first deploy
        result.steps_completed.push('worker_will_be_created');
      }
    } catch (error: any) {
      // Continue - worker will be created on deploy
    }

    // Step 5: Handle assets if provided (fast pass-through for simple apps)
    let assetJwt: string | undefined;
    const hasAssets = Object.keys(assets).length > 0 && Object.keys(assets).length <= 3;
    
    if (hasAssets) {
      try {
        // Convert assets to Map format for createAssetManifest
        const assetFiles = new Map<string, ArrayBuffer>();
        for (const [path, content] of Object.entries(assets)) {
          const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
          const encoder = new TextEncoder();
          assetFiles.set(path.startsWith('/') ? path : `/${path}`, encoder.encode(contentStr).buffer as ArrayBuffer);
        }

        // Create manifest
        const manifest = await createAssetManifest(assetFiles);
        result.steps_completed.push('asset_manifest_created');

        // Create upload session
        const uploadSession = await createAssetUploadSession(
          cf,
          accountId,
          worker_name,
          manifest
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
        // Continue without assets
      }
    }

    // Step 6: Build worker bindings from detected and created bindings
    const allBindings = {
      kv: [...(detectedBindings.kv || []), ...createdBindings.kv].map(kv => ({
        binding: kv.binding,
        id: kv.id || kv.namespace_id,
      })),
      d1: [...(detectedBindings.d1 || []), ...createdBindings.d1].map(d1 => ({
        binding: d1.binding,
        database_id: d1.database_id,
      })),
      r2: [...(detectedBindings.r2 || []), ...createdBindings.r2].map(r2 => ({
        binding: r2.binding,
        bucket_name: r2.bucket_name,
      })),
      vectorize: [...(detectedBindings.vectorize || []), ...createdBindings.vectorize].map(vec => ({
        binding: vec.binding,
        index_name: vec.index_name || vec.binding,
      })),
      durable_objects: detectedBindings.durable_objects || [],
      services: detectedBindings.services || [],
      analytics_engine: detectedBindings.analytics_engine || [],
      queues: detectedBindings.queues || [],
    };

    const workerBindings = buildWorkerBindings(allBindings, hasAssets, 'ASSETS');

    // Step 7: Deploy worker using standard Workers Scripts API
    try {
      // Build metadata
      const metadata: WorkerMetadata = {
        main_module: 'index.js',
        compatibility_date: compatibilityDate,
        compatibility_flags: compatibilityFlags,
        bindings: workerBindings,
      };

      if (assetJwt) {
        metadata.assets = {
          jwt: assetJwt,
          config: {
            binding: 'ASSETS',
            not_found_handling: 'single-page-application', // Default for SPA
          },
        };
      }

      // Deploy worker
      await deployWorkerScript(
        cf,
        accountId,
        worker_name,
        worker_content,
        metadata
      );

      result.steps_completed.push('worker_deployed');
    } catch (error: any) {
      result.errors.push({
        step: 'worker_deployment',
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

    // Step 8: Setup GitHub CI/CD connection and triggers
    if (github_owner && github_repo) {
      try {
        // Create repository connection
        const repoConnectionResponse: any = await apiClient.put(
          `/accounts/${accountId}/builds/repos/connections`,
          {
            provider_type: 'github',
            provider_account_id: 'cloudflare',
            provider_account_name: 'Cloudflare',
            repo_id: github_repo,
            repo_name: github_repo,
          }
        );

        const repoConnection = repoConnectionResponse.result;
        result.repo_connection = {
          id: repoConnection.uuid || repoConnection.id,
        };
        result.steps_completed.push('repo_connection_created');

        // Get or create build token
        let buildTokenUuid: string | undefined;
        try {
          const tokensResponse: any = await apiClient.get(
            `/accounts/${accountId}/builds/tokens`
          );
          if (tokensResponse.result && tokensResponse.result.length > 0) {
            buildTokenUuid = tokensResponse.result[0].build_token_uuid;
          } else {
            const newTokenResponse: any = await apiClient.post(
              `/accounts/${accountId}/builds/tokens`,
              {
                build_token_name: `${worker_name}-build-token`,
              }
            );
            buildTokenUuid = newTokenResponse.result.build_token_uuid;
          }
        } catch (tokenError: any) {
          console.warn('Could not get/create build token:', tokenError.message);
        }

        // Create build trigger
        if (buildTokenUuid) {
          const triggerResponse: any = await apiClient.post(
            `/accounts/${accountId}/builds/triggers`,
            {
              repo_connection_uuid: repoConnection.uuid || repoConnection.id,
              external_script_id: worker_name,
              trigger_name: `${worker_name}-production`,
              branch_includes: [production_branch],
              branch_excludes: [],
              build_command: build_command || 'npm run build',
              deploy_command: deploy_command || 'npm run deploy',
              root_directory: '/',
              path_includes: ['*'],
              path_excludes: [],
              build_token_uuid: buildTokenUuid,
            }
          );

          result.trigger = {
            id: triggerResponse.result.trigger_uuid,
            branch: production_branch,
          };
          result.steps_completed.push('cicd_trigger_created');
        }
      } catch (error: any) {
        result.errors.push({
          step: 'cicd_setup',
          error: error.message,
        });
        // Continue - CI/CD is optional
      }
    }

    return c.json(
      {
        success: result.errors.length === 0,
        result,
        message: result.errors.length === 0
          ? `Worker '${worker_name}' deployed with GitHub CI/CD`
          : 'Worker deployed with some errors',
      },
      result.errors.length === 0 ? 201 : 207
    );
  } catch (error: any) {
    console.error('Error in GitHub deployment flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// AI-powered build log analysis and auto-fix
githubDeployFlows.post('/analyze-and-fix-build', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      build_uuid,
      trigger_uuid,
      github_owner,
      github_repo,
      github_branch = 'main',
      core_github_api_url,
      auto_fix = true,
    } = body;

    const result: any = {
      build_uuid,
      analysis: {},
      fixes_applied: [],
      errors: [],
    };

    // Step 1: Get build logs
    let buildLogs: string = '';
    try {
      const logsResponse: any = await apiClient.get(
        `/accounts/${accountId}/builds/builds/${build_uuid}/logs`
      );
      buildLogs = JSON.stringify(logsResponse.result || logsResponse);
      result.steps_completed = ['build_logs_fetched'];
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: 'Failed to fetch build logs',
          details: error.message,
        },
        500
      );
    }

    // Step 2: Analyze logs with AI (using ContextCoachDO or Workers AI)
    let aiAnalysis: any = null;
    try {
      if (c.env.AI) {
        const aiResponse = await c.env.AI.run('@cf/openai/gpt-oss-120b', {
          instructions: `You are a build log analyzer. Analyze the following build logs and identify:
1. The root cause of the build failure
2. Specific error messages
3. Recommended fixes (especially for common issues like outdated package-lock.json, missing dependencies, etc.)
4. Whether the fix can be automated

Return a JSON object with: error_type, root_cause, recommended_fixes (array), can_auto_fix (boolean), fix_commands (array)`,
          input: buildLogs,
        });

        aiAnalysis = typeof aiResponse === 'string' 
          ? JSON.parse(aiResponse) 
          : aiResponse;
        
        result.analysis = aiAnalysis;
        result.steps_completed.push('ai_analysis_complete');
      } else {
        // Fallback: Simple pattern matching
        const commonErrors = [
          { pattern: /package-lock\.json.*outdated/i, fix: 'npm install', type: 'outdated_lockfile' },
          { pattern: /Cannot find module/i, fix: 'npm install', type: 'missing_dependency' },
          { pattern: /EACCES|permission denied/i, fix: 'sudo npm install', type: 'permission_error' },
        ];

        for (const error of commonErrors) {
          if (error.pattern.test(buildLogs)) {
            aiAnalysis = {
              error_type: error.type,
              root_cause: 'Common build error detected',
              recommended_fixes: [error.fix],
              can_auto_fix: true,
              fix_commands: [error.fix],
            };
            result.analysis = aiAnalysis;
            break;
          }
        }
      }
    } catch (error: any) {
      result.errors.push({
        step: 'ai_analysis',
        error: error.message,
      });
    }

    // Step 3: Auto-fix if possible
    if (auto_fix && aiAnalysis?.can_auto_fix && core_github_api_url && github_owner && github_repo) {
      try {
        // Clone repo, apply fixes, push back
        const fixResponse = await fetch(`${core_github_api_url}/repos/${github_owner}/${github_repo}/fix-build`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: c.req.header('Authorization') || '',
          },
          body: JSON.stringify({
            branch: github_branch,
            fixes: aiAnalysis.fix_commands || [],
            error_type: aiAnalysis.error_type,
          }),
        });

        if (fixResponse.ok) {
          const fixResult = await fixResponse.json();
          result.fixes_applied = fixResult.fixes || [];
          result.steps_completed.push('auto_fix_applied');

          // Step 4: Trigger new build
          if (trigger_uuid) {
            const newBuildResponse: any = await apiClient.post(
              `/accounts/${accountId}/builds/triggers/${trigger_uuid}/builds`,
              { branch: github_branch }
            );
            result.new_build = {
              build_uuid: newBuildResponse.result?.build_uuid || newBuildResponse.result?.id,
              status: 'triggered',
            };
            result.steps_completed.push('new_build_triggered');
          }
        }
      } catch (error: any) {
        result.errors.push({
          step: 'auto_fix',
          error: error.message,
        });
      }
    }

    return c.json({
      success: result.errors.length === 0,
      result,
      message: aiAnalysis?.can_auto_fix
        ? 'Build analyzed and fixes applied'
        : 'Build analyzed - manual intervention may be required',
    });
  } catch (error: any) {
    console.error('Error in build analysis flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Fast pass-through for simple deployments (SPA, API proxy, etc.)
githubDeployFlows.post('/fast-deploy', async (c) => {
  try {
    const cf = c.get('cf');
    const accountId = c.get('accountId');
    const body = await c.req.json();

    const {
      worker_name,
      worker_content,
      assets = {}, // Max 2-3 assets for fast pass
      github_owner,
      github_repo,
      skip_github = false, // Allow skipping GitHub for ultra-fast deploys
    } = body;

    if (Object.keys(assets).length > 3) {
      return c.json(
        {
          success: false,
          error: 'Fast deploy supports maximum 3 assets. Use /deploy-with-github for more.',
        },
        400
      );
    }

    // Use the main deploy flow but with simplified options
    const deployBody = {
      worker_name,
      worker_content,
      assets,
      github_owner: skip_github ? undefined : github_owner,
      github_repo: skip_github ? undefined : github_repo,
      create_github_repo: !skip_github,
      production_branch: 'main',
      build_command: 'npm run build',
      deploy_command: 'npm run deploy',
      auto_fix_builds: false, // Skip AI analysis for speed
    };

    // Forward to main deploy endpoint
    const deployResponse = await fetch(`${c.req.url.replace('/fast-deploy', '/deploy-with-github')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: c.req.header('Authorization') || '',
      },
      body: JSON.stringify(deployBody),
    });

    const deployResult = await deployResponse.json();

    return c.json({
      ...deployResult,
      fast_deploy: true,
      message: `Fast deployment completed for ${worker_name}`,
    }, deployResponse.status);
  } catch (error: any) {
    console.error('Error in fast deploy flow:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default githubDeployFlows;
