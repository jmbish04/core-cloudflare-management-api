import { test, expect } from '@playwright/test';

/**
 * Tests for migration 0016: Merge health_checks into health_test_results
 * Verifies that:
 * 1. Legacy health_checks table no longer exists
 * 2. health_test_results has the new columns (endpoint, overall_status)
 * 3. Data was backfilled correctly
 */

test.describe('Migration 0016: Health Checks Merge', () => {
  test('should have dropped legacy health_checks table', async ({ request }) => {
    // Try to query the legacy table - should fail or return empty
    const response = await request.get('/health/db/query?table=health_checks');
    
    // Expect either 404 (table doesn't exist) or an error response
    expect(response.status()).not.toBe(200);
  });

  test('should have endpoint and overall_status columns in health_test_results', async ({ request }) => {
    // Get test results to verify schema
    const response = await request.get('/health/tests/results?limit=1');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // If there are results, verify they have the new fields
    if (data.results && data.results.length > 0) {
      const firstResult = data.results[0];
      
      // Check that endpoint field exists (can be null for new records)
      expect(firstResult).toHaveProperty('endpoint');
      
      // Check that overall_status field exists (can be null for new records)
      expect(firstResult).toHaveProperty('overall_status');
    }
  });

  test('should have backfilled endpoint from health_tests.name', async ({ request }) => {
    // Get test results
    const response = await request.get('/health/tests/results?limit=10');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Verify that results have endpoint populated
    if (data.results && data.results.length > 0) {
      const resultsWithEndpoint = data.results.filter((r: any) => r.endpoint);
      
      // At least some results should have endpoint backfilled
      // (New results created after migration will have it set directly)
      expect(resultsWithEndpoint.length).toBeGreaterThan(0);
      
      // Verify endpoint matches the test name from the joined health_test
      for (const result of resultsWithEndpoint) {
        if (result.health_test && result.health_test.name) {
          expect(result.endpoint).toBe(result.health_test.name);
        }
      }
    }
  });

  test('should maintain referential integrity with health_tests', async ({ request }) => {
    // Get test results with definitions
    const response = await request.get('/health/tests/with-results');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Verify all results have valid health_test references
    if (data.tests && data.tests.length > 0) {
      for (const testWithResult of data.tests) {
        expect(testWithResult).toHaveProperty('test');
        expect(testWithResult.test).toHaveProperty('id');
        
        // If there's a latest result, verify it references the test correctly
        if (testWithResult.latest_result) {
          expect(testWithResult.latest_result.health_test_id).toBe(testWithResult.test.id);
        }
      }
    }
  });

  test('should have all required fields in health_test_results', async ({ request }) => {
    // Run a health check to generate fresh results
    const checkResponse = await request.post('/health/run');
    expect(checkResponse.ok()).toBeTruthy();
    
    const checkData = await checkResponse.json();
    
    // Get the latest results
    const resultsResponse = await request.get(`/health/tests/results?run_group_id=${checkData.check_group_id}`);
    expect(resultsResponse.ok()).toBeTruthy();
    
    const resultsData = await resultsResponse.json();
    
    // Verify all required fields are present
    if (resultsData.results && resultsData.results.length > 0) {
      for (const result of resultsData.results) {
        // Core fields
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('health_test_id');
        expect(result).toHaveProperty('run_group_id');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('status_text');
        expect(result).toHaveProperty('response_time_ms');
        expect(result).toHaveProperty('outcome');
        expect(result).toHaveProperty('run_at');
        
        // New fields from migration 0016
        expect(result).toHaveProperty('endpoint');
        expect(result).toHaveProperty('overall_status');
        
        // Verify endpoint is populated for new results
        expect(result.endpoint).toBeTruthy();
      }
    }
  });
});

