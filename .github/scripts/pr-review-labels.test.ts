import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync(new URL('../workflows/pr-review-labels.yml', import.meta.url), 'utf8'))
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const run = new AsyncFunction('github', 'context', workflow.jobs.label.steps[0].with.script)
const managed = ['pr-review/waiting-maintainer', 'pr-review/waiting-on-author']
const context = { repo: { owner: 'moeru-ai', repo: 'airi' }, payload: { pull_request: { number: 42 } } }
const request = { state: 'CHANGES_REQUESTED', submittedAt: '2026-10-05T10:00:00Z', commit: { oid: 'reviewed' } }
const changedCommit = { oid: 'changed', committedDate: '2026-10-05T11:00:00Z', parents: { totalCount: 1 } }

function api(options: {
  state?: string
  isDraft?: boolean
  reviews?: typeof request[]
  commits?: typeof changedCommit[]
  compared?: string[]
  labels?: string[]
} = {}) {
  const pageInfo: { hasNextPage: boolean, endCursor: string | null } = { hasNextPage: false, endCursor: null }
  const labels = options.labels ?? ['pr-review/hold', 'scope/ui', 'priority/urgent']
  const rest = {
    issues: {
      listLabelsForRepo: vi.fn(),
      listLabelsOnIssue: vi.fn(),
      createLabel: vi.fn(),
      addLabels: vi.fn(),
      removeLabel: vi.fn(),
    },
    pulls: { list: vi.fn() },
    repos: {
      compareCommitsWithBasehead: vi.fn().mockResolvedValue({ data: {
        commits: (options.compared ?? []).map(sha => ({ sha })),
        total_commits: (options.compared ?? []).length,
      } }),
      getCommit: vi.fn().mockResolvedValue({ data: { files: [{ filename: 'speech.ts' }] } }),
    },
  }
  const github = {
    rest,
    graphql: vi.fn(async (query: string) => {
      if (query.includes('latestOpinionatedReviews')) {
        return { repository: { pullRequest: {
          state: options.state ?? 'OPEN',
          isDraft: options.isDraft ?? false,
          headRefOid: 'head',
          latestOpinionatedReviews: {
            nodes: options.reviews ?? [],
            pageInfo,
          },
        } } }
      }
      return { repository: { pullRequest: { commits: {
        nodes: (options.commits ?? []).map(commit => ({ commit })),
        pageInfo,
      } } } }
    }),
    paginate: vi.fn(async (method: unknown) => {
      if (method === rest.issues.listLabelsForRepo)
        return managed.map(name => ({ name }))
      if (method === rest.pulls.list)
        return [{ number: 42 }]
      return labels.map(name => ({ name }))
    }),
  }
  return github
}

describe('pR review handoff labels', () => {
  it('initially waits for the maintainer and preserves manual labels', async () => {
    const github = api()
    await run(github, context)
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-maintainer'] })
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled()
  })

  it.each([{ reviews: [] }, { reviews: [request] }])('clears both waiting labels on drafts with reviews %j', async ({ reviews }) => {
    const github = api({ isDraft: true, reviews, labels: [...managed, 'scope/ui', 'pr-review/hold'] })
    await run(github, context)
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
    expect(github.rest.issues.removeLabel).toHaveBeenCalledTimes(2)
    expect(github.rest.issues.removeLabel).toHaveBeenCalledWith({ ...context.repo, issue_number: 42, name: managed[0] })
    expect(github.rest.issues.removeLabel).toHaveBeenCalledWith({ ...context.repo, issue_number: 42, name: managed[1] })
    expect(github.graphql).toHaveBeenCalledTimes(1)
    expect(github.rest.repos.compareCommitsWithBasehead).not.toHaveBeenCalled()
  })

  it('reevaluates active change requests when the current PR becomes ready', async () => {
    const github = api({ reviews: [request], isDraft: false })
    await run(github, { ...context, payload: { pull_request: { number: 42, draft: true } } })
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-on-author'] })
    expect(github.graphql.mock.calls[0][0]).toContain('state isDraft headRefOid')
  })

  it('restricts review input to the latest opinionated reviews from maintainers', async () => {
    const github = api()
    await run(github, context)
    expect(github.graphql.mock.calls[0][0]).toContain('latestOpinionatedReviews(first: 100, after: $cursor, writersOnly: true)')
  })

  it('hands the PR to the author after a maintainer requests changes', async () => {
    const github = api({ reviews: [request], labels: ['pr-review/waiting-maintainer', 'pr-review/hold'] })
    await run(github, context)
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-on-author'] })
    expect(github.rest.issues.removeLabel).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, name: 'pr-review/waiting-maintainer' })
  })

  it('hands a file-changing update back to the maintainer even while the change request remains active', async () => {
    const github = api({ reviews: [request], commits: [changedCommit], compared: ['changed'], labels: ['pr-review/waiting-on-author'] })
    await run(github, context)
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-maintainer'] })
    expect(github.rest.issues.removeLabel).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, name: 'pr-review/waiting-on-author' })
  })

  it('ignores a merge from main and commits inherited from main', async () => {
    const github = api({
      reviews: [request],
      commits: [{ ...changedCommit, oid: 'merge', parents: { totalCount: 2 } }],
      compared: ['main-commit', 'merge'],
      labels: ['pr-review/waiting-on-author'],
    })
    await run(github, context)
    expect(github.rest.repos.getCommit).not.toHaveBeenCalled()
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled()
  })

  it('ignores empty commits', async () => {
    const github = api({ reviews: [request], commits: [changedCommit], compared: ['changed'], labels: ['pr-review/waiting-on-author'] })
    github.rest.repos.getCommit.mockResolvedValue({ data: { files: [] } })
    await run(github, context)
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled()
  })

  it('ignores work recorded before the change request', async () => {
    const github = api({
      reviews: [request],
      commits: [{ ...changedCommit, committedDate: '2026-10-05T09:00:00Z' }],
      compared: ['changed'],
      labels: ['pr-review/waiting-on-author'],
    })
    await run(github, context)
    expect(github.rest.repos.getCommit).not.toHaveBeenCalled()
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
  })

  it('starts another author response cycle for a newer change request', async () => {
    const github = api({
      reviews: [request, { ...request, submittedAt: '2026-10-05T12:00:00Z', commit: { oid: 'changed' } }],
      commits: [changedCommit],
      compared: [],
      labels: ['pr-review/waiting-maintainer'],
    })
    await run(github, context)
    expect(github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith({ ...context.repo, basehead: 'changed...head', per_page: 100, page: 1 })
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-on-author'] })
  })

  it.each(['APPROVED', 'DISMISSED'])('returns the PR to the maintainer when the change request becomes %s', async (state) => {
    const github = api({ reviews: [{ ...request, state }], labels: ['pr-review/waiting-on-author'] })
    await run(github, context)
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-maintainer'] })
    expect(github.rest.issues.removeLabel).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, name: 'pr-review/waiting-on-author' })
  })

  it.each(['CLOSED', 'MERGED'])('clears waiting labels on %s PRs', async (state) => {
    const github = api({ state, labels: ['pr-review/waiting-maintainer', 'pr-review/waiting-on-author', 'pr-review/hold'] })
    await run(github, context)
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
    expect(github.rest.issues.removeLabel).toHaveBeenCalledTimes(2)
  })

  it('reconciles open fork PRs from current API data after review events', async () => {
    const github = api({ labels: ['pr-review/waiting-maintainer'] })
    await run(github, { ...context, payload: { workflow_run: { pull_requests: [] } } })
    expect(github.paginate).toHaveBeenCalledWith(github.rest.pulls.list, { ...context.repo, state: 'open', per_page: 100 })
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled()
  })

  it('reads change requests beyond the first review page', async () => {
    const github = api({ reviews: [request], labels: ['pr-review/waiting-maintainer'] })
    github.graphql.mockResolvedValueOnce({ repository: { pullRequest: {
      state: 'OPEN',
      isDraft: false,
      headRefOid: 'head',
      latestOpinionatedReviews: {
        nodes: [],
        pageInfo: { hasNextPage: true, endCursor: 'next-review' },
      },
    } } })
    await run(github, context)
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-on-author'] })
  })

  it('finds a meaningful update beyond the first comparison page', async () => {
    const github = api({ reviews: [request], commits: [changedCommit], compared: ['changed'], labels: ['pr-review/waiting-on-author'] })
    github.rest.repos.compareCommitsWithBasehead.mockResolvedValueOnce({ data: { commits: [{ sha: 'main-commit' }], total_commits: 101 } })
    await run(github, context)
    expect(github.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledTimes(2)
    expect(github.rest.repos.compareCommitsWithBasehead).toHaveBeenLastCalledWith({ ...context.repo, basehead: 'reviewed...head', per_page: 100, page: 2 })
    expect(github.rest.issues.addLabels).toHaveBeenCalledExactlyOnceWith({ ...context.repo, issue_number: 42, labels: ['pr-review/waiting-maintainer'] })
  })

  it('creates missing waiting labels before it labels a PR', async () => {
    const github = api()
    github.paginate.mockResolvedValueOnce([])
    await run(github, context)
    expect(github.rest.issues.createLabel).toHaveBeenCalledTimes(2)
  })

  it('leaves labels unchanged when GitHub cannot read the review', async () => {
    const github = api()
    github.graphql.mockRejectedValue(new Error('API unavailable'))
    await expect(run(github, context)).rejects.toThrow('API unavailable')
    expect(github.rest.issues.addLabels).not.toHaveBeenCalled()
    expect(github.rest.issues.removeLabel).not.toHaveBeenCalled()
  })
})

describe('category triage dispatch', () => {
  const dispatchWorkflow = parse(readFileSync(new URL('../workflows/pr-triage-dispatch.yml', import.meta.url), 'utf8'))
  const dispatch = new AsyncFunction('github', 'context', dispatchWorkflow.jobs.dispatch.steps[0].with.script)

  it.each([
    { issue: { number: 42 } },
    { pull_request: { number: 42, draft: true } },
  ])('dispatches category triage for %j', async (payload) => {
    const createWorkflowDispatch = vi.fn()
    const github = { rest: { actions: { createWorkflowDispatch } } }
    await dispatch(github, { repo: context.repo, payload: { ...payload, repository: { default_branch: 'main' } } })
    expect(createWorkflowDispatch).toHaveBeenCalledExactlyOnceWith({
      ...context.repo,
      workflow_id: 'copilot-labels.yml',
      ref: 'main',
      inputs: { item_number: '42' },
    })
  })
})
