import { test, expect } from '@playwright/test';

test.describe('Authentication & Landing Smoke Tests', () => {
  test('Landing page renders brand wordmark and Google call to action', async ({ page }) => {
    await page.goto('/');

    // Check title and brand wordmark
    await expect(page).toHaveTitle(/Trade Weft/);
    await expect(page.getByText('Trade Weft').first()).toBeVisible();

    // Check hero headline
    await expect(page.getByRole('heading', { name: /Trade your services/i })).toBeVisible();

    // Check CTA links
    const getStartedLink = page.getByRole('link', { name: /Continue with Google/i });
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink).toHaveAttribute('href', '/signup');
  });

  test('Login page renders Google OAuth and email/password form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /Sign In/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();

    // Check email & password inputs
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In with Email/i })).toBeVisible();

    // Verify link to signup
    const createAccountLink = page.getByRole('link', { name: /Create an account/i });
    await expect(createAccountLink).toBeVisible();
  });

  test('Signup page renders Google OAuth, email form, and Terms consent', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('heading', { name: /Create Your Account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();

    // Check email, password, and confirm password inputs
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Account with Email/i })).toBeVisible();

    // Check terms consent notice
    await expect(
      page.getByText(/By creating an account, you agree to our Terms of Service/i)
    ).toBeVisible();
  });

  test('Protected /dashboard redirects unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/dashboard');

    // Should optimistically redirect to login with next parameter
    await expect(page).toHaveURL(/\/login/);
  });

  test('/api/health returns valid JSON liveness status', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();

    expect(data).toHaveProperty('service', 'tradeweft-api');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('version', '0.1.0');
  });
});
