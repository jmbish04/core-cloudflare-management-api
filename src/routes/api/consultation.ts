import { Hono } from 'hono';
import { Env, Variables, generateUUID } from '../../types';
import { startConsultation, getConsultation } from '../../services/consultation-agent';

const consultation = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * POST /api/consultation
 * Start a new AI consultation session
 */
consultation.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { prompt, session_id } = body;

    if (!prompt || typeof prompt !== 'string') {
      return c.json({
        success: false,
        error: 'prompt is required and must be a string',
      }, 400);
    }

    // Generate or use provided session ID
    const requestId = session_id || generateUUID();

    // Start the consultation
    const result = await startConsultation(c.env, {
      session_id: requestId,
      prompt,
    });

    return c.json({
      success: true,
      request_id: requestId,
      session_id: requestId,
      status: 'in-progress',
      message: 'Consultation started. You can poll this endpoint or connect via WebSocket for real-time updates.',
      websocket_url: `/api/consultation/ws/${requestId}`,
    });
  } catch (error: any) {
    console.error('Error starting consultation:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to start consultation',
    }, 500);
  }
});

/**
 * GET /api/consultation/:request_id
 * Get consultation status and results
 */
consultation.get('/:request_id', async (c) => {
  try {
    const requestId = c.req.param('request_id');

    if (!requestId) {
      return c.json({
        success: false,
        error: 'request_id is required',
      }, 400);
    }

    // Get consultation status
    const result = await getConsultation(c.env, requestId);

    return c.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error getting consultation:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to get consultation',
    }, 500);
  }
});

/**
 * GET /api/consultation/ws/:request_id
 * WebSocket endpoint for real-time consultation updates
 */
consultation.get('/ws/:request_id', async (c) => {
  try {
    const requestId = c.req.param('request_id');

    if (!requestId) {
      return c.json({
        success: false,
        error: 'request_id is required',
      }, 400);
    }

    // Check for WebSocket upgrade
    const upgradeHeader = c.req.header('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return c.json({
        error: 'Expected WebSocket upgrade',
        hint: 'Use a WebSocket client to connect to this endpoint',
      }, 426);
    }

    // Get Durable Object stub
    const doId = c.env.CONSULTATION_SESSION.idFromName(requestId);
    const stub = c.env.CONSULTATION_SESSION.get(doId);

    // Forward WebSocket upgrade request to Durable Object
    return stub.fetch(c.req.raw);
  } catch (error: any) {
    console.error('Error establishing WebSocket connection:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to establish WebSocket connection',
    }, 500);
  }
});

/**
 * GET /api/consultation
 * List recent consultations (if we implement history)
 */
consultation.get('/', async (c) => {
  return c.json({
    success: true,
    message: 'Consultation API is active',
    endpoints: {
      start: 'POST /api/consultation',
      status: 'GET /api/consultation/:request_id',
      websocket: 'GET /api/consultation/ws/:request_id (WebSocket)',
    },
    example: {
      start: {
        method: 'POST',
        url: '/api/consultation',
        body: {
          prompt: 'How to architect a Cloudflare app using KV, Durable Objects, and Queues?',
          session_id: 'optional-custom-id',
        },
      },
    },
  });
});

export default consultation;
