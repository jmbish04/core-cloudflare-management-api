// src/services/apiClient.ts
import { LoggingService } from '../../services/logging';

/**
 * Configuration for Cloudflare API authentication.
 */
export type CloudflareAuthConfig =
  | {
      apiToken: string;
    }
  | {
      apiKey: string;
      email: string;
    };

/**
 * A standard Cloudflare API response wrapper.
 */
export interface CloudflareApiResponse<T> {
  result: T;
  success: boolean;
  errors: CloudflareApiError[];
  messages: string[];
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
  };
}

/**
 * A standard Cloudflare API error object.
 */
export interface CloudflareApiError {
  code: number;
  message: string;
  error_chain?: {
    code: number;
    message: string;
  }[];
}

/**
 * Custom error class for API client failures.
 * This includes the HTTP status code, which allows
 * Hono handlers to check for 404s, 401s, etc.
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * A lightweight, dependency-free TypeScript client for the Cloudflare v4 API.
 */
export class CloudflareApiClient {
  private baseUrl: string;
  private authConfig: CloudflareAuthConfig;
  private loggingService?: LoggingService;

  constructor(authConfig: CloudflareAuthConfig, baseUrl: string = 'https://api.cloudflare.com/client/v4', loggingService?: LoggingService) {
    if (
      !authConfig ||
      (!('apiToken' in authConfig) &&
        !('apiKey' in authConfig && 'email' in authConfig))
    ) {
      throw new Error(
        'Invalid authentication config. Must provide either { apiToken } or { apiKey, email }.'
      );
    }
    this.authConfig = authConfig;
    this.baseUrl = baseUrl;
    this.loggingService = loggingService;
  }

  private getAuthHeaders(): Headers {
    const headers = new Headers();
    if ('apiToken' in this.authConfig) {
      headers.set('Authorization', `Bearer ${this.authConfig.apiToken}`);
    } else {
      headers.set('X-Auth-Key', this.authConfig.apiKey);
      headers.set('X-Auth-Email', this.authConfig.email);
    }
    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorBody: any;
      let errorMessage = `API request failed with status ${response.status}`;

      try {
        errorBody = (await response.json()) as { errors: CloudflareApiError[] };
        if (errorBody.errors && Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
          const firstError = errorBody.errors[0];
          errorMessage = `${firstError.message} (Code: ${firstError.code})`;
        }
      } catch (e) {
        errorMessage = response.statusText;
      }
      
      // Throw the custom error with status
      throw new ApiClientError(errorMessage, response.status, errorBody);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { success: true } as unknown as T;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    
    return response.text() as unknown as Promise<T>;
  }

  public async rawRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getAuthHeaders();

    headers.set('Accept', 'application/json');
    const hasContentType =
      options.headers instanceof Headers
        ? options.headers.has('content-type')
        : Array.isArray(options.headers)
        ? options.headers.some(([key]) => key.toLowerCase() === 'content-type')
        : typeof options.headers === 'object' && options.headers !== null
        ? Object.keys(options.headers).some((key) => key.toLowerCase() === 'content-type')
        : false;

    if (options.body && !hasContentType) {
      headers.set('Content-Type', 'application/json');
    }

    if (options.headers) {
      const userHeaders = new Headers(options.headers);
      userHeaders.forEach((value, key) => headers.set(key, value));
    }

    return fetch(url, { ...options, headers });
  }

  public async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    options: RequestInit = {}
  ): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        searchParams.append(key, String(value));
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const startTime = Date.now();
    let actionId: string | undefined;

    try {
      // Log API call start
      if (this.loggingService) {
        actionId = await this.loggingService.logCloudflareApiCall('GET', `${this.baseUrl}${url}`, params);
      }

      const response = await this.rawRequest(url, { ...options, method: 'GET' });
      const result = await this.handleResponse<T>(response);

      // Log API call success
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, result);
      }

      return result;
    } catch (error) {
      // Log API call failure
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, null, (error as Error).message);
      }
      throw error;
    }
  }

  public async post<T>(endpoint: string, body: any): Promise<T> {
    let actionId: string | undefined;

    try {
      // Log API call start
      if (this.loggingService) {
        actionId = await this.loggingService.logCloudflareApiCall('POST', `${this.baseUrl}${endpoint}`, body);
      }

      const response = await this.rawRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const result = await this.handleResponse<T>(response);

      // Log API call success
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, result);
      }

      return result;
    } catch (error) {
      // Log API call failure
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, null, (error as Error).message);
      }
      throw error;
    }
  }

  public async put<T>(endpoint: string, body: any): Promise<T> {
    let actionId: string | undefined;

    try {
      // Log API call start
      if (this.loggingService) {
        actionId = await this.loggingService.logCloudflareApiCall('PUT', `${this.baseUrl}${endpoint}`, body);
      }

      const response = await this.rawRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const result = await this.handleResponse<T>(response);

      // Log API call success
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, result);
      }

      return result;
    } catch (error) {
      // Log API call failure
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, null, (error as Error).message);
      }
      throw error;
    }
  }

  public async patch<T>(endpoint: string, body: any): Promise<T> {
    let actionId: string | undefined;

    try {
      // Log API call start
      if (this.loggingService) {
        actionId = await this.loggingService.logCloudflareApiCall('PATCH', `${this.baseUrl}${endpoint}`, body);
      }

      const response = await this.rawRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const result = await this.handleResponse<T>(response);

      // Log API call success
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, result);
      }

      return result;
    } catch (error) {
      // Log API call failure
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, null, (error as Error).message);
      }
      throw error;
    }
  }

  public async delete<T>(endpoint: string, body?: any): Promise<T> {
    let actionId: string | undefined;

    try {
      // Log API call start
      if (this.loggingService) {
        actionId = await this.loggingService.logCloudflareApiCall('DELETE', `${this.baseUrl}${endpoint}`, body);
      }

      const options: RequestInit = { method: 'DELETE' };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await this.rawRequest(endpoint, options);
      const result = await this.handleResponse<T>(response);

      // Log API call success
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, result);
      }

      return result;
    } catch (error) {
      // Log API call failure
      if (this.loggingService && actionId) {
        await this.loggingService.logCloudflareApiResponse(actionId, null, (error as Error).message);
      }
      throw error;
    }
  }
}
