import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
class Storage {
  constructor(data = {}) { this.values = new Map(Object.entries(data)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
for (const app of ['frontend', 'apy-android']) {
  const source = (await readFile(`${root}/${app}/src/updateChecker.js`, 'utf8'))
    .replace(/import \{ Capacitor, registerPlugin \} from '@capacitor\/core';/, 'const Capacitor = {isNativePlatform: () => false}; const registerPlugin = () => ({});');
  const update = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const current = update.CURRENT_APP_VERSION;
  const cached = (latestVersion, currentVersion = '1.0.0') => new Storage({
    apy_has_update_badge: 'true',
    apy_update_check_cache: JSON.stringify({timestamp: Date.now(), data: {hasUpdate: true, currentVersion, latestVersion}}),
  });
  test(`${app}: upgrading clears old release banner before any network request`, () => {
    globalThis.localStorage = cached('1.0.0');
    assert.equal(update.getCachedAppUpdate().hasUpdate, false);
    assert.equal(localStorage.getItem('apy_has_update_badge'), null);
  });
  test(`${app}: equal-version cached banner is cleared`, () => {
    globalThis.localStorage = cached(current, current);
    assert.equal(update.getCachedAppUpdate().hasUpdate, false);
    assert.equal(localStorage.getItem('apy_has_update_badge'), null);
  });
  test(`${app}: genuine newer release remains available offline`, async () => {
    globalThis.localStorage = cached('99.0.0');
    globalThis.fetch = async () => ({ok: false});
    assert.equal(update.getCachedAppUpdate().hasUpdate, true);
    assert.equal((await update.checkForAppUpdate(true)).hasUpdate, true);
  });
  test(`${app}: fresh up-to-date result clears an existing badge`, async () => {
    globalThis.localStorage = cached('99.0.0');
    globalThis.fetch = async () => ({ok: true, json: async () => ({tag_name: `v${current}`, assets: []})});
    assert.equal((await update.checkForAppUpdate(true)).hasUpdate, false);
    assert.equal(localStorage.getItem('apy_has_update_badge'), null);
  });
  test(`${app}: corrupt cache and orphaned badge do not show updates`, () => {
    globalThis.localStorage = new Storage({apy_has_update_badge: 'true', apy_update_check_cache: 'broken'});
    assert.equal(update.getCachedAppUpdate(), null);
    assert.equal(localStorage.getItem('apy_has_update_badge'), null);
  });
}
