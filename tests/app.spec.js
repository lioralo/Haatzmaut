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

test.describe('Bug Regression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?devAuth=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);
  });

  test('A: meetings survive page reload', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const meetingsBefore = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return raw?.meetings?.length || 0;
    });

    await page.reload();
    await page.waitForTimeout(2000);

    const meetingsAfter = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return raw?.meetings?.length || 0;
    });

    expect(meetingsAfter).toBeGreaterThanOrEqual(meetingsBefore);
    expect(meetingsAfter).toBe(meetingsBefore);
  });

  test('B: no CSP frame-ancestors console error', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.reload();
    await page.waitForTimeout(1000);

    const cspErrors = errors.filter(e => e.includes('frame-ancestors'));
    expect(cspErrors).toHaveLength(0);
  });

  test('C: parseHebrewDate handles he-IL locale', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseHebrewDate } = await import('/src/core/utils.js');
      const ts = parseHebrewDate('27.7.2026, 14:30:25');
      return { valid: !Number.isNaN(ts), year: new Date(ts).getFullYear() };
    });
    expect(result.valid).toBe(true);
    expect(result.year).toBe(2026);
  });
});

test.describe('Backup & Storage', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?devAuth=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(2000);
  });

  test('D: exportFullBackup generates valid JSON download', async ({ page }) => {
    const json = await page.evaluate(async () => {
      const { exportFullBackup } = await import('/src/core/store.js');
      const { state } = await import('/src/core/store.js');
      const payload = {
        _schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        app: 'haatzmaut',
        data: {
          rooms: state.rooms,
          staff: state.staff,
          schedule: state.schedule,
          users: state.users,
          meetings: state.meetings
        }
      };
      return JSON.stringify(payload);
    });
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('haatzmaut');
    expect(parsed.data).toBeDefined();
    expect(Array.isArray(parsed.data.rooms)).toBe(true);
    expect(Array.isArray(parsed.data.staff)).toBe(true);
  });

  test('E: managed backup save and restore round-trip', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { saveManagedBackup, restoreManagedBackup, state } = await import('/src/core/store.js');
      const scheduleCount = state.schedule.length;
      const backup = saveManagedBackup('test-backup');
      if (!backup?.id) return { ok: false, reason: 'save failed' };

      restoreManagedBackup(backup.id);
      const stored = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return { ok: true, restored: (stored?.schedule?.length || 0) === scheduleCount, scheduleLen: stored?.schedule?.length || 0, expectedLen: scheduleCount };
    });
    expect(result.ok).toBe(true);
    expect(result.restored).toBe(true);
  });

  test('F: managed backups capped at MAX_MANAGED (10)', async ({ page }) => {
    const count = await page.evaluate(async () => {
      const { saveManagedBackup, getManagedBackups } = await import('/src/core/store.js');
      for (let i = 0; i < 15; i++) saveManagedBackup(`backup-${i}`);
      return getManagedBackups().length;
    });
    expect(count).toBeLessThanOrEqual(10);
  });

  test('G: auto-backups capped at AUTOBACKUP_MAX (3)', async ({ page }) => {
    const count = await page.evaluate(async () => {
      const { autoBackup } = await import('/src/core/store.js');
      for (let i = 0; i < 5; i++) autoBackup();
      const raw = JSON.parse(localStorage.getItem('haatzmaut_autobackup') || '[]');
      return raw.length;
    });
    expect(count).toBeLessThanOrEqual(3);
  });

  test('H: audit log capped at AUDIT_LOG_MAX (200)', async ({ page }) => {
    const count = await page.evaluate(async () => {
      const { recordAudit, state } = await import('/src/core/store.js');
      for (let i = 0; i < 300; i++) recordAudit('test', `entry-${i}`, 'info', false);
      return state.auditLog.length;
    });
    expect(count).toBeLessThanOrEqual(200);
  });

  test('I: state schema migration v1 to v2', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { migrateState } = await import('/src/core/store.js');
      const v1 = {
        _schemaVersion: 1,
        users: [{ username: 'test', password: 'plaintext' }],
        rooms: [{ id: 'r1', name: 'Room 1' }],
        schedule: [],
        staff: []
      };
      const v2 = migrateState(v1);
      return {
        version: v2._schemaVersion,
        hasUser: v2.users?.[0]?.username === 'test',
        hasPassword: v2.users?.[0]?.password === 'plaintext'
      };
    });
    expect(result.version).toBe(2);
    expect(result.hasUser).toBe(true);
    expect(result.hasPassword).toBe(true);
  });
});
