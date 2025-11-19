import { WorkerEntrypoint } from 'cloudflare:workers';
import { Env, Variables } from './types';
import { CloudflareApiClient } from './routes/api/apiClient';
import Cloudflare from 'cloudflare';

/**
 * RPC Entrypoint for Service Bindings
 * Allows other Workers to call methods on this Worker via service bindings
 * 
 * Usage in another Worker's wrangler.jsonc:
 * {
 *   "services": [{
 *     "binding": "CLOUDFLARE_API",
 *     "service": "core-cloudflare-manager-api",
 *     "entrypoint": "CloudflareManagerRPC"
 *   }]
 * }
 * 
 * Then call: await env.CLOUDFLARE_API.listWorkers();
 */
export class CloudflareManagerRPC extends WorkerEntrypoint<Env> {
  private getApiClient(): CloudflareApiClient {
    return new CloudflareApiClient({ apiToken: this.env.CLOUDFLARE_TOKEN });
  }

  private getCloudflareSDK(): Cloudflare {
    return new Cloudflare({ apiToken: this.env.CLOUDFLARE_TOKEN });
  }

  /**
   * List all Workers
   */
  async listWorkers(): Promise<any> {
    const apiClient = this.getApiClient();
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    return await apiClient.get(`/accounts/${accountId}/workers/scripts`);
  }

  /**
   * Get a specific Worker
   */
  async getWorker(scriptName: string): Promise<any> {
    const apiClient = this.getApiClient();
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    return await apiClient.get(`/accounts/${accountId}/workers/scripts/${scriptName}`);
  }

  /**
   * List KV namespaces
   */
  async listKVNamespaces(): Promise<any> {
    const apiClient = this.getApiClient();
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    return await apiClient.get(`/accounts/${accountId}/storage/kv/namespaces`);
  }

  /**
   * List D1 databases
   */
  async listD1Databases(): Promise<any> {
    const apiClient = this.getApiClient();
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    return await apiClient.get(`/accounts/${accountId}/d1/databases`);
  }

  /**
   * List R2 buckets
   */
  async listR2Buckets(): Promise<any> {
    const apiClient = this.getApiClient();
    const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    return await apiClient.get(`/accounts/${accountId}/r2/buckets`);
  }

  /**
   * Verify token
   */
  async verifyToken(): Promise<any> {
    const apiClient = this.getApiClient();
    return await apiClient.get('/user/tokens/verify');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; version: string; timestamp: string }> {
    return {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Start a consultation
   */
  async startConsultation(prompt: string, session_id?: string): Promise<any> {
    const { startConsultation } = await import('./services/consultation-agent');
    const { generateUUID } = await import('./types');
    const requestId = session_id || generateUUID();
    return await startConsultation(this.env, { session_id: requestId, prompt });
  }

  /**
   * Get consultation status and results
   */
  async getConsultation(session_id: string): Promise<any> {
    const { getConsultation } = await import('./services/consultation-agent');
    return await getConsultation(this.env, session_id);
  }

  /**
   * Create a new Worker
   */
  async createWorker(request: any): Promise<any> {
    const { createWorker } = await import('./services/create-worker-service');
    return await createWorker(this.env, request);
  }

  /**
   * Validate a Worker creation request
   */
  async validateWorkerRequest(request: any): Promise<any> {
    const { validateWorkerRequest } = await import('./services/create-worker-service');
    return await validateWorkerRequest(request);
  }
}

