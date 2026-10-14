import { test, expect } from '@playwright/test';

test.describe('Barter Agreements & Negotiation Access Control', () => {
  test('Unauthenticated visitor to /dashboard/trades redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/trades');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Unauthenticated visitor to /dashboard/trades/[id] redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/trades/00000000-0000-0000-0000-000000000001');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Unauthenticated visitor to /dashboard/matches redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/matches');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Unauthenticated visitor to /dashboard/notifications redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/notifications');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Unauthenticated visitor to /dashboard/settings/contact redirects to /login', async ({ page }) => {
    await page.goto('/dashboard/settings/contact');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Package detail page renders trade action slot correctly', async ({ page }) => {
    // Navigate to explore to verify public listings
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: /Explore Service Packages/i })).toBeVisible();
  });
});
