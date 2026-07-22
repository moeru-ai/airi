'use strict';

const API_ROOT = 'https://api.github.com';

async function githubRequest(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ai-pr-triage-action',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `GitHub API ${method} ${path} returned HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (typeof payload.message === 'string') {
        message += `: ${payload.message}`;
      }
    } catch {
      // Keep the bounded status-only error when the response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }
  return response.json();
}

async function fetchPullRequest(repository, number, token) {
  console.log(`Fetching PR metadata: repo=${repository} pr=${number}`);
  const pr = await githubRequest(`/repos/${repository}/pulls/${number}`, { token });
  console.log('Fetching changed files with pagination (GitHub API cap: 3000 files)');

  const files = [];
  for (let page = 1; page <= 30; page += 1) {
    const batch = await githubRequest(
      `/repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`,
      { token },
    );
    if (!Array.isArray(batch)) {
      throw new Error('GitHub pull request files response was not an array.');
    }
    files.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }

  console.log(`Fetched PR data: api_files=${files.length} reported_files=${pr.changed_files}`);
  if (files.length === 3000 && Number(pr.changed_files) > files.length) {
    console.log(`::warning::GitHub PR files API cap reached: api_files=${files.length} reported_files=${pr.changed_files}`);
  }
  return { files, pr };
}

async function syncLabels({ repository, number, token, desired, catalog }) {
  const managed = new Set(catalog.tags.map((tag) => tag.name));
  const desiredSet = new Set(desired);
  const pr = await githubRequest(`/repos/${repository}/pulls/${number}`, { token });
  const current = (pr.labels ?? []).map((label) => label.name);
  const remove = current.filter((label) => managed.has(label) && !desiredSet.has(label)).sort();

  console.log(`Label sync plan: pr=${number} desired=${desired.length} remove=${remove.length}`);
  for (const label of [...desired].sort()) {
    console.log(`Applying managed label: ${label}`);
    await githubRequest(`/repos/${repository}/issues/${number}/labels`, {
      token,
      method: 'POST',
      body: { labels: [label] },
    });
  }

  // Add first so a provider or API failure leaves extra managed labels instead of removing useful state.
  for (const label of remove) {
    console.log(`Removing managed label: ${label}`);
    await githubRequest(
      `/repos/${repository}/issues/${number}/labels/${encodeURIComponent(label)}`,
      { token, method: 'DELETE' },
    );
  }
  console.log('Label sync completed.');
}

module.exports = { fetchPullRequest, githubRequest, syncLabels };
