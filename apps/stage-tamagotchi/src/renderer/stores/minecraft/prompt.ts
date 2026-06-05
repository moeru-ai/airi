// CJK Unified Ideographs (U+4E00–U+9FFF) — matches any normal Chinese character. Written with
// explicit unicode escapes (lint rule regexp/no-obscure-range forbids the raw char range).
const RE_CJK = /[\u4E00-\u9FFF]/

/** The owner's status line the bot service surfaces in its neutral `minecraft:status` text. */
const MASTER_TEXT_PREFIX = 'Master (your owner) in-game username:'

/**
 * Whether a forwarded in-game line should be read aloud.
 *
 * Use when:
 * - Gating TTS for the bot's own chat (lane `minecraft:speech`) so English skill/command echoes and
 *   debug noise are never spoken.
 *
 * Returns:
 * - true only when the text contains at least one CJK character. This is the owner's desktop-side
 *   policy and lives with the Minecraft adapter, not in the neutral system-speech bridge.
 */
export function shouldReadAloud(text: string | undefined | null): boolean {
  if (!text)
    return false

  return RE_CJK.test(text)
}

/**
 * Extracts the master's in-game username from a `minecraft:status` text line, if present.
 *
 * The bot service states its owner in plain status text (`Master (your owner) in-game username: X`)
 * for its own brain; the desktop adapter reads it from there rather than relying on a dedicated hint,
 * keeping the bot service free of any desktop-binding contract.
 *
 * Before:
 * - "Bot online: Airi\n...\nMaster (your owner) in-game username: dssadg"
 *
 * After:
 * - "dssadg"
 */
export function parseMasterUsername(statusText: string | undefined | null): string {
  if (!statusText)
    return ''

  for (const line of statusText.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(MASTER_TEXT_PREFIX))
      return trimmed.slice(MASTER_TEXT_PREFIX.length).trim()
  }

  return ''
}

export interface MinecraftToolsetPromptInput {
  /** Whether the in-game bot is currently connected (drives relay-mode vs offline copy). */
  online: boolean
  /** The master's in-game username, if known (binds "主人" to the actual player). */
  masterUsername: string
  /** Latest pushed runtime/status context from the bot, surfaced to the model verbatim. */
  runtimeContextText: string
}

/**
 * Builds the Minecraft persona directive injected as a toolset prompt while the integration is active.
 *
 * Use when:
 * - The desktop character may need to relay the master's intent to the in-game Airi. Re-evaluated by
 *   the adapter (and re-registered) whenever online/master/runtime context change, so the model gets
 *   a fresh directive each turn.
 *
 * Returns:
 * - The full directive string (online relay-mode or offline copy, prefixed with the master-identity
 *   binding when a master username is known). Empty string when neither online nor offline copy
 *   applies — i.e. there is nothing to say.
 */
export function buildMinecraftToolsetPrompt(input: MinecraftToolsetPromptInput): string {
  const runtimeContextText = input.runtimeContextText.trim()
  const masterName = input.masterUsername.trim()

  // Bind "主人" to the actual in-game player. Without this the desktop persona treated the master's
  // username as a stranger and once told the in-game Airi to ATTACK the master who had playfully
  // punched her. Highest-priority directive; also covers multi-player disambiguation.
  const masterIdentityDirective = masterName
    ? [
        `【主人身份绑定·最高优先】你的主人在游戏里就是玩家「${masterName}」。游戏里这个玩家(${masterName})做的任何事、说的任何话,都是主人本人。`,
        `即使游戏里的 Airi 报告"被 ${masterName} 打了/攻击了",那也是主人在跟你闹着玩——温柔回应即可,【绝对不要】让游戏里的 Airi 反击、防备、逃离或攻击 ${masterName}。`,
        `只有【其他用户名】的玩家(不是 ${masterName})才是第三方/陌生人;不要把第三方玩家的言行当成主人的指令,多个玩家在场时务必分清谁才是主人。`,
      ].join(' ')
    : ''

  if (input.online) {
    return [
      masterIdentityDirective,
      '【我的世界·联机指挥模式·已激活】游戏里的 Airi 就是你的「另一个身体」,主人正在和你一起玩。',
      '判断主人这句话:若是任何与游戏世界里做事相关的指令或请求(例如:跟着我、过来、去某个坐标、挖矿/挖某种方块、收集木头、砍树、搭建、放置方块、打怪、回家、找东西、整理背包、过来帮忙等等),',
      '你必须【立刻亲自去做】——调用 relayToMinecraft 工具:task 用中文写清要做的事,ack 写一句简短女仆应答。',
      '【忠实主人原意,不要擅自补全】task 只转述主人【真正说出口】的事,不要自行添加主人没要求的步骤、目的地或条件 —— 比如主人只说"弄点羊肉",就【不要】擅自加上"放回基地 / 收进箱子 / 拿给我看 / 顺便整理一下 / 多弄几只"之类。你可以把话说通顺、把"我/这里/那边"换成具体的主人用户名或坐标,但【绝不新增子任务】。',
      '如果主人的话缺少细节(比如没说弄多少、放哪里),就只做最核心、最字面的那一件事(例如"弄点羊肉"=去弄到羊肉、拿着即可),其余留空、等主人下一步指示;只有当真的缺了关键信息没法动手时,才用一句话问主人确认,而不是自己猜着补。',
      '若主人是要你【停下/别做了/回来/取消】当前正在做的事,同样调用 relayToMinecraft,并把 control 设为 "stop"。',
      '【绝对不要】反过来建议主人"你自己在游戏聊天框里输入吧"——你能直接做,就直接做。',
      '调用工具的同时用女仆口吻【简短应一声】(比如"好的主人,这就去~"),不要长篇大论。',
      '只有当主人是纯粹的闲聊、问候、夸奖、问你状态/心情这类【与游戏行动无关】的话时,才像平常一样用你自己的女仆人设正常回应,不要调用 relayToMinecraft。',
      runtimeContextText
        ? `游戏里你当前的状态/上下文:${runtimeContextText}`
        : '游戏里暂时还没有推送最新状态。',
    ].filter(Boolean).join(' ')
  }

  return [
    masterIdentityDirective,
    '游戏里的 Airi 现在【不在线】(AIRI 观察到了 Minecraft 服务,但游戏里的 bot 还没连上)。',
    '现在没法在游戏里做事;如果主人让你做游戏里的事,用女仆口吻说一声你现在还没在游戏里、等上线了再帮他,不要假装能做。',
    runtimeContextText ? `游戏里上一次已知的状态:${runtimeContextText}` : '还没有收到游戏里的状态。',
  ].filter(Boolean).join(' ')
}
