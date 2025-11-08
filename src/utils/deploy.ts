/**
 * Worker Deployment Utilities
 *
 * Helper functions for deploying Cloudflare Workers with assets, bindings, and migrations.
 * Based on the cloudflare-worker-deployment library patterns.
 */

import Cloudflare from 'cloudflare';

export interface AssetManifest {
  [path: string]: {
    hash: string;
    size: number;
  };
}

export interface WorkerBinding {
  name: string;
  type: string;
  class_name?: string;
  namespace_id?: string;
  database_id?: string;
  bucket_name?: string;
  service?: string;
}

export interface WorkerMetadata {
  main_module: string;
  compatibility_date: string;
  compatibility_flags?: string[];
  assets?: {
    jwt: string;
    config?: {
      not_found_handling?: 'single-page-application' | '404-page' | 'none';
      run_worker_first?: string[];
      binding?: string;
    };
  };
  bindings?: WorkerBinding[];
  vars?: Record<string, string>;
  migrations?: DurableObjectMigration;
  exported_handlers?: string[];
}

export interface DurableObjectMigration {
  tag: string;
  new_classes?: string[];
  new_sqlite_classes?: string[];
  renamed_classes?: Array<{ from: string; to: string }>;
  deleted_classes?: string[];
}

/**
 * Calculate SHA256 hash of content (first 32 chars)
 */
export async function calculateFileHash(content: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', content);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32);
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    ico: 'image/x-icon',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    pdf: 'application/pdf',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Build worker bindings from configuration
 */
export function buildWorkerBindings(
  bindings: {
    kv?: Array<{ binding: string; id: string }>;
    d1?: Array<{ binding: string; database_id: string }>;
    r2?: Array<{ binding: string; bucket_name: string }>;
    durable_objects?: Array<{ name: string; class_name: string }>;
    services?: Array<{ binding: string; service: string }>;
  },
  hasAssets: boolean = false,
  assetBinding: string = 'ASSETS',
): WorkerBinding[] {
  const workerBindings: WorkerBinding[] = [];

  if (hasAssets) {
    workerBindings.push({
      name: assetBinding,
      type: 'assets',
    });
  }

  if (bindings.durable_objects) {
    for (const binding of bindings.durable_objects) {
      workerBindings.push({
        name: binding.name,
        type: 'durable_object_namespace',
        class_name: binding.class_name,
      });
    }
  }

  if (bindings.kv) {
    for (const kv of bindings.kv) {
      workerBindings.push({
        name: kv.binding,
        type: 'kv_namespace',
        namespace_id: kv.id,
      });
    }
  }

  if (bindings.d1) {
    for (const d1 of bindings.d1) {
      workerBindings.push({
        name: d1.binding,
        type: 'd1',
        database_id: d1.database_id,
      });
    }
  }

  if (bindings.r2) {
    for (const r2 of bindings.r2) {
      workerBindings.push({
        name: r2.binding,
        type: 'r2_bucket',
        bucket_name: r2.bucket_name,
      });
    }
  }

  if (bindings.services) {
    for (const service of bindings.services) {
      workerBindings.push({
        name: service.binding,
        type: 'service',
        service: service.service,
      });
    }
  }

  return workerBindings;
}

/**
 * Merge migration configurations
 */
export function mergeMigrations(migrations: any[] | undefined): DurableObjectMigration | null {
  if (!migrations || migrations.length === 0) {
    return null;
  }

  const mergedMigration: DurableObjectMigration = {
    tag: migrations[migrations.length - 1].tag,
    new_classes: [],
    new_sqlite_classes: [],
  };

  for (const migration of migrations) {
    if (migration.new_classes) {
      mergedMigration.new_classes!.push(...migration.new_classes);
    }
    if (migration.new_sqlite_classes) {
      mergedMigration.new_sqlite_classes!.push(...migration.new_sqlite_classes);
    }
  }

  if (mergedMigration.new_classes!.length === 0) delete mergedMigration.new_classes;
  if (mergedMigration.new_sqlite_classes!.length === 0) delete mergedMigration.new_sqlite_classes;

  if (!mergedMigration.new_classes && !mergedMigration.new_sqlite_classes) {
    return null;
  }

  return mergedMigration;
}

/**
 * Deploy worker script using multipart form data
 */
export async function deployWorkerScript(
  cf: Cloudflare,
  accountId: string,
  scriptName: string,
  workerContent: string,
  metadata: WorkerMetadata,
  dispatchNamespace?: string,
): Promise<any> {
  const url = dispatchNamespace
    ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}`
    : `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;

  const formData = new FormData();

  // Add metadata
  formData.append('metadata', JSON.stringify(metadata));

  // Add worker script
  const workerBlob = new Blob([workerContent], {
    type: 'application/javascript+module',
  });
  formData.append('index.js', workerBlob, 'index.js');

  // Make the API call directly
  const token = (cf as any).apiToken;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to deploy worker: ${response.status} - ${error}`);
  }

  return await response.json();
}

/**
 * Create asset upload session
 */
export async function createAssetUploadSession(
  cf: Cloudflare,
  accountId: string,
  scriptName: string,
  manifest: AssetManifest,
  dispatchNamespace?: string,
): Promise<{ jwt: string; buckets: string[][] }> {
  const url = dispatchNamespace
    ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}/assets-upload-session`
    : `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`;

  const token = (cf as any).apiToken;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ manifest }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create asset upload session: ${response.status} - ${error}`);
  }

  const data: any = await response.json();
  return data.result;
}

/**
 * Upload asset batch
 */
export async function uploadAssetBatch(
  cf: Cloudflare,
  accountId: string,
  uploadToken: string,
  fileHashes: string[],
  fileContents: Map<string, ArrayBuffer>,
): Promise<string | null> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/assets/upload?base64=true`;

  const formData = new FormData();

  for (const hash of fileHashes) {
    const content = fileContents.get(hash);
    if (!content) {
      throw new Error(`Content not found for hash: ${hash}`);
    }

    const base64Content = btoa(String.fromCharCode(...new Uint8Array(content)));
    const blob = new Blob([base64Content], { type: 'application/octet-stream' });
    formData.append(hash, blob, hash);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${uploadToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload assets: ${response.status} - ${error}`);
  }

  // Status 201 indicates all files uploaded, returns completion token
  if (response.status === 201) {
    const data: any = await response.json();
    return data.result?.jwt || null;
  }

  return null;
}

/**
 * Create asset manifest from files
 */
export async function createAssetManifest(
  files: Map<string, ArrayBuffer>,
): Promise<AssetManifest> {
  const manifest: AssetManifest = {};

  for (const [path, content] of files.entries()) {
    const hash = await calculateFileHash(content);
    manifest[path] = {
      hash,
      size: content.byteLength,
    };
  }

  return manifest;
}
