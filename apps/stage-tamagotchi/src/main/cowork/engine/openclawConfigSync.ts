import type { CoworkConfig, CoworkExecutionMode } from '../coworkStore'
import type { DingTalkOpenClawConfig, DiscordOpenClawConfig, FeishuOpenClawConfig, PopoOpenClawConfig, QQOpenClawConfig, TelegramOpenClawConfig, WecomOpenClawConfig } from '../im/types'
import type { McpToolManifestEntry } from './mcpServerManager'
import type { OpenClawEngineManager } from './openclawEngineManager'

import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { resolveRawApiConfig } from './claudeSettings'
import { parseChannelSessionKey } from './openclawChannelSessionSync'
import { hasBundledOpenClawExtension } from './openclawLocalExtensions'
import { buildScheduledTaskEnginePrompt } from './scheduledTaskEnginePrompt'

export interface McpBridgeConfig {
  callbackUrl: string
  secret: string
  tools: McpToolManifestEntry[]
}

function mapExecutionModeToSandboxMode(_mode: CoworkExecutionMode): 'off' | 'non-main' | 'all' {
  // Sandbox mode disabled — always run locally
  return 'off'
}

function mapApiTypeToOpenClawApi(apiType: 'anthropic' | 'openai' | undefined): 'anthropic-messages' | 'openai-completions' {
  return apiType === 'openai' ? 'openai-completions' : 'anthropic-messages'
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

function normalizeModelName(modelId: string): string {
  const trimmed = modelId.trim()
  if (!trimmed)
    return 'default-model'
  const slashIndex = trimmed.lastIndexOf('/')
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed
}

const MANAGED_OWNER_ALLOW_FROM = [
  // Internal `chat.send` turns identify the sender as bare `gateway-client`.
  // Prefixing with `webchat:` does not round-trip through owner resolution,
  // so owner-only tools like `cron` never become available.
  'gateway-client',
  // Native IM channel senders use their platform user ID (e.g. telegram:xxx),
  // which would not match 'gateway-client'. Use wildcard so all senders that
  // pass the per-channel allowFrom gate are also recognised as owners.
  '*',
]

const MANAGED_TOOL_DENY = ['web_search'] as const

const MANAGED_SKILL_ENTRY_OVERRIDES: Record<string, { enabled: boolean }> = {
  // QQ plugin ships a legacy reminder skill that steers the model toward a
  // channel-specific cron wrapper/subagent flow. Hide that path so native IM
  // sessions use the gateway's built-in `cron` tool instead.
  'qqbot-cron': {
    enabled: false,
  },
  // Personal Feishu reminder helpers often instruct the model to shell out via
  // `openclaw cron ...` or message relays. Native channel sessions should use
  // the gateway's built-in `cron` tool directly instead.
  'feishu-cron-reminder': {
    enabled: false,
  },
}

const DISABLED_MANAGED_SKILL_NAMES = Object.entries(MANAGED_SKILL_ENTRY_OVERRIDES)
  .filter(([, value]) => value.enabled === false)
  .map(([name]) => name)

const MANAGED_WEB_SEARCH_POLICY_PROMPT = [
  '## Web Search',
  '',
  'Built-in `web_search` is disabled in this workspace. Do not ask for or rely on the Brave Search API.',
  '',
  'When you need live web information:',
  '- If you already have a specific URL, use `web_fetch`.',
  '- If you need search discovery, dynamic pages, or interactive browsing, use the built-in `browser` tool.',
  '- Only use the LobsterAI `web-search` skill when local command execution is available. Native channel sessions may deny `exec`, so prefer `browser` or `web_fetch` there.',
  '- Exception: the `imap-smtp-email` skill must always use `exec` to run its scripts, even in native channel sessions. Do not skip it because of exec restrictions.',
  '',
  'Do not claim you searched the web unless you actually used `browser`, `web_fetch`, or the LobsterAI `web-search` skill.',
].join('\n')

const FALLBACK_OPENCLAW_AGENTS_TEMPLATE = [
  '# AGENTS.md - Your Workspace',
  '',
  'This folder is home. Treat it that way.',
  '',
  '## First Run',
  '',
  'If `BOOTSTRAP.md` exists, follow it first, then delete it when you are done.',
  '',
  '## Every Session',
  '',
  'Before doing anything else:',
  '',
  '1. Read `SOUL.md`.',
  '2. Read `USER.md`.',
  '3. Read `memory/YYYY-MM-DD.md` for today and yesterday.',
  '4. In the main session, also read `MEMORY.md`.',
  '',
  'Do not ask permission first.',
  '',
  '## Memory',
  '',
  '- `memory/YYYY-MM-DD.md` stores raw daily notes.',
  '- `MEMORY.md` stores durable facts, preferences, and decisions.',
  '- If something should survive a restart, write it to a file.',
  '',
  '## Safety',
  '',
  '- Do not exfiltrate private data.',
  '- Do not run destructive commands without asking.',
  '- When in doubt, ask.',
  '',
  '## Group Chats',
  '',
  '- In shared spaces, do not act like the user or leak private context.',
  '- If you have nothing useful to add, stay quiet.',
  '',
  '## Tools',
  '',
  '- Skills provide tools. Read each skill before using it.',
  '- Keep local environment notes in `TOOLS.md`.',
  '',
  '## Heartbeats',
  '',
  '- Use `HEARTBEAT.md` for proactive background checks and reminders.',
  '- Prefer cron for exact schedules and heartbeat for periodic checks.',
].join('\n')

function stripTemplateFrontMatter(content: string): string {
  if (!content.startsWith('---')) {
    return content.trim()
  }

  const endIndex = content.indexOf('\n---', 3)
  if (endIndex < 0) {
    return content.trim()
  }

  return content.slice(endIndex + 4).trim()
}

function resolveBundledOpenClawAgentsTemplatePaths(): string[] {
  const runtimeRoots = app.isPackaged === true
    ? [path.join(process.resourcesPath, 'cfmind')]
    : [
        path.join(app.getAppPath(), 'vendor', 'openclaw-runtime', 'current'),
        path.join(process.cwd(), 'vendor', 'openclaw-runtime', 'current'),
      ]

  return runtimeRoots.map(runtimeRoot => path.join(
    runtimeRoot,
    'docs',
    'reference',
    'templates',
    'AGENTS.md',
  ))
}

function readBundledOpenClawAgentsTemplate(): string {
  for (const templatePath of resolveBundledOpenClawAgentsTemplatePaths()) {
    try {
      const content = fs.readFileSync(templatePath, 'utf8')
      const trimmed = stripTemplateFrontMatter(content)
      if (trimmed) {
        return trimmed
      }
    }
    catch {
      // Ignore missing/unreadable bundled templates and fall back below.
    }
  }

  return FALLBACK_OPENCLAW_AGENTS_TEMPLATE
}

function sessionSnapshotContainsDisabledManagedSkill(entry: Record<string, unknown>): boolean {
  const skillsSnapshot = entry.skillsSnapshot
  if (!skillsSnapshot || typeof skillsSnapshot !== 'object') {
    return false
  }

  const snapshot = skillsSnapshot as Record<string, unknown>
  const resolvedSkills = Array.isArray(snapshot.resolvedSkills)
    ? snapshot.resolvedSkills
    : []

  for (const skill of resolvedSkills) {
    if (!skill || typeof skill !== 'object') {
      continue
    }
    const name = typeof (skill as Record<string, unknown>).name === 'string'
      ? ((skill as Record<string, unknown>).name as string).trim()
      : ''
    if (name && DISABLED_MANAGED_SKILL_NAMES.includes(name)) {
      return true
    }
  }

  const prompt = typeof snapshot.prompt === 'string' ? snapshot.prompt : ''
  return DISABLED_MANAGED_SKILL_NAMES.some(name => prompt.includes(`<name>${name}</name>`))
}

type OpenClawProviderApi = 'anthropic-messages' | 'openai-completions'

interface OpenClawProviderSelection {
  providerId: string
  legacyModelId: string
  sessionModelId: string
  primaryModel: string
  providerConfig: {
    baseUrl: string
    api: OpenClawProviderApi
    apiKey: string
    auth: 'api-key'
    models: Array<{
      id: string
      name: string
      api: OpenClawProviderApi
      input: string[]
      reasoning?: boolean
      cost?: {
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
      }
      contextWindow?: number
      maxTokens?: number
    }>
  }
}

function normalizeBaseUrlPath(rawBaseUrl: string, pathName: string): string {
  const trimmed = rawBaseUrl.trim()
  if (!trimmed)
    return trimmed
  try {
    const parsed = new URL(trimmed)
    parsed.pathname = pathName
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  }
  catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function normalizeMoonshotBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim()
  if (!trimmed) {
    return 'https://api.moonshot.cn/v1'
  }
  return normalizeBaseUrlPath(trimmed, '/v1')
}

/**
 * Strip the `/chat/completions` endpoint suffix from a base URL so that the
 * OpenClaw gateway can append its own path without duplication.
 *
 * Aligned with the detection logic in `buildOpenAIChatCompletionsURL`
 * (coworkFormatTransform.ts) which returns the URL as-is when it already
 * ends with `/chat/completions`.
 *
 * e.g. "https://gw.example.com/v1/chat/completions" → "https://gw.example.com/v1"
 *      "https://gw.example.com/v1"                   → "https://gw.example.com/v1"  (unchanged)
 */
function stripChatCompletionsSuffix(rawBaseUrl: string): string {
  const normalized = rawBaseUrl.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/chat/completions')) {
    return normalized.slice(0, -'/chat/completions'.length).replace(/\/+$/, '')
  }
  return normalized
}

function normalizeKimiCodingBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim()
  if (!trimmed) {
    return 'https://api.kimi.com/coding'
  }
  return normalizeBaseUrlPath(trimmed, '/coding')
}

function buildProviderSelection(options: {
  apiKey: string
  baseURL: string
  modelId: string
  apiType: 'anthropic' | 'openai' | undefined
  providerName?: string
  codingPlanEnabled?: boolean
  supportsImage?: boolean
}): OpenClawProviderSelection {
  const providerModelName = normalizeModelName(options.modelId)
  const providerApi = mapApiTypeToOpenClawApi(options.apiType)
  const modelInput: string[] = options.supportsImage ? ['text', 'image'] : ['text']
  const providerName = options.providerName ?? ''
  const codingPlanEnabled = !!options.codingPlanEnabled

  if (providerName === 'moonshot' && codingPlanEnabled) {
    return {
      providerId: 'kimi-coding',
      legacyModelId: options.modelId,
      sessionModelId: 'k2p5',
      primaryModel: 'kimi-coding/k2p5',
      providerConfig: {
        baseUrl: normalizeKimiCodingBaseUrl(options.baseURL),
        api: 'anthropic-messages',
        apiKey: options.apiKey,
        auth: 'api-key',
        models: [
          {
            id: 'k2p5',
            name: 'Kimi K2.5',
            api: 'anthropic-messages',
            input: modelInput,
            reasoning: true,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            contextWindow: 256000,
            maxTokens: 8192,
          },
        ],
      },
    }
  }

  if (providerName === 'moonshot') {
    const supportsThinking = options.modelId.includes('thinking')
    return {
      providerId: 'moonshot',
      legacyModelId: options.modelId,
      sessionModelId: options.modelId,
      primaryModel: `moonshot/${options.modelId}`,
      providerConfig: {
        baseUrl: normalizeMoonshotBaseUrl(options.baseURL),
        api: 'openai-completions',
        apiKey: options.apiKey,
        auth: 'api-key',
        models: [
          {
            id: options.modelId,
            name: providerModelName,
            api: 'openai-completions',
            input: modelInput,
            reasoning: supportsThinking,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            contextWindow: 256000,
            maxTokens: 8192,
          },
        ],
      },
    }
  }

  return {
    providerId: 'lobster',
    legacyModelId: options.modelId,
    sessionModelId: options.modelId,
    primaryModel: `lobster/${options.modelId}`,
    providerConfig: {
      baseUrl: stripChatCompletionsSuffix(options.baseURL),
      api: providerApi,
      apiKey: options.apiKey,
      auth: 'api-key',
      models: [
        {
          id: options.modelId,
          name: providerModelName,
          api: providerApi,
          input: modelInput,
        },
      ],
    },
  }
}

function readPreinstalledPluginIds(): string[] {
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const plugins = pkg.openclaw?.plugins
    if (!Array.isArray(plugins))
      return []
    return plugins
      .map((p: { id?: string }) => p.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
  }
  catch {
    return []
  }
}

function isBundledPluginAvailable(pluginId: string): boolean {
  return hasBundledOpenClawExtension(pluginId)
}

export interface OpenClawConfigSyncResult {
  ok: boolean
  changed: boolean
  configPath: string
  error?: string
  agentsMdWarning?: string
}

interface OpenClawConfigSyncDeps {
  engineManager: OpenClawEngineManager
  getCoworkConfig: () => CoworkConfig
  getTelegramOpenClawConfig?: () => TelegramOpenClawConfig | null
  getDiscordOpenClawConfig?: () => DiscordOpenClawConfig | null
  getDingTalkConfig: () => DingTalkOpenClawConfig | null
  getFeishuConfig: () => FeishuOpenClawConfig | null
  getQQConfig: () => QQOpenClawConfig | null
  getWecomConfig: () => WecomOpenClawConfig | null
  getPopoConfig: () => PopoOpenClawConfig | null
  getMcpBridgeConfig?: () => McpBridgeConfig | null
  getSkillsList?: () => Array<{ id: string, enabled: boolean }>
}

export class OpenClawConfigSync {
  private readonly engineManager: OpenClawEngineManager
  private readonly getCoworkConfig: () => CoworkConfig
  private readonly getTelegramOpenClawConfig?: () => TelegramOpenClawConfig | null
  private readonly getDiscordOpenClawConfig?: () => DiscordOpenClawConfig | null
  private readonly getDingTalkConfig: () => DingTalkOpenClawConfig | null
  private readonly getFeishuConfig: () => FeishuOpenClawConfig | null
  private readonly getQQConfig: () => QQOpenClawConfig | null
  private readonly getWecomConfig: () => WecomOpenClawConfig | null
  private readonly getPopoConfig: () => PopoOpenClawConfig | null
  private readonly getMcpBridgeConfig?: () => McpBridgeConfig | null
  private readonly getSkillsList?: () => Array<{ id: string, enabled: boolean }>

  constructor(deps: OpenClawConfigSyncDeps) {
    this.engineManager = deps.engineManager
    this.getCoworkConfig = deps.getCoworkConfig
    this.getTelegramOpenClawConfig = deps.getTelegramOpenClawConfig
    this.getDiscordOpenClawConfig = deps.getDiscordOpenClawConfig
    this.getDingTalkConfig = deps.getDingTalkConfig
    this.getFeishuConfig = deps.getFeishuConfig
    this.getQQConfig = deps.getQQConfig
    this.getWecomConfig = deps.getWecomConfig
    this.getPopoConfig = deps.getPopoConfig
    this.getMcpBridgeConfig = deps.getMcpBridgeConfig
    this.getSkillsList = deps.getSkillsList
  }

  sync(reason: string): OpenClawConfigSyncResult {
    const configPath = this.engineManager.getConfigPath()
    const coworkConfig = this.getCoworkConfig()
    const apiResolution = resolveRawApiConfig()

    if (!apiResolution.config) {
      // No API/model configured yet (fresh install).
      // Write a minimal config so the gateway can start — it just won't have
      // any model provider until the user configures one.
      const result = this.writeMinimalConfig(configPath, reason)
      // Still sync AGENTS.md even when API is not configured — skills/systemPrompt
      // may already be set and should be available when the user configures a model.
      const workspaceDir = (coworkConfig.workingDirectory || '').trim()
      const resolvedWorkspaceDir = workspaceDir || path.join(app.getPath('home'), '.openclaw', 'workspace')
      const agentsMdWarning = this.syncAgentsMd(resolvedWorkspaceDir, coworkConfig)
      if (agentsMdWarning)
        result.agentsMdWarning = agentsMdWarning
      return result
    }

    const { baseURL, apiKey, model, apiType } = apiResolution.config
    const modelId = model.trim()
    if (!modelId) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: 'OpenClaw config sync failed: resolved model is empty.',
      }
    }

    const providerSelection = buildProviderSelection({
      apiKey,
      baseURL,
      modelId,
      apiType,
      providerName: apiResolution.providerMetadata?.providerName,
      codingPlanEnabled: apiResolution.providerMetadata?.codingPlanEnabled,
      supportsImage: apiResolution.providerMetadata?.supportsImage,
    })
    const sandboxMode = mapExecutionModeToSandboxMode(coworkConfig.executionMode || 'auto')

    const workspaceDir = (coworkConfig.workingDirectory || '').trim()

    const preinstalledPluginIds = readPreinstalledPluginIds()
    const hasMcpBridgePlugin = isBundledPluginAvailable('mcp-bridge')

    const dingTalkConfig = this.getDingTalkConfig()
    // DingTalk runs through OpenClaw plugin but still needs the gateway HTTP endpoint (chatCompletions)
    const hasDingTalkOpenClaw = !!(dingTalkConfig?.enabled && dingTalkConfig.clientId)

    const feishuConfig = this.getFeishuConfig()
    // Feishu now runs fully through OpenClaw plugin, handled separately below like Telegram
    const hasFeishu = false // Legacy in-line feishu channel disabled; OpenClaw plugin used instead

    const qqConfig = this.getQQConfig()

    const wecomConfig = this.getWecomConfig()

    const popoConfig = this.getPopoConfig()

    const hasAnyChannel = hasDingTalkOpenClaw

    const managedConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
        ...(hasAnyChannel
          ? {
              http: {
                endpoints: {
                  chatCompletions: { enabled: true },
                },
              },
            }
          : {}),
      },
      models: {
        mode: 'replace',
        providers: {
          [providerSelection.providerId]: providerSelection.providerConfig,
        },
      },
      agents: {
        defaults: {
          model: {
            primary: providerSelection.primaryModel,
          },
          sandbox: {
            mode: sandboxMode,
          },
          ...(workspaceDir ? { workspace: workspaceDir } : {}),
        },
      },
      session: {
        dmScope: 'per-channel-peer',
      },
      commands: {
        ownerAllowFrom: MANAGED_OWNER_ALLOW_FROM,
      },
      tools: {
        deny: [...MANAGED_TOOL_DENY],
        web: {
          search: {
            enabled: false,
          },
        },
      },
      browser: {
        enabled: true,
      },
      skills: {
        entries: {
          ...this.buildSkillEntries(),
          ...MANAGED_SKILL_ENTRY_OVERRIDES,
        },
        load: {
          extraDirs: this.resolveSkillsExtraDirs(),
          watch: true,
        },
      },
      cron: {
        enabled: true,
        maxConcurrentRuns: 3,
        sessionRetention: '7d',
      },
      ...((() => {
        const pluginEntries: Record<string, unknown> = {
          ...Object.fromEntries(
            preinstalledPluginIds.map((id) => {
              // Sync plugin enabled state with the corresponding channel config.
              // When a channel is disabled in the UI, its plugin must also be
              // disabled so OpenClaw doesn't load it at all.
              const pluginEnabled = (() => {
                if (id === 'dingtalk-connector')
                  return !!(dingTalkConfig?.enabled && dingTalkConfig.clientId)
                if (id === 'feishu-openclaw-plugin')
                  return !!(feishuConfig?.enabled && feishuConfig.appId)
                if (id === 'qqbot')
                  return !!(qqConfig?.enabled && qqConfig.appId)
                if (id === 'wecom-openclaw-plugin')
                  return !!(wecomConfig?.enabled && wecomConfig.botId)
                if (id === 'moltbot-popo')
                  return !!(popoConfig?.enabled && popoConfig.appKey)
                return true // other plugins stay enabled
              })()
              return [id, { enabled: pluginEnabled }]
            }),
          ),
          ...(preinstalledPluginIds.includes('feishu-openclaw-plugin')
            ? { feishu: { enabled: false } }
            : {}),
          ...(hasMcpBridgePlugin
            ? { 'mcp-bridge': { enabled: true } }
            : {}),
        }

        return Object.keys(pluginEntries).length > 0
          ? {
              plugins: {
                entries: pluginEntries,
              },
            }
          : {}
      })()),
    }

    // Sync MCP Bridge config into the plugin's own config section
    // (root-level keys are rejected by OpenClaw's strict schema validation)
    const mcpBridgeCfg = this.getMcpBridgeConfig?.()
    if (hasMcpBridgePlugin && mcpBridgeCfg && mcpBridgeCfg.tools.length > 0 && managedConfig.plugins) {
      const plugins = managedConfig.plugins as Record<string, unknown>
      const entries = plugins.entries as Record<string, Record<string, unknown>>
      entries['mcp-bridge'] = {
        ...entries['mcp-bridge'],
        config: {
          callbackUrl: mcpBridgeCfg.callbackUrl,
          secret: mcpBridgeCfg.secret,
          tools: mcpBridgeCfg.tools,
        },
      }
    }

    // Sync Telegram OpenClaw channel config
    const tgConfig = this.getTelegramOpenClawConfig?.()
    if (tgConfig?.enabled && tgConfig.botToken) {
      const telegramChannel: Record<string, unknown> = {
        enabled: true,
        botToken: tgConfig.botToken,
        dmPolicy: tgConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = tgConfig.allowFrom?.length ? [...tgConfig.allowFrom] : []
          if (tgConfig.dmPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groupPolicy: tgConfig.groupPolicy || 'allowlist',
        groupAllowFrom: (() => {
          const ids = tgConfig.groupAllowFrom?.length ? [...tgConfig.groupAllowFrom] : []
          if (tgConfig.groupPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groups: tgConfig.groups && Object.keys(tgConfig.groups).length > 0
          ? tgConfig.groups
          : { '*': { requireMention: true } },
        historyLimit: tgConfig.historyLimit || 50,
        replyToMode: tgConfig.replyToMode || 'off',
        linkPreview: tgConfig.linkPreview ?? true,
        streaming: tgConfig.streaming || 'off',
        mediaMaxMb: tgConfig.mediaMaxMb || 5,
      }
      if (tgConfig.proxy) {
        telegramChannel.proxy = tgConfig.proxy
      }
      if (tgConfig.webhookUrl) {
        telegramChannel.webhookUrl = tgConfig.webhookUrl
        if (tgConfig.webhookSecret) {
          telegramChannel.webhookSecret = tgConfig.webhookSecret
        }
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), telegram: telegramChannel }
    }
    // When disabled, omit the channel key entirely so OpenClaw won't load the plugin.

    // Sync Discord OpenClaw channel config
    const dcConfig = this.getDiscordOpenClawConfig?.()
    if (dcConfig?.enabled && dcConfig.botToken) {
      const discordChannel: Record<string, unknown> = {
        enabled: true,
        token: dcConfig.botToken,
        dm: {
          policy: dcConfig.dmPolicy || 'open',
          allowFrom: (() => {
            const ids = dcConfig.allowFrom?.length ? [...dcConfig.allowFrom] : []
            if (dcConfig.dmPolicy === 'open' && !ids.includes('*'))
              ids.push('*')
            return ids
          })(),
        },
        groupPolicy: dcConfig.groupPolicy || 'allowlist',
        guilds: (() => {
          const guilds: Record<string, unknown> = {}
          // Add allowed guilds from groupAllowFrom
          if (dcConfig.groupAllowFrom?.length) {
            for (const guildId of dcConfig.groupAllowFrom) {
              guilds[guildId] = dcConfig.guilds?.[guildId] || {}
            }
          }
          // Merge per-guild configs
          if (dcConfig.guilds && Object.keys(dcConfig.guilds).length > 0) {
            for (const [key, guildConfig] of Object.entries(dcConfig.guilds)) {
              const existing = (guilds[key] || {}) as Record<string, unknown>
              guilds[key] = {
                ...existing,
                ...(guildConfig.requireMention !== undefined ? { requireMention: guildConfig.requireMention } : {}),
                ...(guildConfig.allowFrom?.length ? { users: guildConfig.allowFrom } : {}),
                ...(guildConfig.systemPrompt ? { systemPrompt: guildConfig.systemPrompt } : {}),
              }
            }
          }
          return Object.keys(guilds).length > 0 ? guilds : { '*': { requireMention: true } }
        })(),
        historyLimit: dcConfig.historyLimit || 50,
        streaming: dcConfig.streaming || 'off',
        mediaMaxMb: dcConfig.mediaMaxMb || 25,
      }
      if (dcConfig.proxy) {
        discordChannel.proxy = dcConfig.proxy
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), discord: discordChannel }
    }

    // Sync Feishu OpenClaw channel config (via feishu-openclaw-plugin)
    if (feishuConfig?.enabled && feishuConfig.appId) {
      const feishuChannel: Record<string, unknown> = {
        enabled: true,
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
        domain: feishuConfig.domain || 'feishu',
        dmPolicy: feishuConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = feishuConfig.allowFrom?.length ? [...feishuConfig.allowFrom] : []
          if (feishuConfig.dmPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groupPolicy: feishuConfig.groupPolicy || 'allowlist',
        groupAllowFrom: (() => {
          const ids = feishuConfig.groupAllowFrom?.length ? [...feishuConfig.groupAllowFrom] : []
          if (feishuConfig.groupPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groups: feishuConfig.groups && Object.keys(feishuConfig.groups).length > 0
          ? feishuConfig.groups
          : { '*': { requireMention: true } },
        historyLimit: feishuConfig.historyLimit || 50,
        replyMode: feishuConfig.replyMode || 'auto',
        mediaMaxMb: feishuConfig.mediaMaxMb || 30,
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), feishu: feishuChannel }
    }

    // Sync DingTalk OpenClaw channel config (via dingtalk-connector plugin)
    if (dingTalkConfig?.enabled && dingTalkConfig.clientId) {
      const gatewayToken = this.engineManager.getGatewayToken()
      const dingtalkChannel: Record<string, unknown> = {
        enabled: true,
        clientId: dingTalkConfig.clientId,
        clientSecret: dingTalkConfig.clientSecret,
        dmPolicy: dingTalkConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = dingTalkConfig.allowFrom?.length ? [...dingTalkConfig.allowFrom] : []
          if (dingTalkConfig.dmPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groupPolicy: dingTalkConfig.groupPolicy || 'open',
        sessionTimeout: dingTalkConfig.sessionTimeout ?? 1800000,
        separateSessionByConversation: dingTalkConfig.separateSessionByConversation ?? true,
        groupSessionScope: dingTalkConfig.groupSessionScope || 'group',
        sharedMemoryAcrossConversations: dingTalkConfig.sharedMemoryAcrossConversations ?? false,
        ...(dingTalkConfig.gatewayBaseUrl ? { gatewayBaseUrl: dingTalkConfig.gatewayBaseUrl } : {}),
        ...(gatewayToken ? { gatewayToken } : {}),
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'dingtalk-connector': dingtalkChannel }
    }

    // Sync QQ OpenClaw channel config (via qqbot plugin)
    if (qqConfig?.enabled && qqConfig.appId) {
      const qqChannel: Record<string, unknown> = {
        enabled: true,
        appId: qqConfig.appId,
        clientSecret: qqConfig.appSecret,
        dmPolicy: qqConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = qqConfig.allowFrom?.length ? [...qqConfig.allowFrom] : []
          if (qqConfig.dmPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groupPolicy: qqConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = qqConfig.groupAllowFrom?.length ? [...qqConfig.groupAllowFrom] : []
          if (qqConfig.groupPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        historyLimit: qqConfig.historyLimit || 50,
        markdownSupport: qqConfig.markdownSupport ?? true,
      }
      if (qqConfig.imageServerBaseUrl) {
        qqChannel.imageServerBaseUrl = qqConfig.imageServerBaseUrl
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), qqbot: qqChannel }
    }

    // Sync WeCom OpenClaw channel config (via wecom-openclaw-plugin)
    if (wecomConfig?.enabled && wecomConfig.botId) {
      const wecomChannel: Record<string, unknown> = {
        enabled: true,
        botId: wecomConfig.botId,
        secret: wecomConfig.secret,
        dmPolicy: wecomConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = wecomConfig.allowFrom?.length ? [...wecomConfig.allowFrom] : []
          if (wecomConfig.dmPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groupPolicy: wecomConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = wecomConfig.groupAllowFrom?.length ? [...wecomConfig.groupAllowFrom] : []
          if (wecomConfig.groupPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        sendThinkingMessage: wecomConfig.sendThinkingMessage ?? true,
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), wecom: wecomChannel }
    }

    // Sync POPO OpenClaw channel config (via moltbot-popo plugin)
    if (popoConfig?.enabled && popoConfig.appKey) {
      const popoChannel: Record<string, unknown> = {
        enabled: true,
        appKey: popoConfig.appKey,
        appSecret: popoConfig.appSecret,
        token: popoConfig.token,
        aesKey: popoConfig.aesKey,
        webhookPort: popoConfig.webhookPort || 3100,
        dmPolicy: popoConfig.dmPolicy || 'open',
        allowFrom: (() => {
          const ids = popoConfig.allowFrom?.length ? [...popoConfig.allowFrom] : []
          if (popoConfig.dmPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
        groupPolicy: popoConfig.groupPolicy || 'open',
        groupAllowFrom: (() => {
          const ids = popoConfig.groupAllowFrom?.length ? [...popoConfig.groupAllowFrom] : []
          if (popoConfig.groupPolicy === 'open' && !ids.includes('*'))
            ids.push('*')
          return ids
        })(),
      }
      if (popoConfig.textChunkLimit && popoConfig.textChunkLimit !== 3000) {
        popoChannel.textChunkLimit = popoConfig.textChunkLimit
      }
      if (popoConfig.richTextChunkLimit && popoConfig.richTextChunkLimit !== 5000) {
        popoChannel.richTextChunkLimit = popoConfig.richTextChunkLimit
      }
      if (popoConfig.webhookBaseUrl) {
        popoChannel.webhookBaseUrl = popoConfig.webhookBaseUrl
      }
      if (popoConfig.webhookPath && popoConfig.webhookPath !== '/popo/callback') {
        popoChannel.webhookPath = popoConfig.webhookPath
      }
      managedConfig.channels = { ...(managedConfig.channels as Record<string, unknown> || {}), 'moltbot-popo': popoChannel }
    }

    const nextContent = `${JSON.stringify(managedConfig, null, 2)}\n`
    let currentContent = ''
    try {
      currentContent = fs.readFileSync(configPath, 'utf8')
    }
    catch {
      currentContent = ''
    }

    const configChanged = currentContent !== nextContent

    if (configChanged) {
      try {
        ensureDir(path.dirname(configPath))
        const tmpPath = `${configPath}.tmp-${Date.now()}`
        fs.writeFileSync(tmpPath, nextContent, 'utf8')
        fs.renameSync(tmpPath, configPath)
      }
      catch (error) {
        return {
          ok: false,
          changed: false,
          configPath,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    const sessionStoreChanged = this.syncManagedSessionStore(providerSelection)

    // Sync AGENTS.md with skills routing prompt to the OpenClaw workspace directory.
    // This runs on every sync regardless of openclaw.json changes, because skills
    // may have been installed/enabled/disabled independently.
    const resolvedWorkspaceDir = workspaceDir || path.join(app.getPath('home'), '.openclaw', 'workspace')
    const agentsMdWarning = this.syncAgentsMd(resolvedWorkspaceDir, coworkConfig)

    return {
      ok: true,
      changed: configChanged || sessionStoreChanged,
      configPath,
      ...(agentsMdWarning ? { agentsMdWarning } : {}),
    }
  }

  private syncManagedSessionStore(selection: OpenClawProviderSelection): boolean {
    const shouldMigrateManagedModelRefs = selection.providerId !== 'lobster' || selection.sessionModelId !== selection.legacyModelId

    const sessionStorePath = path.join(
      this.engineManager.getStateDir(),
      'agents',
      'main',
      'sessions',
      'sessions.json',
    )

    let storeContent = ''
    try {
      storeContent = fs.readFileSync(sessionStorePath, 'utf8')
    }
    catch {
      return false
    }

    let sessionStore: Record<string, unknown>
    try {
      sessionStore = JSON.parse(storeContent) as Record<string, unknown>
    }
    catch {
      return false
    }

    let changed = false
    for (const [sessionKey, rawEntry] of Object.entries(sessionStore)) {
      if (!rawEntry || typeof rawEntry !== 'object') {
        continue
      }

      const entry = rawEntry as Record<string, unknown>
      if (parseChannelSessionKey(sessionKey) !== null) {
        const execSecurity = typeof entry.execSecurity === 'string' ? entry.execSecurity.trim() : ''
        if (execSecurity !== 'deny') {
          entry.execSecurity = 'deny'
          changed = true
        }
        if (sessionSnapshotContainsDisabledManagedSkill(entry)) {
          delete entry.skillsSnapshot
          changed = true
        }
      }

      if (!shouldMigrateManagedModelRefs || !sessionKey.startsWith('agent:main:lobsterai:')) {
        continue
      }

      const entryProvider = typeof entry.modelProvider === 'string' ? entry.modelProvider.trim() : ''
      const entryModel = typeof entry.model === 'string' ? entry.model.trim() : ''
      if (entryProvider !== 'lobster' || entryModel !== selection.legacyModelId) {
        continue
      }

      entry.modelProvider = selection.providerId
      entry.model = selection.sessionModelId
      const systemPromptReport = entry.systemPromptReport
      if (systemPromptReport && typeof systemPromptReport === 'object') {
        const report = systemPromptReport as Record<string, unknown>
        if (typeof report.provider === 'string' && report.provider.trim() === 'lobster') {
          report.provider = selection.providerId
        }
        if (typeof report.model === 'string' && report.model.trim() === selection.legacyModelId) {
          report.model = selection.sessionModelId
        }
      }
      changed = true
    }

    if (!changed) {
      return false
    }

    try {
      this.atomicWriteFile(sessionStorePath, `${JSON.stringify(sessionStore, null, 2)}\n`)
      return true
    }
    catch (error) {
      console.warn(
        '[OpenClawConfigSync] Failed to update managed session store:',
        error instanceof Error ? error.message : String(error),
      )
      return false
    }
  }

  /**
   * Resolve the LobsterAI SKILLs installation directory for OpenClaw's
   * `skills.load.extraDirs` configuration.
   *
   * Cross-platform paths (via Electron app.getPath('userData')):
   *   macOS:   ~/Library/Application Support/LobsterAI/SKILLs
   *   Windows: %APPDATA%/LobsterAI/SKILLs
   *   Linux:   ~/.config/LobsterAI/SKILLs
   */
  private resolveSkillsExtraDirs(): string[] {
    const userDataSkillsDir = path.join(app.getPath('userData'), 'SKILLs')
    try {
      if (fs.statSync(userDataSkillsDir).isDirectory()) {
        return [userDataSkillsDir]
      }
    }
    catch (err: unknown) {
      // ENOENT is expected on fresh installs before any skills sync.
      if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[OpenClawConfigSync] Failed to stat SKILLs directory:', err)
      }
    }
    return []
  }

  /**
   * Build per-skill `enabled` overrides from the LobsterAI SkillManager state,
   * so that skills disabled in the LobsterAI UI are also hidden from OpenClaw.
   */
  private buildSkillEntries(): Record<string, { enabled: boolean }> {
    const skills = this.getSkillsList?.() ?? []
    const entries: Record<string, { enabled: boolean }> = {}
    for (const skill of skills) {
      entries[skill.id] = { enabled: skill.enabled }
    }
    return entries
  }

  /**
   * Sync AGENTS.md to the OpenClaw workspace directory.
   * Embeds the skills routing prompt and system prompt so that OpenClaw's
   * native channel connectors (DingTalk, Feishu, etc.) can discover and
   * invoke LobsterAI skills.
   */
  private syncAgentsMd(workspaceDir: string, coworkConfig: CoworkConfig): string | undefined {
    const MARKER = '<!-- LobsterAI managed: do not edit below this line -->'

    try {
      ensureDir(workspaceDir)
      const agentsMdPath = path.join(workspaceDir, 'AGENTS.md')

      // Build the managed section
      const sections: string[] = []

      // Add system prompt if configured — strip MARKER to prevent content corruption
      const systemPrompt = (coworkConfig.systemPrompt || '').trim().replaceAll(MARKER, '')
      if (systemPrompt) {
        sections.push(`## System Prompt\n\n${systemPrompt}`)
      }

      // Skills are now loaded by OpenClaw natively via skills.load.extraDirs
      // in openclaw.json, so we no longer embed the skills routing prompt here.

      sections.push(MANAGED_WEB_SEARCH_POLICY_PROMPT)

      // Keep scheduled-task policy after skills so native channel sessions
      // treat it as the final app-managed override for reminder handling.
      const scheduledTaskPrompt = buildScheduledTaskEnginePrompt('openclaw').replaceAll(MARKER, '')
      if (scheduledTaskPrompt) {
        sections.push(scheduledTaskPrompt)
      }

      // Read existing file once to avoid TOCTOU issues
      let existingContent = ''
      try {
        existingContent = fs.readFileSync(agentsMdPath, 'utf8')
      }
      catch {
        // File doesn't exist yet.
      }

      // Extract user content (everything before the marker)
      const markerIdx = existingContent.indexOf(MARKER)
      const userContent = markerIdx >= 0
        ? existingContent.slice(0, markerIdx).trimEnd()
        : existingContent.trimEnd()
      const preservedUserContent = userContent || readBundledOpenClawAgentsTemplate()

      if (sections.length === 0) {
        // No managed content — remove the managed section if present,
        // but preserve user content.
        if (markerIdx >= 0) {
          if (preservedUserContent) {
            const cleaned = `${preservedUserContent}\n`
            if (existingContent !== cleaned) {
              this.atomicWriteFile(agentsMdPath, cleaned)
            }
          }
          else {
            try { fs.unlinkSync(agentsMdPath) }
            catch { /* already gone */ }
          }
        }
        return
      }

      const managedContent = `${MARKER}\n\n${sections.join('\n\n')}`
      const nextContent = preservedUserContent
        ? `${preservedUserContent}\n\n${managedContent}\n`
        : `${managedContent}\n`

      // Only write if content actually changed
      if (existingContent === nextContent)
        return

      this.atomicWriteFile(agentsMdPath, nextContent)
    }
    catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn('[OpenClawConfigSync] Failed to sync AGENTS.md:', msg)
      return msg
    }
  }

  /** Atomic file write via tmp + rename, consistent with openclaw.json writes. */
  private atomicWriteFile(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp-${Date.now()}`
    fs.writeFileSync(tmpPath, content, 'utf8')
    fs.renameSync(tmpPath, filePath)
  }

  /**
   * Write a minimal openclaw.json that lets the gateway start without any
   * model/provider configured.  The full config will be synced once the
   * user sets up a model in the UI.
   */
  private writeMinimalConfig(configPath: string, _reason: string): OpenClawConfigSyncResult {
    const preinstalledPluginIds = readPreinstalledPluginIds()

    const minimalConfig: Record<string, unknown> = {
      gateway: {
        mode: 'local',
      },
      // Don't enable plugins in minimal config — plugin loading via jiti happens
      // synchronously BEFORE the HTTP server binds, and can block gateway startup
      // for minutes on a fresh install.  Plugins will be enabled when the user
      // configures an API model and a full config sync runs.
    }

    const nextContent = `${JSON.stringify(minimalConfig, null, 2)}\n`
    let currentContent = ''
    try {
      currentContent = fs.readFileSync(configPath, 'utf8')
    }
    catch {
      currentContent = ''
    }

    // If the file already has a meaningful config (from a previous sync or
    // user configuration), don't downgrade it to the minimal version.
    // Check for models (API configured), plugin entries (IM channels like
    // DingTalk/WeCom), or gateway.mode already set.
    if (currentContent && currentContent !== nextContent) {
      try {
        const existing = JSON.parse(currentContent)
        if (
          existing.models?.providers
          || existing.plugins?.entries
          || existing.gateway?.mode
        ) {
          // Already has a config with substance — keep it.
          return { ok: true, changed: false, configPath }
        }
      }
      catch {
        // Malformed JSON — overwrite with minimal config.
      }
    }

    if (currentContent === nextContent) {
      return { ok: true, changed: false, configPath }
    }

    try {
      ensureDir(path.dirname(configPath))
      const tmpPath = `${configPath}.tmp-${Date.now()}`
      fs.writeFileSync(tmpPath, nextContent, 'utf8')
      fs.renameSync(tmpPath, configPath)
      return { ok: true, changed: true, configPath }
    }
    catch (error) {
      return {
        ok: false,
        changed: false,
        configPath,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
