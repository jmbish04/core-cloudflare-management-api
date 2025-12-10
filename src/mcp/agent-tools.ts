/**
 * MCP Agent Tools
 * Additional tools for the AI agent to manage deployments and workflows
 */

import type { Env } from '../types';

export interface GetDeploymentLogsInput {
  scriptName: string;
  limit?: number;
}

export interface RollbackWorkerInput {
  scriptName: string;
  versionId?: string;
}

export interface GetProvisioningStatusInput {
  instanceId: string;
}

/**
 * Tool: get_deployment_logs
 * Fetch deployment logs for a specific worker
 */
export const getDeploymentLogsTool = {
  name: 'get_deployment_logs',
  description: 'Fetch deployment logs for a specific Cloudflare Worker to analyze failures and debug issues. Returns recent deployment history and logs.',
  inputSchema: {
    type: 'object',
    properties: {
      scriptName: {
        type: 'string',
        description: 'Name of the worker script to fetch logs for',
      },
      limit: {
        type: 'number',
        description: 'Number of log entries to return (default: 10)',
        default: 10,
      },
    },
    required: ['scriptName'],
  },

  async handler(input: GetDeploymentLogsInput, env: Env): Promise<any> {
    const { scriptName, limit = 10 } = input;
    
    try {
      const Cloudflare = (await import('cloudflare')).default;
      const cf = new Cloudflare({ apiToken: env.CLOUDFLARE_TOKEN });
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;

      // Get deployment history
      const deploymentsResponse = await (cf.workers.scripts.deployments as any).list({
        account_id: accountId,
        script_name: scriptName,
      } as any);
      
      const deployments: any = await deploymentsResponse.json();
      const recentDeployments = (deployments.result || []).slice(0, limit);

      // Get worker details
      let workerInfo;
      try {
        const workerResponse = await cf.workers.scripts.get(scriptName, {
          account_id: accountId,
        });
        workerInfo = await workerResponse.json();
      } catch (error: any) {
        workerInfo = { error: 'Could not fetch worker details', message: error.message };
      }

      return {
        success: true,
        scriptName,
        deployments: recentDeployments.map((d: any) => ({
          id: d.id,
          created_on: d.created_on,
          source: d.source,
          author_email: d.author_email,
        })),
        currentWorker: workerInfo,
        message: `Found ${recentDeployments.length} recent deployments for ${scriptName}`,
      };
    } catch (error: any) {
      throw new Error(`Failed to get deployment logs: ${error.message}`);
    }
  },
};

/**
 * Tool: get_rollback_info
 * Get information about previous deployments for potential rollback
 */
export const rollbackWorkerTool = {
  name: 'get_rollback_info',
  description: 'Get information about previous deployments of a Cloudflare Worker for potential rollback. Note: This retrieves rollback information only; actual rollback requires stored worker content or Workers Versions API.',
  inputSchema: {
    type: 'object',
    properties: {
      scriptName: {
        type: 'string',
        description: 'Name of the worker script to rollback',
      },
      versionId: {
        type: 'string',
        description: 'Optional: specific deployment version ID to rollback to. If not provided, rolls back to the previous version.',
      },
    },
    required: ['scriptName'],
  },

  async handler(input: RollbackWorkerInput, env: Env): Promise<any> {
    const { scriptName, versionId } = input;
    
    try {
      const Cloudflare = (await import('cloudflare')).default;
      const cf = new Cloudflare({ apiToken: env.CLOUDFLARE_TOKEN });
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;

      // Get deployment history
      const deploymentsResponse = await (cf.workers.scripts.deployments as any).list({
        account_id: accountId,
        script_name: scriptName,
      } as any);
      
      const deployments: any = await deploymentsResponse.json();
      
      if (!deployments.result || deployments.result.length < 2) {
        throw new Error('No previous deployments found to rollback to');
      }

      // Find target deployment
      const targetDeployment = versionId
        ? deployments.result.find((d: any) => d.id === versionId)
        : deployments.result[1]; // Previous deployment

      if (!targetDeployment) {
        throw new Error('Target deployment not found');
      }

      return {
        success: true,
        scriptName,
        targetDeployment: {
          id: targetDeployment.id,
          created_on: targetDeployment.created_on,
          source: targetDeployment.source,
        },
        message: `Rollback information retrieved for ${scriptName}. Note: Actual rollback requires stored worker content. Consider using Cloudflare Workers Versions API or storing versions in R2.`,
        recommendation: 'To enable full rollback functionality, implement version storage using R2 or Workers Versions API',
      };
    } catch (error: any) {
      throw new Error(`Failed to rollback worker: ${error.message}`);
    }
  },
};

/**
 * Tool: get_provisioning_status
 * Check the status of a provisioning workflow instance
 */
export const getProvisioningStatusTool = {
  name: 'get_provisioning_status',
  description: 'Check the status of a Provisioning Workflow instance. Use this to monitor the progress of resource creation for a new project.',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: {
        type: 'string',
        description: 'The workflow instance ID returned when starting provisioning',
      },
    },
    required: ['instanceId'],
  },

  async handler(input: GetProvisioningStatusInput, env: Env): Promise<any> {
    const { instanceId } = input;
    
    try {
      // Note: Workflow bindings require specific configuration
      // This is a placeholder that demonstrates the expected interface
      
      if (!env.PROVISIONING_WORKFLOW) {
        throw new Error('Provisioning workflow binding not configured. Add PROVISIONING_WORKFLOW binding to wrangler.jsonc');
      }

      const instance = await (env.PROVISIONING_WORKFLOW as any).get(instanceId);
      const status = await instance.status();

      return {
        success: true,
        instanceId,
        status: status.status,
        output: status.output,
        error: status.error,
        message: `Provisioning workflow ${instanceId} is ${status.status}`,
      };
    } catch (error: any) {
      throw new Error(`Failed to get provisioning status: ${error.message}`);
    }
  },
};

/**
 * Export all agent MCP tools
 */
export const agentMCPTools = [
  getDeploymentLogsTool,
  rollbackWorkerTool,
  getProvisioningStatusTool,
];
