import type { Env } from '../types';

/**
 * MCP Consultation Tool
 * Provides AI agent integration for consultation features
 *
 * Usage example (in Claude, Copilot, or Cursor):
 * - Tool: consultation.query
 * - Input: { prompt: "How to architect a Cloudflare app?" }
 * - Output: Structured consultation result with insights and sources
 */

export interface ConsultationMCPInput {
  prompt: string;
  session_id?: string;
}

export interface ConsultationMCPOutput {
  session_id: string;
  status: string;
  message: string;
  websocket_url?: string;
}

/**
 * MCP Tool Definition for consultation.query
 */
export const consultationTool = {
  name: 'consultation.query',
  description: 'Start a Cloudflare AI consultation session. Ask complex questions about Cloudflare Workers architecture, Durable Objects, KV, R2, D1, Queues, and other services. The system will research documentation and provide structured guidance.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Your question or consultation request about Cloudflare architecture and services',
      },
      session_id: {
        type: 'string',
        description: 'Optional session ID to continue an existing consultation',
      },
    },
    required: ['prompt'],
  },

  /**
   * Handler for consultation.query tool
   */
  async handler(
    input: ConsultationMCPInput,
    env: Env
  ): Promise<ConsultationMCPOutput> {
    const { startConsultation } = await import('../services/consultation-agent');
    const { generateUUID } = await import('../types');

    const { prompt, session_id } = input;
    const requestId = session_id || generateUUID();

    try {
      // Start the consultation
      await startConsultation(env, {
        session_id: requestId,
        prompt,
      });

      return {
        session_id: requestId,
        status: 'in-progress',
        message: 'Consultation started. Use consultation.get to retrieve results.',
        websocket_url: `/api/consultation/ws/${requestId}`,
      };
    } catch (error: any) {
      throw new Error(`Failed to start consultation: ${error.message}`);
    }
  },
};

/**
 * MCP Tool Definition for consultation.get
 */
export const consultationGetTool = {
  name: 'consultation.get',
  description: 'Get the status and results of a consultation session',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The session ID returned from consultation.query',
      },
    },
    required: ['session_id'],
  },

  /**
   * Handler for consultation.get tool
   */
  async handler(
    input: { session_id: string },
    env: Env
  ): Promise<any> {
    const { getConsultation } = await import('../services/consultation-agent');

    const { session_id } = input;

    try {
      const result = await getConsultation(env, session_id);
      return result;
    } catch (error: any) {
      throw new Error(`Failed to get consultation: ${error.message}`);
    }
  },
};

/**
 * Export all consultation MCP tools
 */
export const consultationMCPTools = [
  consultationTool,
  consultationGetTool,
];
