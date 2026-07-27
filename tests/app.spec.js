import { test, expect } from '@playwright/test';

test.describe('Haatzmaut Clinic System', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?devAuth=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test('RTL direction is set correctly', async ({ page }) => {
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
    expect(await page.locator('html').getAttribute('lang')).toBe('he');
  });

  test('login page is visible', async ({ page }) => {
    await expect(page.locator('#loginSection')).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#langSwitchBtnLogin')).toBeVisible();
    await expect(page.locator('a[href="accessibility.html"]')).toBeVisible();
  });

  test('login with dev credentials', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#appSection')).toBeVisible();
    await expect(page.locator('#sessionBar')).toBeVisible();
    expect(await page.locator('#activeUser').textContent()).toContain('מחובר');
  });

  test('invalid login shows error', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrong');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('#loginError')).toBeVisible();
  });

  test('admin can see sidebar after login', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#appSection')).toBeVisible();
    await expect(page.locator('button[data-tab="adminTab"]').first()).toBeVisible();
  });

  test('occupancy table renders with ARIA grid role', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#occupancyTable')).toBeVisible();
    expect(await page.locator('#occupancyTable').getAttribute('role')).toBe('grid');
    expect(await page.locator('#occupancyTable').getAttribute('aria-label')).toBe('לוח הזמנות יומי');
  });

  test('day tabs are interactive', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(3000);
    const dayTab = page.locator('.day-tab').first();
    await expect(dayTab).toBeVisible();
    await dayTab.click();
    await expect(dayTab).toHaveClass(/active/);
  });

  test('language switch button exists', async ({ page }) => {
    await expect(page.locator('#langSwitchBtnLogin')).toBeVisible();
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await expect(page.locator('#langSwitchBtn')).toBeVisible();
  });

  test('accessibility statement page loads', async ({ page }) => {
    await page.goto('/accessibility.html');
    await expect(page.locator('h1')).toContainText('הצהרת נגישות');
    await expect(page.locator('.a11y-statement')).toBeVisible();
  });

  test('display screen loads', async ({ page }) => {
    await page.goto('/display.html');
    await expect(page.locator('#nowTime')).toBeVisible();
    await expect(page.locator('#displayTable')).toBeVisible();
  });
});
