import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

/**
 * ConsultationSessionDO - Manages consultation session state and WebSocket updates
 * Handles AI consultation workflows with progress tracking
 */
export class ConsultationSessionDO extends DurableObject {
  private sessions: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    super(state, env as unknown as any);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for real-time updates
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Start a new consultation
    if (request.method === 'POST' && url.pathname === '/start') {
      try {
        const { prompt } = await request.json() as { prompt: string };

        if (!prompt || typeof prompt !== 'string') {
          return Response.json({ error: 'prompt is required and must be a string' }, { status: 400 });
        }

        // Store initial state
        await this.ctx.storage.put({
          prompt,
          status: 'in-progress',
          created_at: new Date().toISOString(),
          updates: [],
        });

        // Enqueue the consultation job
        if (this.env.CONSULTATION_QUEUE) {
          await this.env.CONSULTATION_QUEUE.send({
            session_id: this.ctx.id.toString(),
            prompt,
            timestamp: Date.now(),
          });
        }

        // Broadcast to connected clients
        this.broadcast({
          type: 'consultation_started',
          status: 'in-progress',
          prompt,
          timestamp: new Date().toISOString(),
        });

        return Response.json({
          success: true,
          status: 'in-progress',
          session_id: this.ctx.id.toString(),
        });
      } catch (error: any) {
        console.error('Error starting consultation:', error, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // Get consultation status
    if (request.method === 'GET' && url.pathname.startsWith('/status')) {
      try {
        // Batch storage.get() calls for better performance
        const keys = ['status', 'prompt', 'updates', 'result', 'created_at', 'completed_at'];
        const values = await this.ctx.storage.get(keys);

        const status = values.get('status') as string;
        const prompt = values.get('prompt') as string;
        const updates = values.get('updates') as any[];
        const result = values.get('result');
        const created_at = values.get('created_at') as string;
        const completed_at = values.get('completed_at') as string;

        return Response.json({
          success: true,
          session_id: this.ctx.id.toString(),
          status: status || 'pending',
          prompt,
          updates: updates || [],
          result,
          created_at,
          completed_at,
        });
      } catch (error: any) {
        console.error('Error getting consultation status:', error, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // Update consultation progress (called by the agent)
    if (request.method === 'POST' && url.pathname === '/update') {
      try {
        const update = await request.json() as any;

        // Validate update body
        if (!update || typeof update !== 'object') {
          return Response.json({ error: 'Invalid update body: must be an object' }, { status: 400 });
        }

        if (!update.type || typeof update.type !== 'string') {
          return Response.json({ error: 'Invalid update body: type is required and must be a string' }, { status: 400 });
        }

        // Use blockConcurrencyWhile to ensure atomic updates
        await this.ctx.storage.blockConcurrencyWhile(async () => {
          const updates = (await this.ctx.storage.get('updates') as any[]) || [];
          updates.push({
            ...update,
            timestamp: new Date().toISOString(),
          });
          await this.ctx.storage.put('updates', updates);
        });

        // Broadcast to connected clients
        this.broadcast({
          type: 'consultation_update',
          update,
          timestamp: new Date().toISOString(),
        });

        return Response.json({ success: true });
      } catch (error: any) {
        console.error('Error updating consultation:', error, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // Complete consultation (called by the agent)
    if (request.method === 'POST' && url.pathname === '/complete') {
      try {
        const { result, status } = await request.json() as any;

        await this.ctx.storage.put('status', status || 'completed');
        await this.ctx.storage.put('result', result);
        await this.ctx.storage.put('completed_at', new Date().toISOString());

        // Broadcast to connected clients
        this.broadcast({
          type: 'consultation_completed',
          status: status || 'completed',
          result,
          timestamp: new Date().toISOString(),
        });

        return Response.json({ success: true });
      } catch (error: any) {
        console.error('Error completing consultation:', error, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // Health check
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'healthy' });
    }

    return new Response('Not found', { status: 404 });
  }

  handleSession(webSocket: WebSocket) {
    this.sessions.add(webSocket);

    webSocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data as string);

        // Handle ping/pong for connection health
        if (data.type === 'ping') {
          webSocket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error: any) {
        console.error('Error handling WebSocket message:', error, error.stack);
        // Send error message to client
        try {
          webSocket.send(JSON.stringify({
            type: 'error',
            error: 'Failed to process message',
            message: error.message,
          }));
        } catch (sendError) {
          console.error('Failed to send error to WebSocket client:', sendError);
        }
      }
    });

    webSocket.addEventListener('close', () => {
      this.sessions.delete(webSocket);
    });

    webSocket.addEventListener('error', (event: any) => {
      console.error('WebSocket error:', event);
      this.sessions.delete(webSocket);
      // Try to send error to client before closing
      try {
        webSocket.send(JSON.stringify({
          type: 'error',
          error: 'WebSocket error occurred',
        }));
      } catch (sendError) {
        console.error('Failed to send error to WebSocket client:', sendError);
      }
    });

    webSocket.accept();
  }

  broadcast(message: any) {
    const messageStr = JSON.stringify(message);

    this.sessions.forEach((session) => {
      try {
        session.send(messageStr);
      } catch (error) {
        console.error('Error sending to WebSocket:', error);
        this.sessions.delete(session);
      }
    });
  }
}
