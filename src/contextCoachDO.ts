import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

export class ContextCoachDO extends DurableObject {
  constructor(state: DurableObjectState, env: Env) {
    // Cast env to any to satisfy DurableObject base class typing;
    // our Env interface reflects configured bindings.
    super(state, env as unknown as any);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /coach — main coaching endpoint
    if (request.method === 'POST' && url.pathname === '/coach') {
      try {
        const payload = (await request.json()) as { prompt?: string; context?: any };
        const { prompt, context } = payload;

        // Example: retrieve short memory context from storage
        const history = (await this.ctx.storage.get<string[]>('context')) ?? [];
        history.push(prompt || '');
        await this.ctx.storage.put('context', history.slice(-10)); // keep last 10 prompts

        // TODO: Replace this with your self-tuning AI logic
        // Check if AI binding is available
        if (!this.env.AI) {
          return Response.json({
            should_modify: false,
            confidence: 0.5,
            coach_message: 'AI binding not configured. ContextCoach is available but AI features are disabled.',
            suggested_changes: {},
          });
        }

        // Build the prompt for the AI model
        const systemPrompt = `You are ContextCoach, a concise, curious assistant.
Given the user's current prompt and stored context, decide whether clarification or action is needed.
Return your result in structured JSON with: should_modify, confidence, coach_message, suggested_changes.`;

        const userPrompt = JSON.stringify({ prompt, context, recent_prompts: history });

        const aiResponse = await this.env.AI.run('@cf/openai/gpt-oss-120b', {
          instructions: `${systemPrompt}`,
          input: userPrompt,
        });

        const suggestion = {
          should_modify: false,
          confidence: 0.75,
          coach_message:
            (aiResponse as { response?: string }).response ||
            'ContextCoach is ready to guide API interactions. Implement deeper logic next.',
          suggested_changes: {},
        };

        return Response.json(suggestion);
      } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // GET /health — simple status check
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'healthy' });
    }

    return new Response('Not found', { status: 404 });
  }
}