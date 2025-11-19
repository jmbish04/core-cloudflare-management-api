import type { Env } from '../types';
import {
  createWorker,
  validateWorkerRequest,
  type CreateWorkerRequest,
  type CreateWorkerResponse,
} from '../services/create-worker-service';

/**
 * MCP Tools for Worker Creation
 * Provides AI agent integration for safely creating and deploying Cloudflare Workers
 *
 * Usage example (in Claude, Copilot, or Cursor):
 * - Tool: create_worker
 * - Input: { project_name, type, javascript_files, bindings }
 * - Output: Worker URL and wrangler configuration
 */

/**
 * MCP Tool Definition for create_worker
 */
export const createWorkerTool = {
  name: 'create_worker',
  description: 'Safely create and deploy a new Cloudflare Worker or Pages app. Automatically creates required bindings (KV, D1, R2, Queues) and validates that JavaScript files do not contain inline HTML. Returns the deployed Worker URL and wrangler configuration.',
  inputSchema: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Worker name (alphanumeric, hyphens, underscores only, max 63 chars)',
      },
      type: {
        type: 'string',
        enum: ['worker', 'worker_with_static', 'pages', 'worker_with_pages'],
        description: 'Type of Worker to create',
      },
      javascript_files: {
        type: 'object',
        description: 'JavaScript files for the Worker (base64 encoded)',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths (e.g., ["src/index.js"])',
          },
          content_base64: {
            type: 'array',
            items: { type: 'string' },
            description: 'Base64-encoded file contents',
          },
        },
        required: ['paths', 'content_base64'],
      },
      static_files: {
        type: 'object',
        description: 'Static files (HTML, CSS, images) for the Worker (base64 encoded)',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths (e.g., ["public/index.html"])',
          },
          content_base64: {
            type: 'array',
            items: { type: 'string' },
            description: 'Base64-encoded file contents',
          },
        },
        required: ['paths', 'content_base64'],
      },
      bindings: {
        type: 'object',
        description: 'Cloudflare bindings to create',
        properties: {
          kv: {
            type: 'array',
            items: { type: 'string' },
            description: 'KV namespace names',
          },
          d1: {
            type: 'array',
            items: { type: 'string' },
            description: 'D1 database names',
          },
          r2: {
            type: 'array',
            items: { type: 'string' },
            description: 'R2 bucket names',
          },
          queues: {
            type: 'array',
            items: { type: 'string' },
            description: 'Queue names',
          },
          workflows: {
            type: 'array',
            items: { type: 'string' },
            description: 'Workflow names',
          },
        },
      },
    },
    required: ['project_name', 'type', 'javascript_files'],
  },

  /**
   * Handler for create_worker tool
   */
  async handler(
    input: CreateWorkerRequest,
    env: Env
  ): Promise<CreateWorkerResponse> {
    try {
      // Create the worker
      const result = await createWorker(env, input);

      if (!result.success) {
        throw new Error(result.error || 'Failed to create worker');
      }

      return result;
    } catch (error: any) {
      throw new Error(`Failed to create worker: ${error.message}`);
    }
  },
};

/**
 * MCP Tool Definition for validate_worker_request
 */
export const validateWorkerRequestTool = {
  name: 'validate_worker_request',
  description: 'Validate a Worker creation request without actually creating anything. Checks project name, JavaScript files for inline HTML, static files structure, and binding names.',
  inputSchema: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Worker name to validate',
      },
      type: {
        type: 'string',
        enum: ['worker', 'worker_with_static', 'pages', 'worker_with_pages'],
        description: 'Type of Worker',
      },
      javascript_files: {
        type: 'object',
        description: 'JavaScript files to validate',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
          },
          content_base64: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['paths', 'content_base64'],
      },
      static_files: {
        type: 'object',
        description: 'Static files to validate (optional)',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
          },
          content_base64: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['paths', 'content_base64'],
      },
      bindings: {
        type: 'object',
        description: 'Bindings to validate (optional)',
        properties: {
          kv: { type: 'array', items: { type: 'string' } },
          d1: { type: 'array', items: { type: 'string' } },
          r2: { type: 'array', items: { type: 'string' } },
          queues: { type: 'array', items: { type: 'string' } },
          workflows: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['project_name', 'type', 'javascript_files'],
  },

  /**
   * Handler for validate_worker_request tool
   */
  async handler(
    input: CreateWorkerRequest,
    env: Env
  ): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const result = await validateWorkerRequest(input);
      return result;
    } catch (error: any) {
      throw new Error(`Failed to validate request: ${error.message}`);
    }
  },
};

/**
 * Export all worker creation MCP tools
 */
export const workerCreationMCPTools = [
  createWorkerTool,
  validateWorkerRequestTool,
];
