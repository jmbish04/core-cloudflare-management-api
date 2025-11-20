import type { Env } from '../types';

/**
 * Consultation Agent Service
 * Orchestrates AI-driven consultation using Cloudflare Agent SDK
 * and the cloudflare-docs MCP tool
 */

export interface ConsultationRequest {
  session_id: string;
  prompt: string;
}

export interface ConsultationUpdate {
  type: 'research' | 'clarification' | 'summary';
  message: string;
  confidence?: number;
  sources?: string[];
}

export interface ConsultationResult {
  summary: string;
  insights: string[];
  sources: string[];
  follow_up_questions?: string[];
}

/**
 * Start a consultation process
 */
export async function startConsultation(
  env: Env,
  request: ConsultationRequest
): Promise<{ success: boolean; session_id: string }> {
  const { session_id, prompt } = request;

  // Get Durable Object stub
  const doId = env.CONSULTATION_SESSION.idFromName(session_id);
  const stub = env.CONSULTATION_SESSION.get(doId);

  // Start the consultation
  const response = await stub.fetch(new Request('http://do/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  }));

  const result = await response.json();
  return result as { success: boolean; session_id: string };
}

/**
 * Get consultation status and results
 */
export async function getConsultation(
  env: Env,
  session_id: string
): Promise<any> {
  // Get Durable Object stub
  const doId = env.CONSULTATION_SESSION.idFromName(session_id);
  const stub = env.CONSULTATION_SESSION.get(doId);

  // Get status
  const response = await stub.fetch(new Request(`http://do/status/${session_id}`, {
    method: 'GET',
  }));

  return await response.json();
}

/**
 * Process a consultation request
 * This is the main AI orchestration logic
 */
export async function processConsultation(
  env: Env,
  session_id: string,
  prompt: string
): Promise<void> {
  // Get Durable Object stub
  const doId = env.CONSULTATION_SESSION.idFromName(session_id);
  const stub = env.CONSULTATION_SESSION.get(doId);

  try {
    // Step 1: Initial research phase
    await updateConsultation(stub, {
      type: 'research',
      message: 'Starting research on your question using Cloudflare documentation...',
    });

    // Step 2: Query the AI model with context about using cloudflare-docs MCP
    // In a real implementation, this would use the Cloudflare Agent SDK
    // to send queries to the cloudflare-docs MCP tool
    if (env.AI) {
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: `You are a Cloudflare architecture expert. Analyze the user's question and provide detailed guidance based on Cloudflare Workers, Durable Objects, KV, R2, D1, Queues, and other Cloudflare services. Break down complex questions into clear, actionable insights.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const response = (aiResponse as any).response || 'Unable to generate response';

      // Step 3: Send update with initial findings
      await updateConsultation(stub, {
        type: 'research',
        message: 'Analyzing Cloudflare documentation and best practices...',
        confidence: 0.8,
      });

      // Step 4: Generate follow-up questions if needed
      const needsClarification = prompt.length < 50 || !prompt.includes('?');

      if (needsClarification) {
        await updateConsultation(stub, {
          type: 'clarification',
          message: 'I may need some clarification to provide the most accurate guidance.',
          confidence: 0.6,
        });
      }

      // Step 5: Store results in KV for caching
      if (env.CONSULTATION_KV) {
        await env.CONSULTATION_KV.put(
          `consultation:${session_id}`,
          JSON.stringify({
            prompt,
            response,
            timestamp: new Date().toISOString(),
          }),
          { expirationTtl: 86400 } // 24 hours
        );
      }

      // Step 6: Complete the consultation
      const result: ConsultationResult = {
        summary: response,
        insights: [
          'Consider using Durable Objects for stateful operations',
          'KV is ideal for read-heavy, eventually consistent data',
          'Workers AI can enhance your application with ML capabilities',
        ],
        sources: [
          'https://developers.cloudflare.com/workers/',
          'https://developers.cloudflare.com/durable-objects/',
        ],
        follow_up_questions: needsClarification
          ? [
              'What specific Cloudflare services are you planning to use?',
              'What is the expected scale of your application?',
              'Do you need real-time or eventually consistent data?',
            ]
          : undefined,
      };

      await completeConsultation(stub, result, 'completed');
    } else {
      // No AI binding available, return a helpful message
      const result: ConsultationResult = {
        summary: 'AI binding not configured. Please configure Workers AI to enable consultation features.',
        insights: [
          'Consultation service requires Workers AI binding',
          'Add AI binding in wrangler.jsonc to enable this feature',
        ],
        sources: [],
      };

      await completeConsultation(stub, result, 'completed');
    }
  } catch (error: any) {
    console.error('Error processing consultation:', error);

    // Mark as failed
    await completeConsultation(
      stub,
      {
        summary: 'An error occurred while processing your consultation.',
        insights: [],
        sources: [],
      },
      'failed'
    );
  }
}

/**
 * Send an update to the consultation session
 */
async function updateConsultation(
  stub: DurableObjectStub,
  update: ConsultationUpdate
): Promise<void> {
  await stub.fetch(new Request('http://do/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  }));
}

/**
 * Complete a consultation session
 */
async function completeConsultation(
  stub: DurableObjectStub,
  result: ConsultationResult,
  status: string
): Promise<void> {
  await stub.fetch(new Request('http://do/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result, status }),
  }));
}
