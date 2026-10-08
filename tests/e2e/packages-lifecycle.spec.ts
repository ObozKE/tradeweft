import { test, expect } from '@playwright/test';

test.describe('Service Packages & Matchmaking Public Flows', () => {
  test('Public /explore renders marketplace heading, search input, and filter controls', async ({
    page,
  }) => {
    await page.goto('/explore');

    // Title and headings
    await expect(page).toHaveTitle(/Explore B2B Service Packages/i);
    await expect(
      page.getByRole('heading', { name: /Explore Service Packages/i })
    ).toBeVisible();

    // Search and filter controls
    await expect(page.locator('#searchQuery')).toBeVisible();
    await expect(page.locator('#filterCategory')).toBeVisible();
    await expect(page.locator('#filterCity')).toBeVisible();

    // Mode filter buttons
    await expect(page.getByRole('button', { name: 'Remote' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In-person' })).toBeVisible();
  });

  test('Search input updates URL searchParams on /explore', async ({ page }) => {
    await page.goto('/explore');

    const searchInput = page.locator('#searchQuery');
    await searchInput.fill('Web Development');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/q=Web\+Development|q=Web%20Development/);
  });

  test('Delivery mode filter updates mode param in URL', async ({ page }) => {
    await page.goto('/explore');

    const remoteButton = page.getByRole('button', { name: 'Remote' });
    await remoteButton.click();

    const applyButton = page.getByRole('button', { name: /Apply Filters/i });
    if (await applyButton.isVisible()) {
      await applyButton.click();
    }

    await expect(page).toHaveURL(/mode=remote/);
  });

  test('Unauthenticated provider visit to /dashboard/packages redirects to /login', async ({
    page,
  }) => {
    await page.goto('/dashboard/packages');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Non-existent or unpublished package detail returns 404', async ({ page }) => {
    const response = await page.goto('/packages/00000000-0000-0000-0000-000000000000/sample-slug');
    expect(response?.status()).toBe(404);
  });

  test('Dynamic sitemap at /sitemap.xml returns valid XML containing /explore', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('<urlset');
    expect(text).toContain('/explore');
  });
});
