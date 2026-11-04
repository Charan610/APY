import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../../notifications.js', import.meta.url), 'utf8')).replace("import { api } from './api';", 'const api = {};');
for (const controlled of [false, true]) {
  test(`worker ${controlled ? 'upgrade' : 'first activation'} does not reload the opening page`, async () => {
    const descriptors = ['navigator', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    let reloads = 0;
    const worker = new EventTarget();
    worker.controller = controlled ? {} : null;
    const registration = { update: async () => {} };
    worker.register = async () => registration;
    worker.ready = Promise.resolve(registration);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: worker } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { PushManager: function () {}, location: { reload: () => reloads++ } } });
    try {
      const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${controlled}`);
      assert.equal(await module.registerServiceWorker(), registration);
      worker.dispatchEvent(new Event('controllerchange'));
      worker.dispatchEvent(new Event('controllerchange'));
      assert.equal(reloads, 0, 'worker activation must not restart the intro');
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
}
