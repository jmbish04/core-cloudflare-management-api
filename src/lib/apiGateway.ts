import { Env } from '../types';
import { getApiMapping } from './db';

export interface MetaApiCallRequest {
  product: string;
  action?: string; // Optional semantic action name (for documentation)
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; // Optional - will be inferred from action if not provided
  params?: Record<string, any>; // Path/query parameters
  body?: Record<string, any>; // Request body for POST/PUT/PATCH
}

export interface MetaApiCallResponse {
  status: number;
  data: any;
  headers?: Record<string, string>;
}

/**
 * Default HTTP methods for common actions
 * Used to infer method from action if not provided
 */
const defaultMethods: Record<string, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> = {
  list: 'GET',
  list_scripts: 'GET',
  list_buckets: 'GET',
  list_databases: 'GET',
  list_namespaces: 'GET',
  list_indexes: 'GET',
  list_models: 'GET',
  create: 'POST',
  create_bucket: 'POST',
  create_database: 'POST',
  create_namespace: 'POST',
  create_index: 'POST',
  deploy: 'POST',
  run: 'POST',
  execute: 'POST',
  update: 'PUT',
  modify: 'PATCH',
  delete: 'DELETE',
  remove: 'DELETE',
};

/**
 * Infer HTTP method from action if not provided
 */
function inferMethod(action?: string, providedMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  if (providedMethod) {
    return providedMethod;
  }
  
  if (action) {
    // Try exact match first
    if (defaultMethods[action]) {
      return defaultMethods[action];
    }
    
    // Try prefix match (e.g., "list_*" → GET)
    const lowerAction = action.toLowerCase();
    if (lowerAction.startsWith('list')) return 'GET';
    if (lowerAction.startsWith('create') || lowerAction.startsWith('deploy') || lowerAction.startsWith('run')) return 'POST';
    if (lowerAction.startsWith('update')) return 'PUT';
    if (lowerAction.startsWith('modify')) return 'PATCH';
    if (lowerAction.startsWith('delete') || lowerAction.startsWith('remove')) return 'DELETE';
  }
  
  // Default to GET for read operations
  return 'GET';
}

/**
 * Call Cloudflare API dynamically using product name and parameters
 * 
 * @param env - Worker environment with DB and CLOUDFLARE_TOKEN
 * @param request - Meta API call request with product, method, params, and body
 * @returns Cloudflare API response
 */
export async function callCloudflareAPI(
  env: Env,
  request: MetaApiCallRequest
): Promise<MetaApiCallResponse> {
  let { product, action, method, params = {}, body = {} } = request;
  
  // Normalize product name (lowercase)
  product = product.toLowerCase();
  
  // Infer method from action if not provided
  method = inferMethod(action, method);

  // 1. Look up API mapping from D1
  const mapping = await getApiMapping(env, product);
  
  if (!mapping) {
    throw new Error(`No API mapping found for product: ${product}`);
  }

  const { base_path } = mapping;

  // 2. Construct the API path by replacing placeholders
  let path = base_path;
  const queryParams: Record<string, any> = {};
  
  // Replace {account_id} with actual account ID
  if (path.includes('{account_id}')) {
    path = path.replace('{account_id}', env.CLOUDFLARE_ACCOUNT_ID);
  }
  
  // Replace {zone_id} if provided in params
  if (path.includes('{zone_id}')) {
    if (!params.zone_id) {
      throw new Error('zone_id parameter is required for this endpoint');
    }
    path = path.replace('{zone_id}', params.zone_id);
  }
  
  // Replace other path parameters from params and collect query params
  for (const [key, value] of Object.entries(params)) {
    const placeholder = `{${key}}`;
    if (path.includes(placeholder)) {
      path = path.replace(placeholder, encodeURIComponent(String(value)));
    } else {
      // This is a query parameter, not a path parameter
      queryParams[key] = value;
    }
  }

  // 3. Build the full URL
  const baseUrl = 'https://api.cloudflare.com/client/v4';
  const url = new URL(`${baseUrl}${path}`);
  
  // 4. Add remaining params as query string (for GET requests)
  if (method === 'GET' && Object.keys(queryParams).length > 0) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  // 5. Prepare request options
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${env.CLOUDFLARE_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  // 6. Add body for non-GET/DELETE methods
  if (!['GET', 'DELETE'].includes(method)) {
    if (Object.keys(body).length > 0) {
      fetchOptions.body = JSON.stringify(body);
    }
  }

  // 7. Execute the request
  const response = await fetch(url.toString(), fetchOptions);
  
  // 8. Parse response
  let data: any;
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // 9. Return structured response
  return {
    status: response.status,
    data,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

