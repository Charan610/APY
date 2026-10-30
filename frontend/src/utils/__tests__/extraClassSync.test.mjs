import assert from 'node:assert/strict';
import test from 'node:test';
import { subscribeExtraClasses, notifyExtraClassesChanged } from '../extraClassSync.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup() {
  const target = new EventTarget();
  const requests = [];
  function mount(date) {
    const state = { records: [], loading: true, loaded: false, error: '' };
    let updates = 0;
    const stop = subscribeExtraClasses({
      date, target,
      load: (start, end) => { assert.equal(start, end); const request = { date, ...deferred() }; requests.push(request); return request.promise; },
      onLoading: loading => { updates++; state.loading = loading; if (loading) { state.loaded = false; state.error = ''; } },
      onRecords: records => { updates++; state.records = records; state.loaded = true; },
      onError: error => { updates++; state.error = error.message; }
    });
    return { state, stop, get updates() { return updates; } };
  }
  return { target, requests, mount };
}
for (const action of ['add', 'edit', 'delete']) {
  test(`${action}: delayed completion refreshes remounted A, isolates B, rejects stale GET`, async () => {
    const env = setup();
    const oldRecord = { id: 1, subject: 'Math', periods: 2 };
    const oldA = env.mount('2026-11-01');
    env.requests[0].resolve({ extra_classes: [oldRecord] });
    await flush();
    const write = deferred();
    const mutation = write.promise.then(() => notifyExtraClassesChanged('2026-11-01', env.target));
    oldA.stop();
    const oldUpdates = oldA.updates;
    const b = env.mount('2026-11-02');
    const newA = env.mount('2026-11-01');
    const staleRead = env.requests[2];
    const expected = action === 'delete' ? [] : action === 'edit' ? [{ ...oldRecord, periods: 4 }] : [oldRecord, { ...oldRecord, id: 2 }];
    write.resolve(); await mutation;
    assert.equal(env.requests.length, 4);
    assert.equal(env.requests[3].date, '2026-11-01');
    assert.equal(newA.state.loading, true);
    assert.equal(newA.state.loaded, false);
    env.requests[3].resolve({ extra_classes_by_date: { '2026-11-01': expected } });
    await flush();
    staleRead.resolve({ extra_classes: [oldRecord] });
    env.requests[1].resolve({ extra_classes: [] });
    await flush();
    assert.deepEqual(newA.state.records, expected);
    assert.equal(newA.state.loaded, true);
    assert.equal(newA.state.loading, false);
    assert.deepEqual(b.state.records, []);
    assert.equal(oldA.updates, oldUpdates);
    newA.stop(); b.stop();
    notifyExtraClassesChanged('2026-11-01', env.target);
    assert.equal(env.requests.length, 4, 'cleanup removes listeners');
  });
}

test('writer reload replaces rows once; stale failure cannot end reconciliation', async () => {
  const env = setup();
  const writer = env.mount('2026-11-01');
  env.requests[0].resolve({ extra_classes: [{ id: 1 }] }); await flush();
  notifyExtraClassesChanged('2026-11-01', env.target);
  notifyExtraClassesChanged('2026-11-01', env.target);
  env.requests[1].reject(new Error('stale failure')); await flush();
  assert.equal(writer.state.loading, true);
  assert.equal(writer.state.loaded, false);
  assert.equal(writer.state.error, '');
  env.requests[2].resolve({ extra_classes: [{ id: 1 }, { id: 2 }] }); await flush();
  assert.deepEqual(writer.state.records, [{ id: 1 }, { id: 2 }]);
  assert.equal(writer.state.loading, false);
  writer.stop();
});

test('failed reconcile stays unloaded; cleanup ignores pending results', async () => {
  const env = setup();
  const view = env.mount('2026-11-01');
  env.requests[0].resolve({ extra_classes: [] }); await flush();
  notifyExtraClassesChanged('2026-11-01', env.target);
  env.requests[1].reject(new Error('offline')); await flush();
  assert.deepEqual(view.state, { records: [], loading: false, loaded: false, error: 'offline' });
  notifyExtraClassesChanged('2026-11-01', env.target);
  view.stop();
  const updates = view.updates;
  env.requests[2].resolve({ extra_classes: [{ id: 3 }] }); await flush();
  assert.equal(view.updates, updates);
});
