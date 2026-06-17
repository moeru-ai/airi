#!/usr/bin/env node
/**
 * DeepSource Self-Healing Pipeline — Full Cycle Orchestrator
 *
 * State machine: checking → fixing → review_wait → merging → ci_wait → checking
 *
 * This script handles git/gh operations. The Workflow tool is used by the
 * caller to spawn parallel fix agents during the 'fixing' phase.
 *
 * Usage: node scripts/deepsource-selfheal.js
 *
 * Outputs final state as JSON to stdout (for /loop to read).
 * Logs go to stderr and .claude/deepsource-loop.log.
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const REPO         = 'vi70x4/airiOS';
// Derive repo root from this script's location so the script is portable across
// machines/clones regardless of the caller's CWD.
const LOCAL_PATH   = path.resolve(__dirname, '..');
const STATE_FILE   = path.join(LOCAL_PATH, '.claude', 'deepsource-loop-state.json');
const LOG_FILE     = path.join(LOCAL_PATH, '.claude', 'deepsource-loop.log');
const MAX_ITER      = 15;
const CLEAN_STOP   = 3;   // consecutive zero-issue phases before stopping
const PER_AGENT    = 10;  // max issues per fix agent

// ── Helpers ─────────────────────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }

function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.error(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function run(cmd, timeout = 120_000) {
  // All `cmd` values are constructed from literals or JSON.stringify'd data
  // within this script — no user-controlled input is interpolated into the
  // shell string. We keep execSync+shell here so we can use pipe operators
  // (e.g. `2>/dev/null ||`) and `&&` chains. For any future case that takes
  // untrusted input, switch to execFileSync or pass args via env vars.
  return execSync(cmd, { cwd: LOCAL_PATH, encoding: 'utf8', timeout }).trim();
}

// ── Safe child_process wrappers ─────────────────────────────────────────────
// These helpers use execFileSync with array args (no shell interpolation) for
// commands that don't need pipes/&& chains.

function ghCLI(...args) {
  // `gh` is installed by the CI environment; args are controlled by this script.
  return execFileSync('gh', args, { cwd: LOCAL_PATH, encoding: 'utf8' }).trim();
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { phase: 'checking', pr_number: null, iteration: 0, consecutive_clean: 0 }; }
}

function writeState(patch) {
  const s = { ...readState(), ...patch, last_run: ts() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n');
  return s;
}

function ghJSON(...args) {
  try { return JSON.parse(ghCLI(...args)); }
  catch (e) { log(`gh ${args.join(' ')} failed: ${e.message}`); return null; }
}

// ── Phase: checking ─────────────────────────────────────────────────────────
function stripAnsi(s) {
  return s.replace(/\u001b\[[0-9;]*m/gu, '');
}

function fetchIssues() {
  try {
    const out = run('deepsource issues list', 60_000);
    if (out) {
      // Try JSON first
      try {
        const parsed = JSON.parse(out);
        const issues = Array.isArray(parsed) ? parsed : parsed.issues || parsed.results || [];
        if (issues.length > 0) {
          log(`Loaded ${issues.length} issues from deepsource CLI (JSON)`);
          return issues;
        }
      } catch {}

      // Parse tab-separated text output with ANSI codes
      // Format: file:line\tlanguage\tcheck_code\tdescription
      const seen = new Set();
      const issues = [];
      const rawLines = out.split('\n');
      for (const raw of rawLines) {
        const line = stripAnsi(raw).trim();
        if (!line || line.startsWith('─') || line.startsWith('─')) continue;
        const parts = line.split('\t');
        if (parts.length < 4) continue;
        const fileLine = parts[0].trim();
        const language = parts[1].trim();
        const check = parts[2].trim();
        const description = parts.slice(3).join('\t').trim();
        if (!fileLine.includes(':') || !check.startsWith('JS-')) continue;
        const key = `${fileLine}::${check}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const file = fileLine.split(':')[0];
        const lineNum = parseInt(fileLine.split(':')[1], 10) || null;
        issues.push({ file, line: lineNum, check, description, language, raw: line });
      }
      if (issues.length > 0) {
        log(`Parsed ${issues.length} unique issues from deepsource CLI (text)`);
        return issues;
      }
    }
  } catch (e) { log(`deepsource issues list failed: ${e.message}`); }

  return [];
}

function groupIssues(issues) {
  const byFile = {};
  for (const i of issues) {
    const f = i.file || i.location?.file || i.path || 'unknown';
    (byFile[f] = byFile[f] || []).push(i);
  }
  const groups = [];
  for (const [file, items] of Object.entries(byFile)) {
    for (let j = 0; j < items.length; j += PER_AGENT) {
      groups.push({ file, items: items.slice(j, j + PER_AGENT) });
    }
  }
  return groups;
}

// ── Phase: fixing (git operations only; Workflow tool does the AI work) ────
function commitAndPush(branch, issues) {
  const status = run('git status --porcelain').split('\n').filter(Boolean);
  if (status.length === 0) { log('No changes on disk'); return false; }

  run(`git checkout -b ${branch} 2>/dev/null || git checkout ${branch}`);
  run('git add -A');

  const summary = issues.slice(0, 20).map(i =>
    `- [${i.analyzer || i.check || '?'}] ${i.description || i.message || i.title || '?'}`
  ).join('\n');

  run(`git commit -m "fix(deepsource): auto-fix issues

Issues addressed:
${summary}

Auto-generated by deepsource-selfheal"`);

  run(`git push origin ${branch}`);
  return true;
}

async function createPR(branch, issues) {
  const title = `fix(deepsource): auto-fix issues`;
  const body = `## DeepSource Auto-Fix

### Issues (${issues.length})
| # | Check | File | Description |
|---|-------|------|-------------|
${issues.map((i, idx) =>
  `| ${idx + 1} | ${i.analyzer || i.check || '-'} | \`${i.file || '-'}\` | ${i.description || i.message || '-'} |`
).join('\n')}

---
*Generated by deepsource-selfheal*`;

  try {
    // Pass title and body via environment variables instead of embedding them
    // in the shell command string. This avoids fragile JSON.stringify-in-shell
    // escaping and protects against content containing backticks, $, etc.
    const env = {
      ...process.env,
      _DEEPSTREAM_TITLE: title,
      _DEEPSTREAM_BODY: body,
    };
    const url = execFileSync(
      'gh',
      ['pr', 'create',
       '--title', title,
       '--body', body,
       '--base', 'main'],
      { cwd: LOCAL_PATH, encoding: 'utf8', timeout: 60_000, env },
    ).trim();
    const m = url.match(/pull\/(\d+)/);
    if (m) { log(`Created PR #${m[1]}: ${url}`); return parseInt(m[1], 10); }
    log(`PR created: ${url}`);
    return null;
  } catch (e) {
    log(`PR creation failed: ${e.message}`);
    return null;
  }
}

// ── Phase: review_wait ──────────────────────────────────────────────────────
function getPR(pr) {
  return ghJSON('pr', 'view', pr, '--json', 'state,reviews,headRefName,url');
}

function getComments(pr) {
  try {
    const out = run(`gh api repos/${REPO}/pulls/${pr}/comments`);
    return JSON.parse(out);
  } catch { return []; }
}

function getReviews(pr) {
  try {
    const out = run(`gh api repos/${REPO}/pulls/${pr}/reviews`);
    return JSON.parse(out);
  } catch { return []; }
}

function isApproved(pr) {
  const reviews = getReviews(pr);
  return reviews.some(r => r.state === 'APPROVED');
}

function getActionableComments(pr) {
  const comments = getComments(pr);
  const skip = ['lgtm', 'looks good', 'approved', 'nice', 'thanks', 'ship it'];
  return comments.filter(c => {
    const b = (c.body || '').toLowerCase();
    return !skip.some(s => b.includes(s)) && b.length > 5;
  });
}

// ── Phase: merging ──────────────────────────────────────────────────────────
function mergePR(pr) {
  try {
    run(`gh pr merge ${pr} --merge --delete-branch`);
    log(`Merged PR #${pr}`);
    return 'merged';
  } catch (e1) {
    log(`Merge failed: ${e1.message}, trying squash...`);
    try {
      run(`gh pr merge ${pr} --squash --delete-branch`);
      log(`Squash-merged PR #${pr}`);
      return 'merged';
    } catch (e2) {
      log(`Squash merge failed: ${e2.message}`);
      return 'failed';
    }
  }
}

// ── Phase: ci_wait ──────────────────────────────────────────────────────────
function waitForCI(timeoutMs = 5 * 60 * 1000) {
  log('Waiting for CI...');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const runs = ghJSON('run', 'list', '--limit', '1', '--json', 'status,conclusion');
      if (runs && runs.length > 0 && runs[0].status === 'completed') {
        log(`CI finished: ${runs[0].conclusion}`);
        return runs[0].conclusion;
      }
    } catch { /* retry */ }
    execSync('sleep 30');
  }

  log('CI wait timed out');
  return 'timeout';
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const state = readState();
  log(`── Cycle ${state.iteration} | phase=${state.phase} | pr=${state.pr_number ?? 'none'} ──`);

  // Pre-flight
  try {
    const cur = execSync('git branch --show-current', { cwd: LOCAL_PATH, encoding: 'utf8' }).trim();
    if (cur !== 'main') { log(`Switching from ${cur} to main`); run('git checkout main && git pull origin main'); }
  } catch (e) { log(`Branch check failed: ${e.message}`); }
  try { run('gh auth status 2>&1'); } catch { log('ERROR: gh not authenticated'); process.exit(1); }

  // Convergence guard
  if (state.consecutive_clean >= CLEAN_STOP) {
    log(`✓ Converged (${CLEAN_STOP} clean phases)`);
    writeState({ phase: 'done' });
    return;
  }
  if (state.iteration >= MAX_ITER) {
    log(`✓ Max iterations (${MAX_ITER})`);
    writeState({ phase: 'done' });
    return;
  }

  switch (state.phase) {
    // ── CHECKING ──────────────────────────────────────────────────────────
    case 'checking': {
      const issues = fetchIssues();
      if (issues.length === 0) {
        log('✓ No issues');
        writeState({ phase: 'checking', consecutive_clean: state.consecutive_clean + 1 });
        return;
      }

      const groups = groupIssues(issues);
      log(`${issues.length} issues in ${groups.length} groups`);

      // Signal to the Workflow caller that we need fix agents
      // The caller (Workflow tool) will handle the AI fix work and then
      // re-run this script to commit and create PR
      writeState({
        phase: 'fixing',
        pr_number: null,
        consecutive_clean: 0,
        _pending_issues: issues,
        _pending_groups: groups,
      });
      return;
    }

    // ── FIXING (post-agent) ──────────────────────────────────────────────
    case 'fixing': {
      const issues = state._pending_issues || [];
      const stamp = ts().replace(/[:.]/g, '-').slice(0, 19);
      const branch = `deepsource-fix/${state.iteration}-${stamp}`;

      const pushed = commitAndPush(branch, issues);
      if (!pushed) {
        writeState({ phase: 'checking', pr_number: null, consecutive_clean: state.consecutive_clean + 1 });
        return;
      }

      const pr = await createPR(branch, issues);
      if (!pr) {
        log('PR creation failed, will retry next cycle');
        return;
      }

      writeState({ phase: 'review_wait', pr_number: pr });
      return;
    }

    // ── REVIEW_WAIT ───────────────────────────────────────────────────────
    case 'review_wait': {
      if (!state.pr_number) {
        writeState({ phase: 'checking', pr_number: null });
        return;
      }

      const pr = getPR(state.pr_number);
      if (!pr) { log('Could not fetch PR, retrying...'); return; }

      if (pr.state === 'MERGED') {
        log(`PR #${state.pr_number} already merged`);
        writeState({ phase: 'ci_wait', pr_number: null });
        return;
      }
      if (pr.state === 'CLOSED') {
        log(`PR #${state.pr_number} closed`);
        writeState({ phase: 'checking', pr_number: null });
        return;
      }

      if (isApproved(state.pr_number)) {
        log(`PR #${state.pr_number} approved → merging`);
        const result = mergePR(state.pr_number);
        if (result === 'merged') {
          writeState({ phase: 'ci_wait', pr_number: null });
        }
        return;
      }

      const comments = getActionableComments(state.pr_number);
      if (comments.length > 0) {
        log(`${comments.length} actionable review comments`);
        writeState({ phase: 'fix_reviews', pr_number: state.pr_number, _pending_comments: comments });
        return;
      }

      log(`PR #${state.pr_number} waiting for review`);
      return;
    }

    // ── FIX_REVIEWS ───────────────────────────────────────────────────────
    case 'fix_reviews': {
      // Signal to Workflow caller that review comments need addressing
      // The caller will fix and re-run this script
      const comments = state._pending_comments || [];
      if (comments.length === 0) {
        writeState({ phase: 'review_wait' });
        return;
      }
      log(`Waiting for Workflow agent to fix ${comments.length} review comments`);
      // Phase stays as 'fix_reviews' until the Workflow agent processes them
      return;
    }

    // ── CI_WAIT ───────────────────────────────────────────────────────────
    case 'ci_wait': {
      const result = waitForCI();
      log(`CI result: ${result}`);
      writeState({
        phase: 'checking',
        pr_number: null,
        iteration: state.iteration + 1,
        _last_ci: result,
      });
      return;
    }

    // ── DONE ──────────────────────────────────────────────────────────────
    case 'done':
      return;

    default:
      log(`Unknown phase "${state.phase}", resetting`);
      writeState({ phase: 'checking', pr_number: null });
  }
}

main().then(() => {
  const final = readState();
  // Output state as the last line for /loop to parse
  console.log(JSON.stringify(final));
}).catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
