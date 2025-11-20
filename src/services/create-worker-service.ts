import type { Env } from '../types';
import { CloudflareApiClient, CloudflareApiResponse } from '../routes/api/apiClient';

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
    const response = await apiClient.post<CloudflareApiResponse<{ id: string }>>(
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
    const response = await apiClient.post<CloudflareApiResponse<{ uuid: string }>>(
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
    const response = await apiClient.post<CloudflareApiResponse<any>>(
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
    const response = await apiClient.post<CloudflareApiResponse<{ queue_id: string }>>(
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
  hasStaticFiles: boolean,
  mainFile?: string
): string {
  const config: any = {
    name: projectName,
    main: mainFile || 'src/index.js',
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
 * Generate help HTML page for the worker
 */
function generateHelpPage(
  projectName: string,
  type: WorkerType,
  createdBindings: CreatedBinding[],
  workerUrl: string
): string {
  const kvBindings = createdBindings.filter((b) => b.type === 'kv');
  const d1Bindings = createdBindings.filter((b) => b.type === 'd1');
  const r2Bindings = createdBindings.filter((b) => b.type === 'r2');
  const queueBindings = createdBindings.filter((b) => b.type === 'queue');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} - Worker Documentation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 3rem 2rem;
      text-align: center;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      opacity: 0.9;
      font-size: 1.1rem;
    }
    .content {
      padding: 2rem;
    }
    .section {
      margin-bottom: 2rem;
    }
    h2 {
      color: #667eea;
      border-bottom: 2px solid #667eea;
      padding-bottom: 0.5rem;
      margin-bottom: 1rem;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .info-card {
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    .info-card h3 {
      color: #667eea;
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }
    .info-card p {
      color: #666;
      font-size: 0.9rem;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #667eea;
      color: white;
      border-radius: 20px;
      font-size: 0.85rem;
      margin: 0.25rem;
    }
    .binding-list {
      list-style: none;
      margin-top: 1rem;
    }
    .binding-item {
      background: #f8f9fa;
      padding: 1rem;
      margin-bottom: 0.5rem;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .binding-name {
      font-weight: 600;
      color: #333;
    }
    .binding-type {
      background: #e9ecef;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #666;
    }
    code {
      background: #f8f9fa;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
    }
    .url {
      background: #e7f3ff;
      padding: 1rem;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      word-break: break-all;
      margin-top: 1rem;
    }
    .feature-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .feature-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .feature-icon {
      width: 24px;
      height: 24px;
      background: #667eea;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }
    footer {
      background: #f8f9fa;
      padding: 2rem;
      text-align: center;
      color: #666;
      border-top: 1px solid #e9ecef;
    }
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #999;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>⚡ ${projectName}</h1>
      <p class="subtitle">Cloudflare ${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Documentation</p>
    </header>

    <div class="content">
      <div class="section">
        <h2>📡 Worker URL</h2>
        <div class="url">
          <a href="https://${workerUrl}" target="_blank" style="color: #667eea; text-decoration: none;">
            https://${workerUrl}
          </a>
        </div>
      </div>

      <div class="section">
        <h2>🔧 Configuration</h2>
        <div class="info-grid">
          <div class="info-card">
            <h3>Worker Type</h3>
            <p>${type.replace(/_/g, ' ').toUpperCase()}</p>
          </div>
          <div class="info-card">
            <h3>Workers.dev Enabled</h3>
            <p>✓ Yes</p>
          </div>
          <div class="info-card">
            <h3>Observability</h3>
            <p>✓ Enabled</p>
          </div>
          <div class="info-card">
            <h3>Compatibility Date</h3>
            <p>${new Date().toISOString().split('T')[0]}</p>
          </div>
        </div>
      </div>

      ${createdBindings.length > 0 ? `
      <div class="section">
        <h2>🔗 Bindings</h2>
        ${kvBindings.length > 0 ? `
          <h3 style="margin-top: 1.5rem; color: #666;">KV Namespaces</h3>
          <ul class="binding-list">
            ${kvBindings.map(b => `
              <li class="binding-item">
                <span class="binding-name">${b.name.toUpperCase().replace(/-/g, '_')}</span>
                <span class="binding-type">KV</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${d1Bindings.length > 0 ? `
          <h3 style="margin-top: 1.5rem; color: #666;">D1 Databases</h3>
          <ul class="binding-list">
            ${d1Bindings.map(b => `
              <li class="binding-item">
                <span class="binding-name">${b.name.toUpperCase().replace(/-/g, '_')}</span>
                <span class="binding-type">D1</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${r2Bindings.length > 0 ? `
          <h3 style="margin-top: 1.5rem; color: #666;">R2 Buckets</h3>
          <ul class="binding-list">
            ${r2Bindings.map(b => `
              <li class="binding-item">
                <span class="binding-name">${b.name.toUpperCase().replace(/-/g, '_')}</span>
                <span class="binding-type">R2</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${queueBindings.length > 0 ? `
          <h3 style="margin-top: 1.5rem; color: #666;">Queues</h3>
          <ul class="binding-list">
            ${queueBindings.map(b => `
              <li class="binding-item">
                <span class="binding-name">${b.name.toUpperCase().replace(/-/g, '_')}</span>
                <span class="binding-type">Queue</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
      </div>
      ` : ''}

      <div class="section">
        <h2>✨ Features</h2>
        <div class="feature-list">
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <span>Global Edge Network</span>
          </div>
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <span>Zero Cold Starts</span>
          </div>
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <span>Automatic Scaling</span>
          </div>
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <span>Built-in Security</span>
          </div>
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <span>Real-time Logs</span>
          </div>
          <div class="feature-item">
            <div class="feature-icon">✓</div>
            <span>Analytics Included</span>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>📚 Resources</h2>
        <ul style="list-style: none; margin-top: 1rem;">
          <li style="margin-bottom: 0.5rem;">
            📖 <a href="https://developers.cloudflare.com/workers/" target="_blank" style="color: #667eea;">Cloudflare Workers Documentation</a>
          </li>
          <li style="margin-bottom: 0.5rem;">
            🔧 <a href="https://developers.cloudflare.com/workers/wrangler/" target="_blank" style="color: #667eea;">Wrangler CLI</a>
          </li>
          <li style="margin-bottom: 0.5rem;">
            💬 <a href="https://discord.gg/cloudflaredev" target="_blank" style="color: #667eea;">Cloudflare Developers Discord</a>
          </li>
        </ul>
      </div>
    </div>

    <footer>
      <p>Created with ❤️ using Cloudflare Workers</p>
      <p style="margin-top: 0.5rem; font-size: 0.9rem;">
        Generated on ${new Date().toISOString().split('T')[0]}
      </p>
    </footer>
  </div>
</body>
</html>`;
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

    // Validate required environment variables
    if (!env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is required but not set');
    }
    if (!env.CLOUDFLARE_TOKEN) {
      throw new Error('CLOUDFLARE_TOKEN environment variable is required but not set');
    }

    // Get account info
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_TOKEN;

    if (!accountId || !apiToken) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_TOKEN environment variables must be set.');
    }

    const apiClient = new CloudflareApiClient({ apiToken });

    // Create bindings
    const createdBindings = await createBindings(apiClient, accountId, request.bindings);

    // Generate worker URL (before deployment)
    // Use custom domain from env or default to hacolby.workers.dev
    const WORKERS_DEV_DOMAIN = 'hacolby.workers.dev';
    const workersDomain = env.WORKERS_DEV_DOMAIN || WORKERS_DEV_DOMAIN;

    // Generate help page HTML
    const helpPageHtml = generateHelpPage(
      request.project_name,
      request.type,
      createdBindings,
      workerUrl
    );

    // Determine if we need to add static files
    const hasExistingStaticFiles = request.static_files && request.static_files.paths.length > 0;
    const needsStaticFiles = request.type === 'worker_with_static' ||
                             request.type === 'pages' ||
                             request.type === 'worker_with_pages' ||
                             hasExistingStaticFiles;

    // Prepare static files with auto-generated help page
    let finalStaticFiles: StaticFiles | undefined = request.static_files;

    if (needsStaticFiles || hasExistingStaticFiles) {
      // Initialize static files if not present
      if (!finalStaticFiles) {
        finalStaticFiles = { paths: [], content_base64: [] };
      }

      // Determine help page path: /help.html if other files exist, /index.html if not
      const helpPagePath = hasExistingStaticFiles ? 'public/help.html' : 'public/index.html';

      // Add help page to static files
      finalStaticFiles = {
        paths: [...finalStaticFiles.paths, helpPagePath],
        content_base64: [...finalStaticFiles.content_base64, Buffer.from(helpPageHtml).toString('base64')],
      };
    }

    // Generate wrangler config
    const wranglerConfig = generateWranglerConfig(
      request.project_name,
      request.type,
      createdBindings,
      !!finalStaticFiles,
      request.javascript_files.paths[0] // Use first JS file as main
    );

    // Deploy the worker
    await deployWorker(
      apiClient,
      accountId,
      request.project_name,
      request.javascript_files,
      finalStaticFiles
    );

    return {
      success: true,
      worker_url: workerUrl,
      wrangler_config: wranglerConfig,
      details: {
        created_bindings: createdBindings,
        help_page: hasExistingStaticFiles ? `https://${workerUrl}/help.html` : `https://${workerUrl}/`,
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
