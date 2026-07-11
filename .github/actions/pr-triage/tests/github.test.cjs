'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { fetchPullRequest, syncLabels } = require('../src/github.cjs');

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('fetchPullRequest stops after the GitHub 3000-file API cap', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    if (String(url).endsWith('/pulls/7')) {
      return jsonResponse({ changed_files: 3500 });
    }
    return jsonResponse(Array.from({ length: 100 }, (_, index) => ({
      additions: 1,
      changes: 1,
      deletions: 0,
      filename: `file-${calls}-${index}.txt`,
      status: 'added',
    })));
  };
  try {
    const result = await fetchPullRequest('owner/repo', 7, 'token');
    assert.equal(result.files.length, 3000);
    assert.equal(calls, 31);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncLabels removes stale managed tags and applies desired tags', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ method: options.method, url: String(url), body: options.body });
    if (options.method === 'GET') {
      return jsonResponse({ labels: [{ name: 'priority/general' }, { name: 'keep-me' }] });
    }
    if (options.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return jsonResponse([{ name: 'priority/nice-to-have' }]);
  };
  try {
    await syncLabels({
      catalog: { tags: [{ name: 'priority/general' }, { name: 'priority/nice-to-have' }] },
      desired: ['priority/nice-to-have'],
      number: 9,
      repository: 'owner/repo',
      token: 'token',
    });
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1);
    assert.ok(calls.findIndex((call) => call.method === 'POST') < calls.findIndex((call) => call.method === 'DELETE'));
    assert.match(calls.find((call) => call.method === 'DELETE').url, /priority%2Fgeneral$/);
    assert.deepEqual(JSON.parse(calls.find((call) => call.method === 'POST').body), { labels: ['priority/nice-to-have'] });
  } finally {
    global.fetch = originalFetch;
  }
});
