import { Env, Variables, generateUUID } from '../types';
import { initDb } from '../db/client';
import type { Kysely } from 'kysely';
import type { Database } from '../db/client';

export interface SessionData {
  requestType: string; // 'api', 'cron', 'health_check', 'test', etc.
  requestMethod?: string;
  requestPath?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  userAgent?: string;
  clientIp?: string;
  accountId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ActionData {
  actionType: string; // 'request_received', 'api_call', 'ai_request', 'ai_response', 'cloudflare_api_call', 'cloudflare_api_response', 'database_query', 'response_sent', 'error', etc.
  actionName: string; // Descriptive name of the action
  status?: string; // 'started', 'completed', 'failed', 'info'
  inputData?: any;
  outputData?: any;
  errorMessage?: string;
  metadata?: Record<string, any>;
  durationMs?: number;
}

/**
 * Comprehensive logging service for tracking all application actions and sessions
 */
export class LoggingService {
  private env: Env;
  private db: Kysely<Database>;
  private sessionId: string | null = null;
  private sequenceCounter: number = 0;

  constructor(env: Env) {
    this.env = env;
    this.db = initDb(env);
  }

  /**
   * Start a new session
   */
  async startSession(sessionData: SessionData): Promise<string> {
    this.sessionId = generateUUID();
    this.sequenceCounter = 0;

    const now = new Date().toISOString();

    try {
      await this.db
        .insertInto('sessions')
        .values({
          id: generateUUID(),
          session_id: this.sessionId,
          request_type: sessionData.requestType,
          request_method: sessionData.requestMethod || null,
          request_path: sessionData.requestPath || null,
          request_headers: sessionData.requestHeaders ? JSON.stringify(sessionData.requestHeaders) : null,
          request_body: sessionData.requestBody || null,
          user_agent: sessionData.userAgent || null,
          client_ip: sessionData.clientIp || null,
          account_id: sessionData.accountId || null,
          user_id: sessionData.userId || null,
          started_at: now,
          completed_at: null,
          duration_ms: null,
          status_code: null,
          response_size: null,
          error_message: null,
          metadata: sessionData.metadata ? JSON.stringify(sessionData.metadata) : null,
          created_at: now,
        })
        .execute();

      // Log the session start action
      await this.logAction({
        actionType: 'session_started',
        actionName: `Session started: ${sessionData.requestType}`,
        inputData: sessionData,
        status: 'info',
      });

    } catch (error: any) {
      console.error('Failed to start session:', error);
      throw error;
    }

    return this.sessionId;
  }

  /**
   * End the current session
   */
  async endSession(statusCode?: number, responseSize?: number, errorMessage?: string): Promise<void> {
    if (!this.sessionId) return;

    const now = new Date().toISOString();
    const startTime = await this.getSessionStartTime();

    let durationMs: number | undefined;
    if (startTime) {
      durationMs = new Date(now).getTime() - new Date(startTime).getTime();
    }

    try {
      await this.db
        .updateTable('sessions')
        .set({
          completed_at: now,
          duration_ms: durationMs || null,
          status_code: statusCode || null,
          response_size: responseSize || null,
          error_message: errorMessage || null,
        })
        .where('session_id', '=', this.sessionId)
        .execute();

      // Log the session end action
      await this.logAction({
        actionType: 'session_completed',
        actionName: `Session completed: ${statusCode || 'unknown'} status`,
        outputData: { statusCode, responseSize, durationMs },
        errorMessage,
        status: errorMessage ? 'failed' : 'completed',
      });

    } catch (error: any) {
      console.error('Failed to end session:', error);
    }

    this.sessionId = null;
    this.sequenceCounter = 0;
  }

  /**
   * Log an action within the current session
   */
  async logAction(actionData: ActionData): Promise<void> {
    if (!this.sessionId) {
      console.warn('Cannot log action: no active session');
      return;
    }

    this.sequenceCounter++;

    const now = new Date().toISOString();

    try {
      await this.db
        .insertInto('actions_log')
        .values({
          id: generateUUID(),
          session_id: this.sessionId,
          action_type: actionData.actionType,
          action_name: actionData.actionName,
          timestamp: now,
          duration_ms: actionData.durationMs || null,
          status: actionData.status || 'completed',
          input_data: actionData.inputData ? this.safeJsonStringify(actionData.inputData) : null,
          output_data: actionData.outputData ? this.safeJsonStringify(actionData.outputData) : null,
          error_message: actionData.errorMessage || null,
          metadata: actionData.metadata ? JSON.stringify(actionData.metadata) : null,
          sequence_number: this.sequenceCounter,
          created_at: now,
        })
        .execute();

    } catch (error: any) {
      console.error('Failed to log action:', error);
      // Don't throw - logging failures shouldn't break the app
    }
  }

  /**
   * Log an API request to Cloudflare
   */
  async logCloudflareApiCall(method: string, endpoint: string, requestData?: any): Promise<string> {
    const actionId = `cloudflare_api_${method}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;

    await this.logAction({
      actionType: 'cloudflare_api_call',
      actionName: `Cloudflare API: ${method} ${endpoint}`,
      inputData: requestData,
      status: 'started',
    });

    return actionId;
  }

  /**
   * Log a Cloudflare API response
   */
  async logCloudflareApiResponse(actionId: string, responseData: any, error?: string): Promise<void> {
    await this.logAction({
      actionType: 'cloudflare_api_response',
      actionName: `Cloudflare API Response`,
      outputData: responseData,
      errorMessage: error,
      status: error ? 'failed' : 'completed',
    });
  }

  /**
   * Log an AI request
   */
  async logAiRequest(model: string, prompt: string, parameters?: any): Promise<string> {
    const actionId = `ai_request_${model}_${Date.now()}`;

    await this.logAction({
      actionType: 'ai_request',
      actionName: `AI Request: ${model}`,
      inputData: { model, prompt, parameters },
      status: 'started',
    });

    return actionId;
  }

  /**
   * Log an AI response
   */
  async logAiResponse(actionId: string, response: any, error?: string): Promise<void> {
    await this.logAction({
      actionType: 'ai_response',
      actionName: `AI Response`,
      outputData: response,
      errorMessage: error,
      status: error ? 'failed' : 'completed',
    });
  }

  /**
   * Log a database query
   */
  async logDatabaseQuery(query: string, parameters?: any, result?: any, error?: string): Promise<void> {
    await this.logAction({
      actionType: 'database_query',
      actionName: `Database Query: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`,
      inputData: { query, parameters },
      outputData: result,
      errorMessage: error,
      status: error ? 'failed' : 'completed',
    });
  }

  /**
   * Log an error
   */
  async logError(errorType: string, errorMessage: string, errorData?: any): Promise<void> {
    await this.logAction({
      actionType: 'error',
      actionName: `Error: ${errorType}`,
      errorMessage,
      inputData: errorData,
      status: 'failed',
    });
  }

  /**
   * Log request received
   */
  async logRequestReceived(method: string, path: string, headers: Record<string, string>, body?: string): Promise<void> {
    await this.logAction({
      actionType: 'request_received',
      actionName: `Request: ${method} ${path}`,
      inputData: { method, path, headers, body },
      status: 'info',
    });
  }

  /**
   * Log response sent
   */
  async logResponseSent(statusCode: number, responseData?: any, responseSize?: number): Promise<void> {
    await this.logAction({
      actionType: 'response_sent',
      actionName: `Response: ${statusCode}`,
      outputData: responseData,
      metadata: { responseSize },
      status: 'completed',
    });
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if there's an active session
   */
  hasActiveSession(): boolean {
    return this.sessionId !== null;
  }

  /**
   * Get session start time
   */
  private async getSessionStartTime(): Promise<string | null> {
    if (!this.sessionId) return null;

    try {
      const result = await this.db
        .selectFrom('sessions')
        .select(['started_at'])
        .where('session_id', '=', this.sessionId)
        .executeTakeFirst();

      return result?.started_at || null;
    } catch (error) {
      console.error('Failed to get session start time:', error);
      return null;
    }
  }

  /**
   * Safely stringify data, truncating if too large
   */
  private safeJsonStringify(data: any, maxLength: number = 10000): string {
    try {
      const jsonString = JSON.stringify(data);
      if (jsonString.length > maxLength) {
        return jsonString.substring(0, maxLength) + '...[truncated]';
      }
      return jsonString;
    } catch (error) {
      return '[unable to stringify]';
    }
  }

  /**
   * Create a middleware function for Hono that automatically logs requests
   */
  createLoggingMiddleware() {
    return async (c: any, next: any) => {
      const loggingService = new LoggingService(c.env);

      // Extract request data
      const requestMethod = c.req.method;
      const requestPath = c.req.path;
      const requestHeaders: Record<string, string> = {};

      // Get common headers
      const headerNames = ['user-agent', 'x-forwarded-for', 'cf-ray', 'x-real-ip', 'authorization'];
      headerNames.forEach(name => {
        const value = c.req.header(name);
        if (value) requestHeaders[name] = value;
      });

      // Extract client IP
      const clientIp = c.req.header('x-forwarded-for') ||
                      c.req.header('x-real-ip') ||
                      c.req.header('cf-connecting-ip') ||
                      'unknown';

      // Extract account ID from environment or request
      const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;

      // Start session
      const sessionData: SessionData = {
        requestType: 'api',
        requestMethod,
        requestPath,
        requestHeaders,
        userAgent: c.req.header('user-agent'),
        clientIp,
        accountId,
      };

      await loggingService.startSession(sessionData);

      // Store logging service in context for use in routes
      c.set('loggingService', loggingService);

      try {
        // Call next middleware/route
        const response = await next();

        // Check if response is a proper Response object
        if (response && typeof response.clone === 'function') {
          // Log response
          const responseBody = await response.clone().text().catch(() => '');
          const responseSize = new Blob([responseBody]).size;

          await loggingService.logResponseSent(
            response.status,
            responseBody.length < 1000 ? responseBody : '[response body too large]',
            responseSize
          );

          // End session
          await loggingService.endSession(response.status, responseSize);
        } else {
          // If not a proper Response, just end the session with basic info
          await loggingService.endSession(200, 0);
        }

        return response;
      } catch (error: any) {
        // Log error
        await loggingService.logError('request_error', error.message, {
          stack: error.stack,
          method: requestMethod,
          path: requestPath,
        });

        // End session with error
        await loggingService.endSession(500, 0, error.message);

        throw error;
      }
    };
  }
}
