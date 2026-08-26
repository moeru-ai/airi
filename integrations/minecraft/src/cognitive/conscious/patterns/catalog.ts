import type { PatternCard } from './types'

export const PATTERN_CATALOG: PatternCard[] = [
  {
    code: [
      'const torches = query.blocks().within(32).list().filter(b => b.name.includes("torch"));',
      'if (torches.length) {',
      '  const target = torches[0];',
      '  await mineBlockAt({',
      '    x: target.pos.x, y: target.pos.y, z: target.pos.z, expected_block_type: target.name,',
      '  });',
      '}',
    ].join('\n'),
    id: 'collect.wall_torch',
    intent: 'Handle torch tasks where blocks may be wall-mounted variants.',
    pitfalls: [
      'Do not assume torch blocks are always named "torch".',
      'Avoid repeated no-action turns after concrete targets are known.',
    ],
    steps: [
      'Inspect nearby blocks for names containing "torch".',
      'Prefer exact coordinate mining for visible torches.',
      'Use expected block type to avoid accidental mining.',
    ],
    tags: ['collect', 'torch', 'wall_torch', 'mineBlockAt', 'block-variant'],
    title: 'Collect Wall Torches Reliably',
    whenToUse: [
      'Player asks to remove or collect torches from walls.',
      'query.blocks().whereName("torch") returns empty unexpectedly.',
    ],
  },
  {
    code: [
      'const candidates = query.blocks().within(32).list().filter(b => b.name.includes("torch"));',
      'const count = candidates.length;',
      'if (count > 0) await collectBlocks({ type: "torch", num: Math.min(count, 4) });',
    ].join('\n'),
    id: 'collect.block_variant_fallback',
    intent: 'Collect targets that may have equivalent block variants.',
    steps: [
      'Run a quick read pass to inspect candidate block names.',
      'Use the closest equivalent variant when acting.',
      'Verify completion with one post-action query.',
    ],
    tags: ['collect', 'fallback', 'variants', 'query', 'collectBlocks'],
    title: 'Variant-Aware Block Collection',
    whenToUse: [
      'collectBlocks fails to find a requested type.',
      'Requested block has known wall or state variants.',
    ],
  },
  {
    code: [
      '// Turn A',
      'const target = query.blocks().within(24).whereName(["torch", "wall_torch"]).first();',
      'target',
      '',
      '// Turn B',
      'const target = prevRun.returnRaw;',
      'if (target) await mineBlockAt({ x: target.pos.x, y: target.pos.y, z: target.pos.z, expected_block_type: target.name });',
    ].join('\n'),
    id: 'read.value_first_prev_run',
    intent: 'Reduce TOCTOU drift and action mistakes by separating read and act turns.',
    steps: [
      'Turn A: return a concrete read value and perform no actions.',
      'Turn B: read from prevRun.returnRaw and execute action tools.',
      'Avoid re-querying the same value in Turn B.',
    ],
    tags: ['value-first', 'prevRun', 'query', 'safety'],
    title: 'Value-First Read Then Act',
    whenToUse: [
      'Action parameters depend on query results.',
      'The world may change while planning.',
    ],
  },
  {
    code: [
      'if (noActionBudget.remaining <= 0) {',
      '  await giveUp({ reason: "No verified target found for requested task" });',
      '}',
    ].join('\n'),
    id: 'read.no_action_budget_exit',
    intent: 'Avoid stagnation when no-action follow-up budget is near zero.',
    steps: [
      'Stop additional eval-only loops when budget is exhausted.',
      'Either perform a concrete action or call giveUp with reason.',
      'Send one concise status chat if a player requested the task.',
    ],
    tags: ['no-action', 'budget', 'giveUp', 'stagnation'],
    title: 'Exit No-Action Loops',
    whenToUse: [
      'Repeated no-action turns with similar return values.',
      'noActionBudget.remaining is 0 or close to 0.',
    ],
  },
  {
    code: [
      'const block = query.blockAt({ x: -328, y: 69, z: -432 });',
      'if (block && block.name.includes("torch")) {',
      '  await mineBlockAt({ x: block.pos.x, y: block.pos.y, z: block.pos.z, expected_block_type: block.name });',
      '}',
    ].join('\n'),
    id: 'action.mine_block_at_targeted',
    intent: 'Use mineBlockAt for precise one-off world edits when coordinates are known.',
    steps: [
      'Confirm target block coordinates from query output.',
      'Pass expected_block_type to guard against stale assumptions.',
      'Re-check block existence if action fails.',
    ],
    tags: ['mineBlockAt', 'targeted', 'safety', 'expected_block_type'],
    title: 'Targeted Block Mining',
    whenToUse: [
      'Single block needs to be removed at a known position.',
      'collectBlocks over-selects or fails for localized targets.',
    ],
  },
  {
    code: [
      'await goToPlayer({ player_name: "laggy_magpie", closeness: 2 });',
      'if (actionQueue.executing || actionQueue.pending.length > 0) return;',
      'await collectBlocks({ type: "torch", num: 2 });',
    ].join('\n'),
    id: 'queue.single_step_verify',
    intent: 'Prevent over-queueing by issuing one control action and verifying outcome.',
    steps: [
      'Issue one control action.',
      'Inspect actionQueue and feedback before next control action.',
      'Adapt strategy if first action fails.',
    ],
    tags: ['queue', 'control-action', 'verification', 'actionQueue'],
    title: 'Single Step Queue Progress',
    whenToUse: [
      'Control actions can fail due to environment uncertainty.',
      'Task needs iterative adaptation.',
    ],
  },
]
