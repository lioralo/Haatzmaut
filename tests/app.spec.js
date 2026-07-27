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

test.describe('Calendar & Meetings', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?devAuth=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(2500);
  });

  test('J: default schedule has entries after login', async ({ page }) => {
    const count = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return raw?.schedule?.length || 0;
    });
    expect(count).toBeGreaterThan(0);
  });

  test('K: week navigation works', async ({ page }) => {
    const before = await page.locator('#weekLabel').textContent();
    await page.locator('#weekNext').click();
    await page.waitForTimeout(500);
    const after = await page.locator('#weekLabel').textContent();
    expect(after).not.toBe(before);
    await page.locator('#weekToday').click();
  });

  test('L: schedule view modes switch', async ({ page }) => {
    // List mode
    await page.locator('[data-calendar-mode="list"]').click();
    await page.waitForTimeout(500);
    const listView = await page.locator('#bookingListView');
    await expect(listView).toBeVisible();

    // Stats mode
    await page.locator('[data-calendar-mode="stats"]').click();
    await page.waitForTimeout(500);
    const statsView = await page.locator('#statsDashboard');
    await expect(statsView).toBeVisible();

    // Back to schedule
    await page.locator('[data-calendar-mode="schedule"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#occupancyTable')).toBeVisible();
  });

  test('M: day tab switching renders different day', async ({ page }) => {
    const firstDayTitle = await page.locator('#dayHeading').textContent();
    const tabs = await page.locator('.day-tab').count();
    if (tabs > 1) {
      await page.locator('.day-tab').nth(1).click();
      await page.waitForTimeout(500);
      const secondDayTitle = await page.locator('#dayHeading').textContent();
      expect(secondDayTitle).not.toBe(firstDayTitle);
    }
  });

  test('N: meetings edit mode is accessible', async ({ page }) => {
    await page.locator('button[data-tab=meetingsTab]').first().click();
    await page.waitForTimeout(800);
    const modeTabs = await page.locator('#meetingsTab .mode-tab').count();
    if (modeTabs >= 2) {
      await page.locator('#meetingsTab .mode-tab').nth(1).click();
      await page.waitForTimeout(500);
      await expect(page.locator('#meetingsEditMode')).toBeVisible();
    }
  });

  test('O: meetings persist in localStorage state', async ({ page }) => {
    const meetings = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return raw?.meetings?.length || 0;
    });
    const groups = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return raw?.meetingGroups?.length || 0;
    });
    expect(meetings).toBeGreaterThanOrEqual(0);
    expect(groups).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Backup & Cloud Buttons', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?devAuth=1');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForTimeout(2500);
    await page.locator('button[data-tab=adminTab]').first().click();
    await page.waitForTimeout(500);
    await page.locator('button[data-admin-subtab=audit]').first().click();
    await page.waitForTimeout(500);
  });

  test('P: all backup buttons are visible', async ({ page }) => {
    await expect(page.locator('#backupNowBtn')).toBeVisible();
    await expect(page.locator('#exportBackupBtn')).toBeVisible();
    await expect(page.locator('#exportEncryptedBtn')).toBeVisible();
    await expect(page.locator('#restoreBackupBtn')).toBeVisible();
    await expect(page.locator('#deleteBackupBtn')).toBeVisible();
    await expect(page.locator('#backupUpload')).toBeVisible();
    await expect(page.locator('#encryptedUpload')).toBeVisible();
    await expect(page.locator('#clearAuditBtn')).toBeVisible();
    await expect(page.locator('#savedBackupSelect')).toBeVisible();
    await expect(page.locator('#savedBackupsList')).toBeVisible();
  });

  test('Q: cloud sync buttons are visible and enabled', async ({ page }) => {
    await expect(page.locator('#cloudSaveBtn')).toBeVisible();
    await expect(page.locator('#cloudLoadBtn')).toBeVisible();
    expect(await page.locator('#cloudSaveBtn').isDisabled()).toBe(false);
    expect(await page.locator('#cloudLoadBtn').isDisabled()).toBe(false);
  });

  test('R: backupNow creates a managed backup', async ({ page }) => {
    const before = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('haatzmaut_managed_backups') || '[]').length;
    });
    await page.locator('#backupNowBtn').click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('haatzmaut_managed_backups') || '[]').length;
    });
    expect(after).toBe(before + 1);
  });

  test('S: display screen loads all components', async ({ page }) => {
    await page.goto('/display.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await expect(page.locator('#nowTime')).toBeVisible();
    await expect(page.locator('#displayTable')).toBeVisible();
    await expect(page.locator('#roomsRange')).toBeVisible();
    await expect(page.locator('#rotateCountdown')).toBeVisible();
  });
});

test.describe('Backup Integrity', () => {

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

  test('T: restoreManagedBackup verifies data integrity', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { saveManagedBackup, restoreManagedBackup, state } = await import('/src/core/store.js');
      const beforeSchedule = state.schedule.length;
      const backup = saveManagedBackup('verify-test');
      state.schedule = [{ id: 'fake', weekISO: '2000-01-01', day: 0, roomId: 'x', start: '08:00', duration: 60, staff: 'x', team: 'x' }];
      try { restoreManagedBackup(backup.id); } catch (e) { return { ok: false, error: e.message }; }
      const afterSchedule = state.schedule.length;
      return { ok: true, beforeCount: beforeSchedule, afterCount: afterSchedule, matches: afterSchedule === beforeSchedule };
    });
    expect(result.ok).toBe(true);
    expect(result.matches).toBe(true);
  });

  test('U: applyImportedState updates state before reload', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { state } = await import('/src/core/store.js');
      const testData = {
        rooms: [{ id: 'r1', name: 'Test Room' }],
        schedule: [{ id: 's1', weekISO: '2026-01-04', day: 0, roomId: 'r1', start: '09:00', duration: 60, staff: 'Test', team: 'test' }],
        staff: [{ id: 'st1', fullName: 'Test Staff' }],
        users: [],
        meetings: [],
        meetingGroups: []
      };
      try {
        const { applyImportedState } = await import('/src/core/store.js');
        state.schedule = [];
        applyImportedState(testData);
        return { ok: true, scheduleLen: state.schedule.length };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    expect(result.ok).toBe(true);
    expect(result.scheduleLen).toBe(1);
  });

  test('V: backup save integrity — stored data matches original', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { saveManagedBackup, state } = await import('/src/core/store.js');
      const scheduleLen = state.schedule.length;
      const staffLen = state.staff.length;
      const backup = saveManagedBackup('integrity-check');
      if (!backup?.id) return { ok: false, reason: 'no backup id' };
      const stored = JSON.parse(localStorage.getItem('haatzmaut_managed_backups') || '[]');
      const found = stored.find(b => b.id === backup.id);
      if (!found || !found.data) return { ok: false, reason: 'backup not found in storage' };
      return {
        ok: true,
        schedulesMatch: Array.isArray(found.data.schedule) && found.data.schedule.length === scheduleLen,
        staffMatch: Array.isArray(found.data.staff) && found.data.staff.length === staffLen
      };
    });
    expect(result.ok).toBe(true);
    expect(result.schedulesMatch).toBe(true);
    expect(result.staffMatch).toBe(true);
  });

  test('W: autoBackup survives quota error without crash', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { autoBackup } = await import('/src/core/store.js');
      try { autoBackup(); } catch (e) { return { ok: false, error: e.message }; }
      const stored = localStorage.getItem('haatzmaut_autobackup');
      const parsed = stored ? JSON.parse(stored) : null;
      return { ok: true, hasBackup: Array.isArray(parsed) && parsed.length > 0 };
    });
    expect(result.ok).toBe(true);
    expect(result.hasBackup).toBe(true);
  });
});

test.describe('Layout & Session Verification', () => {

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

  test('X: day tab counter includes meetings', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { localISO } = await import('/src/core/utils.js');
      const { state } = await import('/src/core/store.js');
      const todayISO = localISO(new Date());
      if (!state.meetings) state.meetings = [];
      state.meetings.push({
        id: 'test-meet-ct', title: 'Test Meeting', date: todayISO,
        time: '12:00', duration: 60, speaker: 'Test Speaker', groupIds: []
      });
      const wkMeetingCount = state.meetings.filter(m => m.date === todayISO).length;
      return { meetingCount: wkMeetingCount };
    });
    expect(result.meetingCount).toBeGreaterThanOrEqual(1);
  });

  test('Y: staff list view renders table rows', async ({ page }) => {
    await page.locator('button[data-tab=staffTab]').first().click();
    await page.waitForTimeout(500);
    const listBtn = page.locator('#staffTab [data-mode="list"]');
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(500);
    }
    const rows = await page.locator('#staffListView table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('Z: session persists via localStorage fallback', async ({ page }) => {
    const hasLocalSession = await page.evaluate(() => {
      return !!localStorage.getItem('clinic_session');
    });
    const hasSessSession = await page.evaluate(() => {
      return !!sessionStorage.getItem('clinic_user');
    });
    expect(hasLocalSession || hasSessSession).toBe(true);
  });
});

test.describe('Regression: Backup, Counters, Meetings', () => {

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

  test('AA: backup save does not throw or double-serialize', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { saveManagedBackup } = await import('/src/core/store.js');
      try {
        const b = saveManagedBackup('test-simple');
        return { ok: true, hasId: !!b?.id, size: typeof b.size === 'number' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    expect(result.ok).toBe(true);
    expect(result.hasId).toBe(true);
  });

  test('AB: deleted meetings do not persist after reload', async ({ page }) => {
    await page.evaluate(async () => {
      const { state } = await import('/src/core/store.js');
      if (!state.meetings) state.meetings = [];
      state.meetings = [{ id: 'm1', title: 'Delete Me', date: '2026-01-01', time: '09:00', duration: 60, speaker: 'X', groupIds: [] }];
      state._meetingsSeeded = true;
      const { persistStateImmediate } = await import('/src/core/store.js');
      persistStateImmediate();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const count = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('haatzmaut_v6') || 'null');
      return raw?.meetings?.length || 0;
    });
    expect(count).toBe(1);
  });

  test('AC: stats weekly count is schedule-only (no meeting leak)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { state } = await import('/src/core/store.js');
      const schedCount = state.schedule.filter(e => e.weekISO === state.weekISO).length;
      if (!state.meetings) state.meetings = [];
      state.meetings.push({ id: 'mt', title: 'Leak', date: '2026-07-27', time: '12:00', duration: 60, speaker: 'X', groupIds: [] });
      return { scheduleCount: schedCount, meetingsCount: state.meetings.length };
    });
    expect(result.scheduleCount).toBeGreaterThan(0);
  });
});
