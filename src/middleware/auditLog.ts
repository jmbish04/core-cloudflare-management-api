import { Context, Next } from 'hono';
import { Env, sanitizeHeaders, generateUUID, truncateString } from '../types';

/**
 * Audit logging middleware
 * Logs request/response data to D1 database and Analytics Engine
 */
export async function auditLogMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const startTime = Date.now();
  const requestId = generateUUID();

  // Store start time and request ID in context
  c.set('startTime' as any, startTime);
  c.set('requestId' as any, requestId);

  // Capture request data
  const requestData = {
    id: requestId,
    timestamp: new Date().toISOString(),
    request_ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null,
    request_method: c.req.method,
    request_url: c.req.url,
    request_headers: JSON.stringify(sanitizeHeaders(c.req.raw.headers)),
    user_agent: c.req.header('user-agent') || null,
    auth_key_used: null as string | null,
    cloudflare_api_target: null as string | null,
  };

  // Capture request body for POST/PUT/PATCH
  let requestBody: string | null = null;
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    try {
      const body = await c.req.text();
      requestBody = truncateString(body, 5000);
      // Re-create request with cloned body for downstream handlers
      c.req.raw = new Request(c.req.url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: body,
      });
    } catch (error) {
      requestBody = '[ERROR READING BODY]';
    }
  }

  // Execute the request
  await next();

  // Capture response data
  const duration = Date.now() - startTime;
  const authKeyUsed = c.get('authKeyUsed' as any) as string | null;
  const apiTarget = c.get('apiTarget' as any) as string | null;

  // Get response body if it's JSON
  let responseBody: string | null = null;
  try {
    const res = c.res;
    if (res.headers.get('content-type')?.includes('application/json')) {
      const clonedRes = res.clone();
      const body = await clonedRes.text();
      responseBody = truncateString(body, 5000);
    }
  } catch (error) {
    // Ignore errors reading response body
  }

  // Prepare audit log entry
  const auditLog = {
    ...requestData,
    request_body: requestBody,
    response_status: c.res.status,
    response_body: responseBody,
    auth_key_used: authKeyUsed,
    cloudflare_api_target: apiTarget,
    duration_ms: duration,
    error_message: c.res.status >= 400 ? responseBody : null,
  };

  // Use waitUntil to write audit log without blocking response
  c.executionCtx.waitUntil(
    (async () => {
      try {
        // Write to D1
        await writeAuditLogToD1(c.env.AUDIT_LOGS_DB, auditLog);

        // Write to Analytics Engine
        await writeToObservability(c.env.OBSERVABILITY_AE, auditLog);
      } catch (error) {
        console.error('Error writing audit log:', error);
      }
    })()
  );
}

/**
 * Write audit log entry to D1 database
 */
async function writeAuditLogToD1(db: D1Database, log: any) {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (
          id, timestamp, request_ip, request_method, request_url,
          request_headers, request_body, response_status, response_body,
          user_agent, auth_key_used, cloudflare_api_target, duration_ms, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        log.id,
        log.timestamp,
        log.request_ip,
        log.request_method,
        log.request_url,
        log.request_headers,
        log.request_body,
        log.response_status,
        log.response_body,
        log.user_agent,
        log.auth_key_used,
        log.cloudflare_api_target,
        log.duration_ms,
        log.error_message
      )
      .run();
  } catch (error) {
    console.error('Error writing to D1:', error);
    throw error;
  }
}

/**
 * Write observability data to Analytics Engine
 */
async function writeToObservability(ae: AnalyticsEngineDataset, log: any) {
  try {
    ae.writeDataPoint({
      doubles: [log.response_status, log.duration_ms || 0],
      blobs: [
        log.request_method,
        log.request_url,
        log.request_ip || 'unknown',
        log.user_agent || 'unknown',
        log.auth_key_used || 'none',
        log.cloudflare_api_target || 'unknown',
      ],
      indexes: [log.request_method, log.cloudflare_api_target || 'unknown'],
    });
  } catch (error) {
    console.error('Error writing to Analytics Engine:', error);
  }
}
