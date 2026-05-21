'use strict';

// Mise AI Error Fix Agent
// Runs in GitHub Actions: fetches Sentry errors, asks Claude for fixes,
// commits to a branch, opens a PR, and emails escalations via Resend.

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ────────────────────────────────────────────────────────────────────

const MODE          = process.env.RUN_MODE || 'fix';
const SENTRY_ORG    = 'mise-flow';
const SENTRY_PROJECT = 'react-native';
const ALERT_EMAIL   = 'sukhi@mise.ltd';
const REPO          = process.env.GITHUB_REPOSITORY || 'Tip-Flow/TipFlow';
const [REPO_OWNER, REPO_NAME] = REPO.split('/');
const REPO_ROOT     = path.resolve(__dirname, '..');

// ── Safety: NEVER auto-fix anything matching these path fragments ──────────────
// If any stack frame or the issue title contains one of these, escalate to human.
const UNSAFE_FRAGMENTS = [
  'lib/tipCalculator',
  'tipCalculator',
  'lib/flinks',
  'flinks',
  'lib/supabase',
  '(auth)/',
  '/auth/',
  'supabase/migrations',
  'payout',
  'Payout',
  '/eft',
  'EFT',
  'payment',
  'Payment',
  'bank',
  'Bank',
  'money',
  'Money',
  'stripe',
  'Stripe',
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv();
  if (MODE === 'morning-report') {
    await sendMorningReport();
  } else {
    await runFixAgent();
  }
}

function validateEnv() {
  const required = MODE === 'morning-report'
    ? ['SENTRY_AUTH_TOKEN', 'RESEND_API_KEY', 'GITHUB_TOKEN']
    : ['SENTRY_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'GITHUB_TOKEN'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
}

// ── Fix Agent ─────────────────────────────────────────────────────────────────

async function runFixAgent() {
  console.log('[Agent] Fix agent starting at', new Date().toISOString());

  let issues = [];

  // Prefer direct Sentry webhook payload (faster, no polling delay)
  const rawPayload = process.env.SENTRY_PAYLOAD;
  if (rawPayload && rawPayload !== 'null' && rawPayload !== '{}') {
    try {
      const p = JSON.parse(rawPayload);
      if (p?.data?.issue) {
        issues = [p.data.issue];
        console.log('[Agent] Using webhook payload, issue:', p.data.issue.id);
      }
    } catch {
      console.log('[Agent] Could not parse SENTRY_PAYLOAD, falling back to API poll');
    }
  }

  if (issues.length === 0) {
    try {
      issues = await fetchSentryIssues('1h');
    } catch (err) {
      // Sentry API failure (bad token, network, etc.) — log and exit cleanly.
      // A misconfigured token is not a reason to fail the entire GHA job.
      console.error('[Agent] Sentry API error:', err.message);
      console.error('[Agent] Check SENTRY_AUTH_TOKEN secret and org/project slug.');
      process.exit(1);
    }
  }

  if (issues.length === 0) {
    console.log('[Agent] No new issues in the last hour.');
    return;
  }

  console.log(`[Agent] ${issues.length} issue(s) to process`);

  const existingBranches = await listExistingAIBranches();

  for (const issue of issues) {
    const branch = `ai-fix/${issue.id}`;
    if (existingBranches.has(branch)) {
      console.log(`[Agent] Skipping ${issue.id} — branch already exists`);
      continue;
    }
    await processIssue(issue);
    // Always return to main so the next iteration starts clean
    try { execSync('git checkout main', { stdio: 'pipe', cwd: REPO_ROOT }); } catch {}
  }

  console.log('[Agent] Fix agent done.');
}

// ── Sentry API ────────────────────────────────────────────────────────────────

async function fetchSentryIssues(period = '1h') {
  const url = new URL(`https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/`);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('sort', 'date');
  url.searchParams.set('limit', '10');
  url.searchParams.set('statsPeriod', period);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Sentry issues API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchLatestEvent(issueId) {
  const res = await fetch(`https://sentry.io/api/0/issues/${issueId}/events/latest/`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Safety classification ─────────────────────────────────────────────────────

function classifyUnsafe(issue, event) {
  const allText = [
    issue.title ?? '',
    issue.culprit ?? '',
    issue.metadata?.filename ?? '',
    ...extractInAppFrames(event).map(f => f.filename ?? ''),
  ].join(' ');

  for (const frag of UNSAFE_FRAGMENTS) {
    if (allText.toLowerCase().includes(frag.toLowerCase())) {
      return `Touches protected path/keyword: "${frag}"`;
    }
  }
  return null; // safe
}

// ── Stack frame helpers ───────────────────────────────────────────────────────

function extractInAppFrames(event) {
  if (!event?.entries) return [];
  for (const entry of event.entries) {
    if (entry.type !== 'exception') continue;
    for (const val of entry.data?.values ?? []) {
      const frames = (val.stacktrace?.frames ?? []).filter(f => f.inApp);
      if (frames.length) return frames;
    }
  }
  return [];
}

function formatStackTrace(event) {
  const frames = extractInAppFrames(event);
  if (!frames.length) return 'No in-app frames available.';
  return frames
    .slice(-6)
    .reverse()
    .map(f => `  at ${f.function || '<anonymous>'} (${f.filename}:${f.lineNo}:${f.colNo})`)
    .join('\n');
}

// Strips bundle prefixes so we get a path relative to the repo root.
// Sentry source maps may emit paths like /var/task/app/... or ~/app/...
function normalizeFilePath(filename) {
  if (!filename) return null;
  const knownRoots = ['app/', 'components/', 'hooks/', 'lib/', 'scripts/', 'supabase/'];
  for (const root of knownRoots) {
    const idx = filename.indexOf(`/${root}`);
    if (idx !== -1) return filename.slice(idx + 1);
    if (filename.startsWith(root)) return filename;
  }
  // Fall back: strip leading slash
  return filename.replace(/^\/+/, '') || null;
}

// ── Core: process one Sentry issue ───────────────────────────────────────────

async function processIssue(issue) {
  console.log(`\n[Agent] Issue ${issue.id}: ${issue.title}`);

  const event = await fetchLatestEvent(issue.id);

  // 1. Safety gate
  const unsafeReason = classifyUnsafe(issue, event);
  if (unsafeReason) {
    console.log(`[Agent] UNSAFE — escalating. Reason: ${unsafeReason}`);
    await sendEscalationEmail(issue, event, unsafeReason);
    return;
  }

  // 2. Find primary in-app frame
  const frames = extractInAppFrames(event);
  if (frames.length === 0) {
    await sendEscalationEmail(issue, event, 'No in-app stack frames — cannot locate source file');
    return;
  }

  const primaryFrame = frames[frames.length - 1]; // innermost frame
  const relPath = normalizeFilePath(primaryFrame.filename);
  const absPath = relPath ? path.join(REPO_ROOT, relPath) : null;

  if (!absPath || !fs.existsSync(absPath)) {
    await sendEscalationEmail(issue, event, `Source file not found in repo: ${primaryFrame.filename}`);
    return;
  }

  const fileContent = fs.readFileSync(absPath, 'utf8');
  const stackTrace  = formatStackTrace(event);

  // 3. Ask Claude for a fix
  console.log('[Agent] Calling Claude...');
  const result = await callClaude(issue, stackTrace, relPath, fileContent);

  if (!result.canFix) {
    console.log(`[Agent] Claude declined: ${result.reason}`);
    await sendEscalationEmail(issue, event, `Agent cannot fix: ${result.reason}`);
    return;
  }

  const { oldCode, newCode } = result.fix ?? {};
  if (!oldCode || newCode === undefined) {
    await sendEscalationEmail(issue, event, 'Claude returned a malformed fix (missing oldCode/newCode)');
    return;
  }

  // 4. Validate the fix can be applied
  if (!fileContent.includes(oldCode)) {
    await sendEscalationEmail(
      issue, event,
      'Fix code not found in source file — source map may be misaligned. Fix manually.'
    );
    return;
  }

  // 5. Apply fix (single replacement — oldCode must be unique)
  const fixed = fileContent.replace(oldCode, newCode);
  fs.writeFileSync(absPath, fixed, 'utf8');
  console.log(`[Agent] Fix applied to ${relPath}`);

  // 6. Commit, push, open PR
  await createBranchAndPR(issue, result, relPath);
}

// ── Claude ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an automated code fix agent for Mise, a Canadian restaurant tip management platform (React Native + Expo + TypeScript + Supabase).

Your only job is to return a minimal fix for the Sentry error provided.

Hard rules:
- Fix ONLY the exact error. Do not refactor, rename, or clean up surrounding code.
- Never touch: lib/tipCalculator.ts, lib/flinks.ts, lib/supabase.ts, (auth)/ screens, supabase/migrations/, payout screens, EFT flows, or any money-related logic.
- If the fix requires understanding business logic, database state, or anything financial — set canFix: false.
- Return ONLY valid JSON. No markdown, no prose outside the JSON object.

Return exactly this JSON structure:
{
  "canFix": true | false,
  "reason": "one sentence: what the fix does, or why you cannot fix it",
  "fix": {
    "file": "relative/path/to/file.tsx",
    "oldCode": "exact string from the file — must appear exactly once so str.replace() hits the right spot",
    "newCode": "replacement string"
  }
}

The fix field is required when canFix is true and omitted when canFix is false.`;

async function callClaude(issue, stackTrace, filePath, fileContent) {
  const client = new Anthropic();

  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      // Cache the system prompt — it never changes between calls
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `**Error:** ${issue.title}
**Culprit:** ${issue.culprit || 'unknown'}
**Occurrences:** ${issue.count || 1}

**Stack trace:**
${stackTrace}

**File to fix:** ${filePath}
\`\`\`typescript
${fileContent.slice(0, 8000)}
\`\`\`

Return the JSON fix object only.`,
    }],
  });

  const raw = res.content[0]?.text?.trim() ?? '';
  // Strip any accidental markdown fences
  const json = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  try {
    return JSON.parse(json);
  } catch {
    console.error('[Agent] Claude response not valid JSON:', raw.slice(0, 400));
    return { canFix: false, reason: 'Agent returned unparseable response' };
  }
}

// ── Git + PR ──────────────────────────────────────────────────────────────────

async function createBranchAndPR(issue, result, relPath) {
  const branch     = `ai-fix/${issue.id}`;
  // Sanitize title for git commit
  const shortTitle = (issue.title ?? 'unknown error')
    .replace(/[^\w\s\-:()[\]]/g, '')
    .slice(0, 72);

  try {
    execSync(`git checkout -b ${branch}`, { stdio: 'pipe', cwd: REPO_ROOT });
    execSync(`git add "${relPath}"`,       { stdio: 'pipe', cwd: REPO_ROOT });
    execSync(
      `git commit -m "fix: [AI] ${shortTitle}\n\nSentry issue: ${issue.id}\nFixed by: Mise AI Agent"`,
      { stdio: 'pipe', cwd: REPO_ROOT }
    );
    execSync(`git push origin ${branch}`, { stdio: 'inherit', cwd: REPO_ROOT });
  } catch (err) {
    console.error('[Agent] Git error:', err.message);
    if (err.stderr) console.error('[Agent] Git stderr:', err.stderr.toString().trim());
    return;
  }

  // Open PR via GitHub REST API
  const prBody = buildPRBody(issue, result, relPath);
  const prRes  = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `fix: [AI] ${shortTitle}`,
        head:  branch,
        base:  'main',
        body:  prBody,
      }),
    }
  );

  if (!prRes.ok) {
    console.error('[Agent] PR creation failed:', await prRes.text());
    return;
  }

  const pr = await prRes.json();
  console.log(`[Agent] PR created: ${pr.html_url}`);

  // Enable auto-merge so the PR merges automatically once CI passes.
  // Requires: repo Settings → General → "Allow auto-merge" enabled,
  // AND branch protection rules with at least one required status check.
  try {
    execSync(
      `gh pr merge ${pr.number} --auto --squash --repo ${REPO}`,
      { stdio: 'pipe', env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN } }
    );
    console.log(`[Agent] Auto-merge enabled for PR #${pr.number}`);
  } catch {
    console.log('[Agent] Auto-merge skipped — enable "Allow auto-merge" in repo settings to activate.');
  }
}

function buildPRBody(issue, result, relPath) {
  const oldSnippet = (result.fix?.oldCode ?? '').slice(0, 300);
  const newSnippet = (result.fix?.newCode ?? '').slice(0, 300);
  const sentryLink = issue.permalink
    ? `[${issue.shortId ?? issue.id}](${issue.permalink})`
    : (issue.shortId ?? issue.id);

  return `## AI-Generated Fix

**Sentry issue:** ${sentryLink} — ${issue.title}
**File:** \`${relPath}\`
**Occurrences:** ${issue.count ?? 1}

### Analysis
${result.reason}

### Change
\`\`\`diff
- ${oldSnippet.split('\n').join('\n- ')}
+ ${newSnippet.split('\n').join('\n+ ')}
\`\`\`

---
> ⚠️ Auto-generated by Mise AI Agent. Review before merging.
> 🤖 Will auto-merge once CI checks pass (if branch protection is configured).`;
}

// ── GitHub: list existing AI fix branches ─────────────────────────────────────

async function listExistingAIBranches() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!res.ok) return new Set();
    const branches = await res.json();
    return new Set(
      (Array.isArray(branches) ? branches : [])
        .map(b => b.name)
        .filter(n => n.startsWith('ai-fix/'))
    );
  } catch {
    return new Set();
  }
}

// ── Morning report ────────────────────────────────────────────────────────────

async function sendMorningReport() {
  console.log('[Agent] Building morning report...');

  const [issues, prs] = await Promise.all([
    fetchSentryIssues('24h').catch(() => []),
    fetchAIFixPRs().catch(() => []),
  ]);

  const merged = prs.filter(pr => pr.merged_at);
  const open   = prs.filter(pr => pr.state === 'open');

  const listItems = (items, href = 'html_url', label = 'title') =>
    items.length
      ? `<ul>${items.map(i => `<li><a href="${i[href]}">${i[label]}</a></li>`).join('')}</ul>`
      : '<p style="color:#6b7280">None.</p>';

  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<h2 style="color:#1e293b">☀️ Mise Overnight Report</h2>
<p style="color:#64748b">${new Date().toDateString()}</p>

<table style="border-collapse:collapse;width:100%;margin:24px 0;border-radius:12px;overflow:hidden">
  <tr>
    <td style="padding:16px 20px;background:#f0fdf4;font-size:28px;font-weight:800;color:#16a34a;width:60px">${merged.length}</td>
    <td style="padding:16px 20px;background:#f0fdf4;color:#15803d;font-weight:600">Errors fixed automatically</td>
  </tr>
  <tr>
    <td style="padding:16px 20px;background:#fefce8;font-size:28px;font-weight:800;color:#ca8a04">${open.length}</td>
    <td style="padding:16px 20px;background:#fefce8;color:#a16207;font-weight:600">Fixes pending CI / your review</td>
  </tr>
  <tr>
    <td style="padding:16px 20px;background:#fef2f2;font-size:28px;font-weight:800;color:#dc2626">${issues.length}</td>
    <td style="padding:16px 20px;background:#fef2f2;color:#b91c1c;font-weight:600">Total Sentry issues (last 24h)</td>
  </tr>
</table>

<h3 style="color:#16a34a">✅ Auto-fixed (merged to main)</h3>
${listItems(merged)}

<h3 style="color:#ca8a04">🔄 Awaiting CI or review</h3>
${listItems(open)}

${issues.length > 0 ? `
<h3 style="color:#dc2626">🔴 All Sentry issues (24h)</h3>
<ul>
  ${issues.slice(0, 20).map(i => `<li>${i.title} <span style="color:#94a3b8">(×${i.count})</span></li>`).join('')}
</ul>` : ''}

<p style="margin-top:32px;color:#94a3b8;font-size:12px">Generated at ${new Date().toUTCString()} · Mise AI Agent</p>
</div>`;

  await sendEmail({
    to:      ALERT_EMAIL,
    subject: `Mise Overnight Report — ${merged.length} fixed, ${open.length} need attention`,
    html,
  });

  console.log('[Agent] Morning report sent.');
}

async function fetchAIFixPRs() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=all&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );
  if (!res.ok) return [];
  const all = await res.json();
  return Array.isArray(all) ? all.filter(pr => pr.head?.ref?.startsWith('ai-fix/')) : [];
}

// ── Email (Resend) ────────────────────────────────────────────────────────────

async function sendEscalationEmail(issue, event, reason) {
  const frames     = extractInAppFrames(event);
  const stackTrace = formatStackTrace(event);
  const primaryFile = frames.length
    ? `${frames[frames.length - 1].filename}:${frames[frames.length - 1].lineNo}`
    : 'unknown';
  const sentryLink = issue.permalink
    ? `<a href="${issue.permalink}">View in Sentry →</a>`
    : '';

  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
<h2 style="color:#dc2626">⚠️ Mise Alert — Human Review Needed</h2>

<table style="border-collapse:collapse;width:100%;margin:16px 0">
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;width:160px;border-bottom:1px solid #e2e8f0">Error</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${issue.title}</td></tr>
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;border-bottom:1px solid #e2e8f0">Issue ID</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${issue.shortId ?? issue.id}</td></tr>
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;border-bottom:1px solid #e2e8f0">File</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0"><code>${primaryFile}</code></td></tr>
  <tr><td style="padding:10px 14px;background:#f8fafc;font-weight:700;border-bottom:1px solid #e2e8f0">Occurrences</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0">${issue.count ?? 1}</td></tr>
  <tr><td style="padding:10px 14px;background:#fef2f2;font-weight:700;color:#dc2626">Why escalated</td>
      <td style="padding:10px 14px;background:#fef2f2;color:#dc2626">${reason}</td></tr>
</table>

<h3>Stack Trace</h3>
<pre style="background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.6">${stackTrace}</pre>

${sentryLink}
<p style="color:#94a3b8;font-size:12px;margin-top:32px">Mise AI Agent · ${new Date().toUTCString()}</p>
</div>`;

  await sendEmail({
    to:      ALERT_EMAIL,
    subject: `Mise Alert — Human review needed: ${(issue.title ?? 'Unknown error').slice(0, 80)}`,
    html,
  });
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Mise AI Agent <ai@mise.ltd>',  // verify mise.ltd domain in Resend
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error('[Agent] Resend error:', await res.text());
  } else {
    console.log(`[Agent] Email sent: "${subject}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('[Agent] Fatal:', err);
  process.exit(1);
});
