import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { callCloudflareAPI, MetaApiCallRequest } from '../../lib/apiGateway';
import { CoachTelemetryService, CoachSuggestion } from '../../services/coachTelemetry';

import workersRouter from './workers';
import storageRouter from './storage';
import tokensRouter from './tokens';
import pagesRouter from './pages';
import cicdRouter from './cicd';
import vectorizeRouter from './vectorize';
import aiRouter from './ai';
import consultationRouter from './consultation';

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

api.route('/workers', workersRouter);
api.route('/storage', storageRouter);
api.route('/tokens', tokensRouter);
api.route('/pages', pagesRouter);
api.route('/cicd', cicdRouter);
api.route('/vectorize', vectorizeRouter);
api.route('/ai', aiRouter);
api.route('/consultation', consultationRouter);

// Mount same routes under /raw/ for backward compatibility and clarity
api.route('/raw/workers', workersRouter);
api.route('/raw/storage', storageRouter);
api.route('/raw/tokens', tokensRouter);
api.route('/raw/pages', pagesRouter);
api.route('/raw/cicd', cicdRouter);
api.route('/raw/vectorize', vectorizeRouter);
api.route('/raw/ai', aiRouter);
api.route('/raw/consultation', consultationRouter);

/**
 * Meta API Introspection - Discover available products and actions
 * 
 * Returns all supported product + action pairs from the api_permissions_map table.
 * GPT will call this automatically on cold start to discover capabilities.
 */
api.get('/meta/help', async (c) => {
  try {
    const { getAllApiMappings } = await import('../../lib/db');
    const mappings = await getAllApiMappings(c.env);
    
    // Group by product
    const products: Record<string, {
      permission: string;
      base_path: string;
      verbs: string;
      actions: string[];
    }> = {};
    
    for (const mapping of mappings) {
      const product = mapping.permission.split(':')[0] || mapping.permission;
      if (!products[product]) {
        products[product] = {
          permission: mapping.permission,
          base_path: mapping.base_path,
          verbs: (mapping as any).verbs || 'GET,POST,PUT,PATCH,DELETE',
          actions: [],
        };
      }
      
      // Extract action from permission (e.g., "workers:read" → "read")
      const action = mapping.permission.split(':')[1];
      if (action && !products[product].actions.includes(action)) {
        products[product].actions.push(action);
      }
    }
    
    return c.json({
      success: true,
      result: {
        products: Object.keys(products),
        mappings: products,
        usage: {
          description: 'Use /api/call with product and optional action/method to make API calls',
          examples: [
            { product: 'workers', action: 'list_scripts' },
            { product: 'r2', action: 'list_buckets' },
            { product: 'd1', action: 'list_databases' },
          ],
        },
      },
    });
  } catch (error: any) {
    console.error('Meta API help error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to retrieve API mappings',
    }, 500);
  }
});

/**
 * Check if payload needs coaching (incomplete product or method)
 */
function needsCoaching(body: any): boolean {
  return !body?.product || !body?.method;
}

/**
 * Ask the context coach for a suggestion
 */
async function askCoach(env: Env, prompt: string, context: any): Promise<CoachSuggestion | null> {
  if (!env.CONTEXT_COACH) {
    return null; // Coach not available
  }

  try {
    // Get Durable Object stub
    const doId = env.CONTEXT_COACH.idFromName('context-coach');
    const stub = env.CONTEXT_COACH.get(doId);

    // Call the coach endpoint
    const resp = await stub.fetch(new Request('http://do/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, context }),
    }));

    if (!resp.ok) {
      console.error('Coach service error:', resp.status, await resp.text());
      return null;
    }

    return await resp.json() as CoachSuggestion;
  } catch (error: any) {
    console.error('Failed to call coach:', error);
    return null;
  }
}

/**
 * Merge coach suggestion into payload
 */
function mergeSuggestion(body: any, suggestion: CoachSuggestion | null, threshold: number): any {
  if (!suggestion) {
    return body;
  }

  // Apply threshold to suggestion
  if (suggestion.confidence < threshold) {
    suggestion.next_step = 'clarify';
  }

  // Infer method from action if not provided
  const inferredMethod = suggestion.method ?? body.method ?? 
    ((suggestion.action || '').match(/list|get|show/i) ? 'GET' :
     (suggestion.action || '').match(/create|deploy|add|upload/i) ? 'POST' :
     (suggestion.action || '').match(/delete|remove/i) ? 'DELETE' :
     (suggestion.action || '').match(/update/i) ? 'PUT' :
     (suggestion.action || '').match(/modify/i) ? 'PATCH' : 'GET');

  return {
    ...body,
    product: (suggestion.product ?? body.product)?.toLowerCase(),
    action: suggestion.action ?? body.action ?? null,
    method: inferredMethod,
  };
}

/**
 * Meta API Gateway - Dynamic Cloudflare API proxy
 * 
 * Accepts a flexible JSON payload and routes it to the correct Cloudflare API endpoint
 * using D1 metadata (api_permissions_map).
 * 
 * If payload is incomplete, consults the context coach to infer missing parameters.
 * 
 * Example payload:
 * {
 *   "product": "workers",
 *   "action": "list_scripts",
 *   "method": "GET",
 *   "params": { "account_id": "..." }
 * }
 */
api.post('/call', async (c) => {
  const startTime = Date.now();
  const telemetry = new CoachTelemetryService(c.env);
  let coachSuggestion: CoachSuggestion | null = null;

  try {
    const originalBody = await c.req.json() as MetaApiCallRequest;
    let body = originalBody;

    // Check if we need coaching
    if (needsCoaching(originalBody)) {
      // Get dynamic threshold from KV (default 0.75)
      const thresholdStr = await c.env.KV.get('clarify_threshold');
      const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.75;

      // Create a natural language prompt for the coach
      const prompt = typeof originalBody === 'string'
        ? originalBody
        : JSON.stringify(originalBody);
      
      const context = { hint: 'Map to Cloudflare product+action+method' };

      // Ask the coach
      coachSuggestion = await askCoach(c.env, prompt, context);

      if (coachSuggestion) {
        // Apply threshold
        if (coachSuggestion.confidence < threshold) {
          coachSuggestion.next_step = 'clarify';
        }

        // Log telemetry before decision
        await telemetry.log({
          prompt,
          product: coachSuggestion.product,
          action: coachSuggestion.action,
          method: coachSuggestion.method,
          confidence: coachSuggestion.confidence,
          next_step: coachSuggestion.next_step,
          coach_message: coachSuggestion.coach_message,
          raw_response: coachSuggestion,
        });

        // If coach says to clarify, return early
        if (coachSuggestion.next_step === 'clarify') {
          await telemetry.log({
            prompt,
            product: coachSuggestion.product,
            action: coachSuggestion.action,
            method: coachSuggestion.method,
            confidence: coachSuggestion.confidence,
            next_step: coachSuggestion.next_step,
            coach_message: coachSuggestion.coach_message,
            result_status: 'clarified',
            raw_response: coachSuggestion,
          });

          return c.json({
            success: false,
            needs_clarification: true,
            message: coachSuggestion.coach_message,
          }, 400);
        }

        // Merge suggestion into body
        body = mergeSuggestion(originalBody, coachSuggestion, threshold);
      }
    }

    // Validate required fields
    if (!body.product) {
      return c.json({ 
        error: 'product is required',
        hint: 'Available products: workers, r2, d1, kv, vectorize, ai, pages, tokens. Use /api/meta/help to see all available options.',
      }, 400);
    }
    
    // Method is optional - will be inferred from action if not provided
    // Validate method if provided
    if (body.method) {
      const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      if (!validMethods.includes(body.method)) {
        return c.json({ 
          error: `Invalid method. Must be one of: ${validMethods.join(', ')}`,
          hint: 'If method is omitted, it will be inferred from action (list → GET, create → POST, etc.)',
        }, 400);
      }
    }

    // Call Cloudflare API
    const result = await callCloudflareAPI(c.env, body);
    const executionLatency = Date.now() - startTime;

    // Log successful execution
    if (coachSuggestion) {
      await telemetry.log({
        prompt: typeof originalBody === 'string' ? originalBody : JSON.stringify(originalBody),
        product: body.product,
        action: body.action,
        method: body.method,
        confidence: coachSuggestion.confidence,
        next_step: 'execute',
        coach_message: coachSuggestion.coach_message,
        result_status: result.status >= 200 && result.status < 300 ? 'executed' : 'failed',
        execution_latency_ms: executionLatency,
        raw_response: coachSuggestion,
      });
    }

    // Return the response with the same status code
    // Ensure status code is valid (200-599)
    const statusCode = result.status >= 200 && result.status < 600 ? result.status : 200;
    return c.json(result.data, statusCode as any);
  } catch (error: any) {
    console.error('Meta API Gateway error:', error);
    
    // Log failure
    if (coachSuggestion) {
      await telemetry.log({
        prompt: 'unknown',
        product: coachSuggestion.product,
        action: coachSuggestion.action,
        method: coachSuggestion.method,
        confidence: coachSuggestion.confidence,
        next_step: coachSuggestion.next_step,
        coach_message: coachSuggestion.coach_message,
        result_status: 'failed',
        raw_response: coachSuggestion,
      });
    }

    return c.json({ 
      error: error.message || 'Internal server error',
      details: error.stack 
    }, 500);
  }
});

/**
 * Coach endpoint - allows GPT to directly consult the coach
 * Usually not necessary because /api/call auto-consults the coach when needed
 */
api.post('/coach', async (c) => {
  try {
    const payload = await c.req.json();
    
    if (!c.env.CONTEXT_COACH) {
      return c.json({ error: 'Coach service not available' }, 503);
    }

    // Get Durable Object stub
    const doId = c.env.CONTEXT_COACH.idFromName('context-coach');
    const stub = c.env.CONTEXT_COACH.get(doId);

    // Call the coach endpoint
    const resp = await stub.fetch(new Request('http://do/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));

    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Telemetry endpoint - get coach telemetry stats and manually trigger auto-tuning
 */
api.get('/telemetry/stats', async (c) => {
  try {
    const telemetry = new CoachTelemetryService(c.env);
    const days = parseInt(c.req.query('days') || '7');
    const stats = await telemetry.getRollingStats(days);
    const recent = await telemetry.getRecent(50);
    
    return c.json({
      success: true,
      result: {
        stats,
        recent: recent.slice(0, 10), // Return last 10 for preview
        total_recent: recent.length,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

api.post('/telemetry/tune', async (c) => {
  try {
    const { autoTuneThreshold } = await import('../../services/coachTelemetry');
    const result = await autoTuneThreshold(c.env);
    return c.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default api;
