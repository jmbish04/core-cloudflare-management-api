import type { Env } from '../types';
import { CloudflareApiClient } from '../routes/api/apiClient';

/**
 * Worker Creation Service
 * Handles safe, validated Worker and Pages app creation with automatic binding setup
 */

export type WorkerType = 'worker' | 'worker_with_static' | 'pages' | 'worker_with_pages';

export interface StaticFiles {
  paths: string[];
  content_base64: string[];
}

export interface JavaScriptFiles {
  paths: string[];
  content_base64: string[];
}

export interface WorkerBindings {
  kv?: string[];
  d1?: string[];
  r2?: string[];
  queues?: string[];
  workflows?: string[];
}

export interface CreateWorkerRequest {
  project_name: string;
  type: WorkerType;
  static_files?: StaticFiles;
  javascript_files: JavaScriptFiles;
  bindings?: WorkerBindings;
}

export interface CreateWorkerResponse {
  success: boolean;
  worker_url?: string;
  wrangler_config?: string;
  error?: string;
  details?: any;
}

export interface CreatedBinding {
  type: 'kv' | 'd1' | 'r2' | 'queue' | 'workflow';
  name: string;
  id: string;
}

/**
 * Validate project name
 */
function validateProjectName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error('project_name is required and must be a string');
  }

  // Must be a valid Worker slug: [a-z0-9-_]+
  if (!/^[a-z0-9-_]+$/i.test(name)) {
    throw new Error('project_name must contain only alphanumeric characters, hyphens, and underscores');
  }

  if (name.length > 63) {
    throw new Error('project_name must be 63 characters or less');
  }
}

/**
 * Validate worker type
 */
function validateWorkerType(type: string): void {
  const validTypes: WorkerType[] = ['worker', 'worker_with_static', 'pages', 'worker_with_pages'];

  if (!validTypes.includes(type as WorkerType)) {
    throw new Error(`Type must be one of: ${validTypes.join(', ')}`);
  }
}

/**
 * Validate JavaScript files for inline HTML
 */
function validateJavaScriptFiles(files: JavaScriptFiles): void {
  if (!files || !files.paths || !files.content_base64) {
    throw new Error('javascript_files is required with paths and content_base64 arrays');
  }

  if (files.paths.length === 0) {
    throw new Error('At least one JavaScript file is required');
  }

  if (files.paths.length !== files.content_base64.length) {
    throw new Error('javascript_files.paths and content_base64 must have the same length');
  }

  // Validate each file for inline HTML
  for (let i = 0; i < files.content_base64.length; i++) {
    const content = Buffer.from(files.content_base64[i], 'base64').toString('utf-8');

    // Check for HTML tags
    if (/<html[\s\S]*<\/html>/i.test(content)) {
      throw new Error(`Inline HTML detected in JavaScript file "${files.paths[i]}". Please move all HTML to static files.`);
    }

    // Also check for other common HTML patterns
    if (/<body[\s\S]*<\/body>/i.test(content) || /<head[\s\S]*<\/head>/i.test(content)) {
      throw new Error(`Inline HTML detected in JavaScript file "${files.paths[i]}". Please move all HTML to static files.`);
    }
  }
}

/**
 * Validate static files
 */
function validateStaticFiles(files?: StaticFiles): void {
  if (!files) return;

  if (!files.paths || !files.content_base64) {
    throw new Error('static_files must have paths and content_base64 arrays');
  }

  if (files.paths.length !== files.content_base64.length) {
    throw new Error('static_files.paths and content_base64 must have the same length');
  }
}

/**
 * Create KV namespace
 */
async function createKVNamespace(
  apiClient: CloudflareApiClient,
  accountId: string,
  name: string
): Promise<CreatedBinding> {
  try {
    const response = await apiClient.post(
      `/accounts/${accountId}/storage/kv/namespaces`,
      { title: name }
    );

    return {
      type: 'kv',
      name,
      id: response.result.id,
    };
  } catch (error: any) {
    throw new Error(`Failed to create KV namespace "${name}": ${error.message}`);
  }
}

/**
 * Create D1 database
 */
async function createD1Database(
  apiClient: CloudflareApiClient,
  accountId: string,
  name: string
): Promise<CreatedBinding> {
  try {
    const response = await apiClient.post(
      `/accounts/${accountId}/d1/database`,
      { name }
    );

    return {
      type: 'd1',
      name,
      id: response.result.uuid,
    };
  } catch (error: any) {
    throw new Error(`Failed to create D1 database "${name}": ${error.message}`);
  }
}

/**
 * Create R2 bucket
 */
async function createR2Bucket(
  apiClient: CloudflareApiClient,
  accountId: string,
  name: string
): Promise<CreatedBinding> {
  try {
    const response = await apiClient.post(
      `/accounts/${accountId}/r2/buckets`,
      { name }
    );

    return {
      type: 'r2',
      name,
      id: name, // R2 uses name as identifier
    };
  } catch (error: any) {
    throw new Error(`Failed to create R2 bucket "${name}": ${error.message}`);
  }
}

/**
 * Create Queue
 */
async function createQueue(
  apiClient: CloudflareApiClient,
  accountId: string,
  name: string
): Promise<CreatedBinding> {
  try {
    const response = await apiClient.post(
      `/accounts/${accountId}/queues`,
      { queue_name: name }
    );

    return {
      type: 'queue',
      name,
      id: response.result.queue_id,
    };
  } catch (error: any) {
    throw new Error(`Failed to create Queue "${name}": ${error.message}`);
  }
}

/**
 * Create all requested bindings
 */
async function createBindings(
  apiClient: CloudflareApiClient,
  accountId: string,
  bindings?: WorkerBindings
): Promise<CreatedBinding[]> {
  if (!bindings) return [];

  const created: CreatedBinding[] = [];

  // Create KV namespaces
  if (bindings.kv) {
    for (const name of bindings.kv) {
      const binding = await createKVNamespace(apiClient, accountId, name);
      created.push(binding);
    }
  }

  // Create D1 databases
  if (bindings.d1) {
    for (const name of bindings.d1) {
      const binding = await createD1Database(apiClient, accountId, name);
      created.push(binding);
    }
  }

  // Create R2 buckets
  if (bindings.r2) {
    for (const name of bindings.r2) {
      const binding = await createR2Bucket(apiClient, accountId, name);
      created.push(binding);
    }
  }

  // Create Queues
  if (bindings.queues) {
    for (const name of bindings.queues) {
      const binding = await createQueue(apiClient, accountId, name);
      created.push(binding);
    }
  }

  // Note: Workflows are typically defined in wrangler.jsonc and don't require pre-creation

  return created;
}

/**
 * Generate wrangler.jsonc configuration
 */
function generateWranglerConfig(
  projectName: string,
  type: WorkerType,
  createdBindings: CreatedBinding[],
  hasStaticFiles: boolean
): string {
  const config: any = {
    name: projectName,
    main: 'src/index.js',
    compatibility_date: new Date().toISOString().split('T')[0],
    workers_dev: true,
    observability: {
      enabled: true,
    },
  };

  // Add assets binding if static files present
  if (hasStaticFiles || type === 'worker_with_static' || type === 'worker_with_pages') {
    config.assets = {
      directory: './public',
      binding: 'ASSETS',
    };
  }

  // Add KV namespaces
  const kvBindings = createdBindings.filter((b) => b.type === 'kv');
  if (kvBindings.length > 0) {
    config.kv_namespaces = kvBindings.map((b) => ({
      binding: b.name.toUpperCase().replace(/-/g, '_'),
      id: b.id,
    }));
  }

  // Add D1 databases
  const d1Bindings = createdBindings.filter((b) => b.type === 'd1');
  if (d1Bindings.length > 0) {
    config.d1_databases = d1Bindings.map((b) => ({
      binding: b.name.toUpperCase().replace(/-/g, '_'),
      database_name: b.name,
      database_id: b.id,
    }));
  }

  // Add R2 buckets
  const r2Bindings = createdBindings.filter((b) => b.type === 'r2');
  if (r2Bindings.length > 0) {
    config.r2_buckets = r2Bindings.map((b) => ({
      binding: b.name.toUpperCase().replace(/-/g, '_'),
      bucket_name: b.name,
    }));
  }

  // Add Queues
  const queueBindings = createdBindings.filter((b) => b.type === 'queue');
  if (queueBindings.length > 0) {
    config.queues = {
      producers: queueBindings.map((b) => ({
        binding: b.name.toUpperCase().replace(/-/g, '_'),
        queue: b.name,
      })),
    };
  }

  return JSON.stringify(config, null, 2);
}

/**
 * Deploy worker using Cloudflare API
 */
async function deployWorker(
  apiClient: CloudflareApiClient,
  accountId: string,
  projectName: string,
  jsFiles: JavaScriptFiles,
  staticFiles?: StaticFiles
): Promise<string> {
  try {
    // Create form data for multipart upload
    const formData = new FormData();

    // Add main script
    const mainScript = Buffer.from(jsFiles.content_base64[0], 'base64').toString('utf-8');
    formData.append('main', new Blob([mainScript], { type: 'application/javascript' }), jsFiles.paths[0]);

    // Add additional JS files as modules
    for (let i = 1; i < jsFiles.paths.length; i++) {
      const content = Buffer.from(jsFiles.content_base64[i], 'base64').toString('utf-8');
      formData.append('modules', new Blob([content], { type: 'application/javascript' }), jsFiles.paths[i]);
    }

    // Add static files if present
    if (staticFiles && staticFiles.paths.length > 0) {
      for (let i = 0; i < staticFiles.paths.length; i++) {
        const content = Buffer.from(staticFiles.content_base64[i], 'base64').toString('utf-8');
        formData.append('assets', new Blob([content]), staticFiles.paths[i]);
      }
    }

    // Deploy the worker
    await apiClient.post(
      `/accounts/${accountId}/workers/scripts/${projectName}`,
      formData
    );

    // Return the worker URL
    return `${projectName}.hacolby.workers.dev`;
  } catch (error: any) {
    throw new Error(`Failed to deploy worker: ${error.message}`);
  }
}

/**
 * Main worker creation function
 */
export async function createWorker(
  env: Env,
  request: CreateWorkerRequest
): Promise<CreateWorkerResponse> {
  try {
    // Validate payload
    validateProjectName(request.project_name);
    validateWorkerType(request.type);
    validateJavaScriptFiles(request.javascript_files);
    validateStaticFiles(request.static_files);

    // Get account info
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiClient = new CloudflareApiClient({ apiToken: env.CLOUDFLARE_TOKEN });

    // Create bindings
    const createdBindings = await createBindings(apiClient, accountId, request.bindings);

    // Generate wrangler config
    const wranglerConfig = generateWranglerConfig(
      request.project_name,
      request.type,
      createdBindings,
      !!request.static_files
    );

    // Deploy the worker
    const workerUrl = await deployWorker(
      apiClient,
      accountId,
      request.project_name,
      request.javascript_files,
      request.static_files
    );

    return {
      success: true,
      worker_url: workerUrl,
      wrangler_config: wranglerConfig,
      details: {
        created_bindings: createdBindings,
      },
    };
  } catch (error: any) {
    console.error('Worker creation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create worker',
      details: error.stack,
    };
  }
}

/**
 * Validate worker creation request without creating anything
 */
export async function validateWorkerRequest(
  request: CreateWorkerRequest
): Promise<{ valid: boolean; errors?: string[] }> {
  const errors: string[] = [];

  try {
    validateProjectName(request.project_name);
  } catch (error: any) {
    errors.push(error.message);
  }

  try {
    validateWorkerType(request.type);
  } catch (error: any) {
    errors.push(error.message);
  }

  try {
    validateJavaScriptFiles(request.javascript_files);
  } catch (error: any) {
    errors.push(error.message);
  }

  try {
    validateStaticFiles(request.static_files);
  } catch (error: any) {
    errors.push(error.message);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
