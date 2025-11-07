import { DurableObject } from 'cloudflare:workers';

/**
 * LogTailingDO - Durable Object for managing WebSocket connections
 * and fan-out of real-time log messages
 */
export class LogTailingDO extends DurableObject {
  private sessions: Set<WebSocket> = new Set();
  private logBuffer: string[] = [];
  private maxBufferSize = 1000;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for log tailing
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // HTTP endpoint for publishing logs
    if (request.method === 'POST' && url.pathname === '/publish') {
      const logEntry = await request.text();
      this.broadcast(logEntry);
      return Response.json({ success: true });
    }

    // Get buffer (recent logs)
    if (request.method === 'GET' && url.pathname === '/buffer') {
      return Response.json({ logs: this.logBuffer });
    }

    return new Response('Not found', { status: 404 });
  }

  handleSession(webSocket: WebSocket) {
    this.sessions.add(webSocket);

    // Send recent logs to new connection
    if (this.logBuffer.length > 0) {
      webSocket.send(JSON.stringify({
        type: 'buffer',
        logs: this.logBuffer.slice(-100), // Last 100 logs
      }));
    }

    webSocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data as string);

        // Handle ping/pong for connection health
        if (data.type === 'ping') {
          webSocket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    webSocket.addEventListener('close', () => {
      this.sessions.delete(webSocket);
    });

    webSocket.addEventListener('error', () => {
      this.sessions.delete(webSocket);
    });

    webSocket.accept();
  }

  broadcast(logEntry: string) {
    // Add to buffer
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }

    // Fan-out to all connected clients
    const message = JSON.stringify({
      type: 'log',
      data: logEntry,
      timestamp: new Date().toISOString(),
    });

    this.sessions.forEach((session) => {
      try {
        session.send(message);
      } catch (error) {
        console.error('Error sending to WebSocket:', error);
        this.sessions.delete(session);
      }
    });
  }
}
