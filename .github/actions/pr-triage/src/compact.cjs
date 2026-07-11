'use strict';

function truncateMiddle(text, byteLimit, unit = 'lines') {
  if (Buffer.byteLength(text, 'utf8') <= byteLimit) return text;

  const lines = text.split('\n');
  let left = 0;
  let right = lines.length - 1;
  const head = [];
  const tail = [];

  while (left <= right) {
    const omittedAfterHead = Math.max(1, right - left);
    const headMarker = `... ${omittedAfterHead} ${unit} truncated ...`;
    const headCandidate = [...head, lines[left], headMarker, ...tail].join('\n');
    if (Buffer.byteLength(headCandidate, 'utf8') <= byteLimit) {
      head.push(lines[left]);
      left += 1;
    }

    if (left > right) {
      break;
    }

    const omittedAfterTail = Math.max(1, right - left);
    const tailMarker = `... ${omittedAfterTail} ${unit} truncated ...`;
    const tailCandidate = [...head, tailMarker, lines[right], ...tail].join('\n');
    if (Buffer.byteLength(tailCandidate, 'utf8') <= byteLimit) {
      tail.unshift(lines[right]);
      right -= 1;
    } else if (headCandidate && left <= right) {
      break;
    }
  }

  const omitted = Math.max(1, right - left + 1);
  const marker = `... ${omitted} ${unit} truncated ...`;
  let result = [...head, marker, ...tail].join('\n');

  while (Buffer.byteLength(result, 'utf8') > byteLimit && (head.length > 0 || tail.length > 0)) {
    if (Buffer.byteLength(head.join('\n'), 'utf8') >= Buffer.byteLength(tail.join('\n'), 'utf8')) {
      head.pop();
    } else {
      tail.shift();
    }
    result = [...head, marker, ...tail].join('\n');
  }

  return result;
}

function selectDiffFiles(files, maxFiles = 20) {
  if (files.length <= maxFiles) {
    return files.map((file) => ({ ...file }));
  }
  const half = Math.floor(maxFiles / 2);
  const omitted = files.length - maxFiles;
  return [
    ...files.slice(0, half).map((file) => ({ ...file })),
    { _truncated: true, filename: `... ${omitted} files truncated ...` },
    ...files.slice(-half).map((file) => ({ ...file })),
  ];
}

function buildPrompt({ pr, files, prompt, catalog, maxBytes = 65536 }) {
  const system = `${prompt}\n\n## Allowed tag catalog\n\n\`\`\`json\n${JSON.stringify(catalog, null, 2)}\n\`\`\`\n`;
  const bodyRaw = pr.body ?? '';
  const body = truncateMiddle(bodyRaw, 4500, 'lines');
  const existingLabels = (pr.labels ?? []).map((label) => label.name).join(', ');
  const metadata = [
    `Number: #${pr.number}`,
    `Title: ${pr.title ?? ''}`,
    `Author: @${pr.user?.login ?? 'unknown'}`,
    `Base: ${pr.base?.ref ?? ''}`,
    `Head: ${pr.head?.ref ?? ''}`,
    `Draft: ${Boolean(pr.draft)}`,
    `Reported files: ${pr.changed_files ?? files.length}`,
    `Total additions: ${pr.additions ?? 0}`,
    `Total deletions: ${pr.deletions ?? 0}`,
    `Existing labels: ${existingLabels}`,
    'Description:',
    body,
  ].join('\n');

  const manifestRaw = files
    .map((file) => `${file.filename} [${file.status}, +${file.additions}/-${file.deletions}, ${file.changes} changes]`)
    .join('\n');
  const manifest = truncateMiddle(manifestRaw, 4500, 'files');
  const selected = selectDiffFiles(files, 20);
  const selectedCount = selected.filter((file) => !file._truncated).length;

  const systemBytes = Buffer.byteLength(system, 'utf8');
  const metadataBytes = Buffer.byteLength(metadata, 'utf8');
  const manifestBytes = Buffer.byteLength(manifest, 'utf8');
  const diffBudget = Math.max(800, maxBytes - systemBytes - metadataBytes - manifestBytes - 1200);
  const perFileBudget = Math.min(
    4000,
    Math.max(180, selectedCount > 0 ? Math.floor((diffBudget - selectedCount * 180) / selectedCount) : 180),
  );

  const diffParts = selected.map((file) => {
    if (file._truncated) {
      return file.filename;
    }
    const header = `### ${file.filename}\nStatus: ${file.status}, additions: ${file.additions}, deletions: ${file.deletions}\n`;
    if (!file.patch) {
      return `${header}\n... binary file or patch unavailable ...`;
    }
    const compactPatch = truncateMiddle(file.patch, perFileBudget, 'lines');
    return `${header}\n\`\`\`diff\n${compactPatch}\n\`\`\``;
  });
  const diffsRaw = diffParts.join('\n\n');
  const diffs = truncateMiddle(diffsRaw, diffBudget, 'lines');
  const contextRaw = `# Pull request metadata\n\n${metadata}\n\n# Changed files\n\n${manifest}\n\n# Patches\n\n${diffs}`;
  const contextBudget = maxBytes - systemBytes - 256;
  if (contextBudget < 512) {
    throw new Error('Trusted prompt and tag catalog leave no room for PR context.');
  }
  const context = truncateMiddle(contextRaw, contextBudget, 'lines');
  const inputBytes = systemBytes + Buffer.byteLength(context, 'utf8');
  if (inputBytes > maxBytes) {
    throw new Error(`Prompt exceeds byte budget: ${inputBytes} > ${maxBytes}`);
  }

  return {
    context,
    diagnostics: {
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      bodyRawBytes: Buffer.byteLength(bodyRaw, 'utf8'),
      contextBytes: Buffer.byteLength(context, 'utf8'),
      contextRawBytes: Buffer.byteLength(contextRaw, 'utf8'),
      diffBytes: Buffer.byteLength(diffs, 'utf8'),
      diffRawBytes: Buffer.byteLength(diffsRaw, 'utf8'),
      fileTruncationMarkers: (context.match(/\.\.\. \d+ files truncated \.\.\./g) ?? []).length,
      inputBytes,
      lineTruncationMarkers: (context.match(/\.\.\. \d+ lines truncated \.\.\./g) ?? []).length,
      manifestBytes: Buffer.byteLength(manifest, 'utf8'),
      manifestRawBytes: Buffer.byteLength(manifestRaw, 'utf8'),
      omittedDiffFiles: files.length - selectedCount,
      selectedDiffFiles: selectedCount,
      unavailablePatches: files.filter((file) => !file.patch).length,
    },
    system,
  };
}

module.exports = { buildPrompt, selectDiffFiles, truncateMiddle };
