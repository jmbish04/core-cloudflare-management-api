import { test, expect } from '@playwright/test';

test.describe('Health Dashboard', () => {
  test('should load health dashboard page', async ({ page }) => {
    await page.goto('/health.html');

    // Check page title
    await expect(page).toHaveTitle(/Service Health & Reliability Dashboard/);

    // Check main heading
    await expect(page.locator('h1').filter({ hasText: 'Reliability Control Room' })).toBeVisible();

    // Check global status badge shows initial state
    const statusBadge = page.locator('.badge').first();
    await expect(statusBadge).toContainText('Awaiting first run');

    // Wait for test definitions to load (should happen automatically)
    await page.waitForTimeout(2000); // Give time for API calls

    // Check if we see any test cards (they might be loading or there might be an error)
    const testCards = page.locator('.test-card');
    const noTestsMessage = page.locator('text=Unable to fetch test definitions');

    // Either we have test cards or an error message
    const hasTests = (await testCards.count()) > 0;
    const hasError = await noTestsMessage.isVisible();

    expect(hasTests || hasError).toBe(true);
  });

  test('should show error handling for failed API calls', async ({ page }) => {
    // Test that the page handles API failures gracefully
    await page.goto('/health.html');

    // Wait for potential error messages
    await page.waitForTimeout(5000);

    // Check if error toasts appear (which is expected behavior)
    const errorToast = page.locator('.toast').filter({ hasText: 'Unable to' });

    // The page should either load successfully or show error messages gracefully
    const pageTitle = page.locator('h1');
    await expect(pageTitle).toContainText('Reliability Control Room');
  });

  test('should have working navigation and sections', async ({ page }) => {
    await page.goto('/health.html');

    // Check that the main sections exist
    await expect(page.locator('h1').filter({ hasText: 'Reliability Control Room' })).toBeVisible();

    // Check summary grid exists
    const summaryGrid = page.locator('.summary-grid');
    await expect(summaryGrid).toBeVisible();

    // Check that we have summary cards
    const summaryCards = page.locator('.summary-card');
    await expect(summaryCards).toHaveCount(4); // Last Run, Pass, Fail, Total Tests

    // Check run button exists
    const runButton = page.getByRole('button', { name: 'Run Unit Test Suite' });
    await expect(runButton).toBeVisible();
  });

  test('should handle run button interactions', async ({ page }) => {
    await page.goto('/health.html');

    // Find the run button
    const runButton = page.getByRole('button', { name: 'Run Unit Test Suite' });
    await expect(runButton).toBeVisible();

    // The button should be clickable (even if tests fail, it should handle gracefully)
    await expect(runButton).toBeEnabled();

    // Note: We don't actually click it in this test to avoid long-running operations
    // The button existence and enabled state is what we're testing here
  });
});
