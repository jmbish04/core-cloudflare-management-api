import { Env } from '../types';

/**
 * Database helper functions for API Gateway
 */

export interface ApiMapping {
  id: number;
  permission: string;
  base_path: string;
  verbs?: string;
  description: string | null;
}

/**
 * Get API mapping from api_permissions_map table
 * Searches for permissions that start with the given product name
 */
export async function getApiMapping(env: Env, product: string): Promise<ApiMapping | null> {
  try {
    // Search for permissions that start with the product name
    // e.g., "Workers Scripts:Edit" for product "workers"
    const query = `
      SELECT id, permission, base_path, verbs, description 
      FROM api_permissions_map 
      WHERE permission LIKE ? 
      LIMIT 1
    `;
    
    const result = await env.DB.prepare(query)
      .bind(`${product}%`)
      .first<ApiMapping>();
    
    return result || null;
  } catch (error: any) {
    console.error('Error fetching API mapping:', error);
    return null;
  }
}

/**
 * Get all API mappings for a product (for debugging/listing)
 */
export async function getAllApiMappings(env: Env, product?: string): Promise<ApiMapping[]> {
  try {
    let query = 'SELECT id, permission, base_path, verbs, description FROM api_permissions_map';
    const params: any[] = [];
    
    if (product) {
      query += ' WHERE permission LIKE ?';
      params.push(`${product}%`);
    }
    
    query += ' ORDER BY permission';
    
    const result = await env.DB.prepare(query)
      .bind(...params)
      .all<ApiMapping>();
    
    return result.results || [];
  } catch (error: any) {
    console.error('Error fetching API mappings:', error);
    return [];
  }
}

