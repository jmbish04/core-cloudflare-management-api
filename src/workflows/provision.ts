/**
 * Provisioning Workflow
 * 
 * Infrastructure "Easy Button" that prepares a project for Dashboard CI/CD.
 * Creates Workers, D1 databases, KV namespaces, R2 buckets, and generates
 * wrangler configuration snippets ready for copy-paste.
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types';
import Cloudflare from 'cloudflare';

export interface ProvisioningInput {
  projectName: string;
  requestedBindings?: {
    kv?: string[];
    d1?: string[];
    r2?: string[];
    queues?: string[];
  };
}

export interface ResourceCreationResult {
  success: boolean;
  id?: string;
  name?: string;
  error?: string;
}

export interface KVNamespaceResult {
  binding: string;
  id: string;
  name: string;
}

export interface D1DatabaseResult {
  binding: string;
  id: string;
  name: string;
}

export interface R2BucketResult {
  binding: string;
  name: string;
}

export interface QueueResult {
  binding: string;
  name: string;
}

export interface ProvisioningOutput {
  success: boolean;
  projectName: string;
  workerCreated: boolean;
  resourcesCreated: {
    kv: KVNamespaceResult[];
    d1: D1DatabaseResult[];
    r2: R2BucketResult[];
    queues: QueueResult[];
  };
  wranglerConfig: string;
  errors?: string[];
}

export class ProvisioningWorkflow extends WorkflowEntrypoint<Env, ProvisioningInput> {
  async run(event: WorkflowEvent<ProvisioningInput>, step: WorkflowStep): Promise<ProvisioningOutput> {
    const { projectName, requestedBindings = {} } = event.payload;
    
    const result: ProvisioningOutput = {
      success: false,
      projectName,
      workerCreated: false,
      resourcesCreated: {
        kv: [],
        d1: [],
        r2: [],
        queues: [],
      },
      wranglerConfig: '',
      errors: [],
    };

    // Step 1: Create Worker placeholder
    const workerResult = await step.do('create-worker', async () => {
      try {
        const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_TOKEN });
        const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
        
        // Create a minimal worker script
        const workerContent = `
export default {
  async fetch(request, env, ctx) {
    return new Response('Worker "${projectName}" is ready for deployment!', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
`;

        // Deploy the placeholder worker
        // Note: Bindings are left empty intentionally - they will be configured
        // via Dashboard CI/CD using the generated wrangler.jsonc
        await cf.workers.scripts.update(projectName, {
          account_id: accountId,
          body: workerContent,
          metadata: {
            main_module: 'index.js',
            compatibility_date: '2024-06-01',
            bindings: [],
          },
        } as any);

        return { success: true };
      } catch (error: any) {
        console.error('Failed to create worker:', error);
        return { success: false, error: error.message };
      }
    });

    if (workerResult.success) {
      result.workerCreated = true;
    } else {
      result.errors!.push(`Worker creation failed: ${workerResult.error}`);
    }

    // Step 2: Create KV Namespaces
    if (requestedBindings.kv && requestedBindings.kv.length > 0) {
      for (const bindingName of requestedBindings.kv) {
        const kvResult = await step.do(`create-kv-${bindingName}`, async (): Promise<ResourceCreationResult> => {
          try {
            const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_TOKEN });
            const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
            
            const namespace = await cf.kv.namespaces.create({
              account_id: accountId,
              title: `${projectName}-${bindingName}`,
            });

            // Type assertion with explanation: SDK response structure varies
            const namespaceData = namespace as { id: string };
            return {
              success: true,
              id: namespaceData.id,
              name: `${projectName}-${bindingName}`,
            };
          } catch (error: any) {
            console.error(`Failed to create KV namespace ${bindingName}:`, error);
            return { success: false, error: error.message };
          }
        });

        if (kvResult.success) {
          result.resourcesCreated.kv.push({
            binding: bindingName,
            id: kvResult.id!,
            name: kvResult.name!,
          });
        } else {
          result.errors!.push(`KV ${bindingName} creation failed: ${kvResult.error}`);
        }
      }
    }

    // Step 3: Create D1 Databases
    if (requestedBindings.d1 && requestedBindings.d1.length > 0) {
      for (const bindingName of requestedBindings.d1) {
        const d1Result = await step.do(`create-d1-${bindingName}`, async (): Promise<ResourceCreationResult> => {
          try {
            const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_TOKEN });
            const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
            
            const database = await cf.d1.database.create({
              account_id: accountId,
              name: `${projectName}-${bindingName}`,
            });

            // Type assertion with explanation: SDK uses 'uuid' for D1 database IDs
            const databaseData = database as { uuid: string };
            return {
              success: true,
              id: databaseData.uuid,
              name: `${projectName}-${bindingName}`,
            };
          } catch (error: any) {
            console.error(`Failed to create D1 database ${bindingName}:`, error);
            return { success: false, error: error.message };
          }
        });

        if (d1Result.success) {
          result.resourcesCreated.d1.push({
            binding: bindingName,
            id: d1Result.id!,
            name: d1Result.name!,
          });
        } else {
          result.errors!.push(`D1 ${bindingName} creation failed: ${d1Result.error}`);
        }
      }
    }

    // Step 4: Create R2 Buckets
    if (requestedBindings.r2 && requestedBindings.r2.length > 0) {
      for (const bindingName of requestedBindings.r2) {
        const r2Result = await step.do(`create-r2-${bindingName}`, async () => {
          try {
            const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_TOKEN });
            const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
            
            await cf.r2.buckets.create({
              account_id: accountId,
              name: `${projectName}-${bindingName}`,
            });

            return {
              success: true,
              name: `${projectName}-${bindingName}`,
            };
          } catch (error: any) {
            console.error(`Failed to create R2 bucket ${bindingName}:`, error);
            return { success: false, error: error.message };
          }
        });

        if (r2Result.success) {
          result.resourcesCreated.r2.push({
            binding: bindingName,
            name: r2Result.name!,
          });
        } else {
          result.errors!.push(`R2 ${bindingName} creation failed: ${r2Result.error}`);
        }
      }
    }

    // Step 5: Create Queues
    if (requestedBindings.queues && requestedBindings.queues.length > 0) {
      for (const bindingName of requestedBindings.queues) {
        const queueResult = await step.do(`create-queue-${bindingName}`, async () => {
          try {
            const cf = new Cloudflare({ apiToken: this.env.CLOUDFLARE_TOKEN });
            const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
            
            await cf.queues.create({
              account_id: accountId,
              body: {
                queue_name: `${projectName}-${bindingName}`,
              },
            } as any);

            return {
              success: true,
              name: `${projectName}-${bindingName}`,
            };
          } catch (error: any) {
            console.error(`Failed to create Queue ${bindingName}:`, error);
            return { success: false, error: error.message };
          }
        });

        if (queueResult.success) {
          result.resourcesCreated.queues.push({
            binding: bindingName,
            name: queueResult.name!,
          });
        } else {
          result.errors!.push(`Queue ${bindingName} creation failed: ${queueResult.error}`);
        }
      }
    }

    // Step 6: Generate wrangler.jsonc config
    result.wranglerConfig = await step.do('generate-config', async () => {
      let config = `{\n  "name": "${projectName}",\n  "main": "src/index.ts",\n  "compatibility_date": "2024-06-01",\n`;
      
      // Add KV namespaces
      if (result.resourcesCreated.kv.length > 0) {
        config += `  "kv_namespaces": [\n`;
        result.resourcesCreated.kv.forEach((kv, index) => {
          const comma = index < result.resourcesCreated.kv.length - 1 ? ',' : '';
          config += `    { "binding": "${kv.binding}", "id": "${kv.id}" }${comma}\n`;
        });
        config += `  ],\n`;
      }
      
      // Add D1 databases
      if (result.resourcesCreated.d1.length > 0) {
        config += `  "d1_databases": [\n`;
        result.resourcesCreated.d1.forEach((d1, index) => {
          const comma = index < result.resourcesCreated.d1.length - 1 ? ',' : '';
          config += `    { "binding": "${d1.binding}", "database_name": "${d1.name}", "database_id": "${d1.id}" }${comma}\n`;
        });
        config += `  ],\n`;
      }
      
      // Add R2 buckets
      if (result.resourcesCreated.r2.length > 0) {
        config += `  "r2_buckets": [\n`;
        result.resourcesCreated.r2.forEach((r2, index) => {
          const comma = index < result.resourcesCreated.r2.length - 1 ? ',' : '';
          config += `    { "binding": "${r2.binding}", "bucket_name": "${r2.name}" }${comma}\n`;
        });
        config += `  ],\n`;
      }
      
      // Add Queues
      if (result.resourcesCreated.queues.length > 0) {
        config += `  "queues": {\n`;
        config += `    "producers": [\n`;
        result.resourcesCreated.queues.forEach((queue, index) => {
          const comma = index < result.resourcesCreated.queues.length - 1 ? ',' : '';
          config += `      { "binding": "${queue.binding}", "queue": "${queue.name}" }${comma}\n`;
        });
        config += `    ]\n`;
        config += `  },\n`;
      }
      
      // Remove trailing comma from last section more robustly
      config = config.trimEnd();
      if (config.endsWith(',')) {
        config = config.slice(0, -1);
      }
      config += `\n}\n`;
      
      return config;
    });

    result.success = result.workerCreated && (!result.errors || result.errors.length === 0);
    
    return result;
  }
}
