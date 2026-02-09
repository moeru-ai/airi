import type { PatternCard } from './types'

export const PATTERN_CATALOG: PatternCard[] = [
  {
    id: 'collect.wall_torch',
    title: 'Collect Wall Torches Reliably',
    intent: 'Handle torch tasks where blocks may be wall-mounted variants.',
    whenToUse: [
      'Player asks to remove or collect torches from walls.',
      'query.blocks().whereName("torch") returns empty unexpectedly.',
    ],
    steps: [
      'Inspect nearby blocks for names containing "torch".',
      'Prefer exact coordinate mining for visible torches.',
      'Use expected block type to avoid accidental mining.',
    ],
    code: [
      'const torches = query.blocks().within(32).list().filter(b => b.name.includes("torch"));',
      'if (torches.length) {',
      '  const target = torches[0];',
      '  await mineBlockAt({',
      '    x: target.pos.x, y: target.pos.y, z: target.pos.z, expected_block_type: target.name,',
      '  });',
      '}',
    ].join('\n'),
    tags: ['collect', 'torch', 'wall_torch', 'mineBlockAt', 'block-variant'],
    pitfalls: [
      'Do not assume torch blocks are always named "torch".',
      'Avoid repeated no-action turns after concrete targets are known.',
    ],
  },
  {
    id: 'collect.block_variant_fallback',
    title: 'Variant-Aware Block Collection',
    intent: 'Collect targets that may have equivalent block variants.',
    whenToUse: [
      'collectBlocks fails to find a requested type.',
      'Requested block has known wall or state variants.',
    ],
    steps: [
      'Run a quick read pass to inspect candidate block names.',
      'Use the closest equivalent variant when acting.',
      'Verify completion with one post-action query.',
    ],
    code: [
      'const candidates = query.blocks().within(32).list().filter(b => b.name.includes("torch"));',
      'const count = candidates.length;',
      'if (count > 0) await collectBlocks({ type: "torch", num: Math.min(count, 4) });',
    ].join('\n'),
    tags: ['collect', 'fallback', 'variants', 'query', 'collectBlocks'],
  },
  {
    id: 'read.value_first_prev_run',
    title: 'Value-First Read Then Act',
    intent: 'Reduce TOCTOU drift and action mistakes by separating read and act turns.',
    whenToUse: [
      'Action parameters depend on query results.',
      'The world may change while planning.',
    ],
    steps: [
      'Turn A: return a concrete read value and perform no actions.',
      'Turn B: read from prevRun.returnRaw and execute action tools.',
      'Avoid re-querying the same value in Turn B.',
    ],
    code: [
      '// Turn A',
      'const target = query.blocks().within(24).whereName(["torch", "wall_torch"]).first();',
      'target',
      '',
      '// Turn B',
      'const target = prevRun.returnRaw;',
      'if (target) await mineBlockAt({ x: target.pos.x, y: target.pos.y, z: target.pos.z, expected_block_type: target.name });',
    ].join('\n'),
    tags: ['value-first', 'prevRun', 'query', 'safety'],
  },
  {
    id: 'read.no_action_budget_exit',
    title: 'Exit No-Action Loops',
    intent: 'Avoid stagnation when no-action follow-up budget is near zero.',
    whenToUse: [
      'Repeated no-action turns with similar return values.',
      'noActionBudget.remaining is 0 or close to 0.',
    ],
    steps: [
      'Stop additional eval-only loops when budget is exhausted.',
      'Either perform a concrete action or call giveUp with reason.',
      'Send one concise status chat if a player requested the task.',
    ],
    code: [
      'if (noActionBudget.remaining <= 0) {',
      '  await giveUp({ reason: "No verified target found for requested task", cooldown_seconds: 45 });',
      '}',
    ].join('\n'),
    tags: ['no-action', 'budget', 'giveUp', 'stagnation'],
  },
  {
    id: 'action.mine_block_at_targeted',
    title: 'Targeted Block Mining',
    intent: 'Use mineBlockAt for precise one-off world edits when coordinates are known.',
    whenToUse: [
      'Single block needs to be removed at a known position.',
      'collectBlocks over-selects or fails for localized targets.',
    ],
    steps: [
      'Confirm target block coordinates from query output.',
      'Pass expected_block_type to guard against stale assumptions.',
      'Re-check block existence if action fails.',
    ],
    code: [
      'const block = query.blockAt({ x: -328, y: 69, z: -432 });',
      'if (block && block.name.includes("torch")) {',
      '  await mineBlockAt({ x: block.pos.x, y: block.pos.y, z: block.pos.z, expected_block_type: block.name });',
      '}',
    ].join('\n'),
    tags: ['mineBlockAt', 'targeted', 'safety', 'expected_block_type'],
  },
  {
    id: 'queue.single_step_verify',
    title: 'Single Step Queue Progress',
    intent: 'Prevent over-queueing by issuing one control action and verifying outcome.',
    whenToUse: [
      'Control actions can fail due to environment uncertainty.',
      'Task needs iterative adaptation.',
    ],
    steps: [
      'Issue one control action.',
      'Inspect actionQueue and feedback before next control action.',
      'Adapt strategy if first action fails.',
    ],
    code: [
      'await goToPlayer({ player_name: "laggy_magpie", closeness: 2 });',
      'if (actionQueue.executing || actionQueue.pending.length > 0) return;',
      'await collectBlocks({ type: "torch", num: 2 });',
    ].join('\n'),
    tags: ['queue', 'control-action', 'verification', 'actionQueue'],
  },
]
