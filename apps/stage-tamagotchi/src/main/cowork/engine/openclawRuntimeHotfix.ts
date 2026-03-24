import fs from 'node:fs'
import path from 'node:path'

const CRON_OWNER_ONLY_PATTERN
  = /(function createCronTool\([^)]*\)\s*\{[\s\S]*?\bname:\s*"cron",[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*ownerOnly:\s*)true,/
const OWNER_ONLY_FALLBACK_PATTERN
  = /(const OWNER_ONLY_TOOL_NAME_FALLBACKS = new Set\(\[[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*"whatsapp_login",[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*)"cron",\s*\n(\s*"gateway"[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\]\);)/
const WECOM_EXEC_DENY_PATTERN
  = /const TOOL_DENY_BY_MESSAGE_PROVIDER = \{ voice: \["tts"\](?:,\s*wecom: \["exec", "process"\])? \};/
const CRON_DELIVERY_INFERENCE_OLD = `function inferDeliveryFromSessionKey(agentSessionKey) {
\tconst rawSessionKey = agentSessionKey?.trim();
\tif (!rawSessionKey) return null;
\tconst parsed = parseAgentSessionKey(stripThreadSuffixFromSessionKey(rawSessionKey));
\tif (!parsed || !parsed.rest) return null;
\tconst parts = parsed.rest.split(":").filter(Boolean);
\tif (parts.length === 0) return null;
\tconst head = parts[0]?.trim().toLowerCase();
\tif (!head || head === "main" || head === "subagent" || head === "acp") return null;
\tconst markerIndex = parts.findIndex((part) => part === "direct" || part === "dm" || part === "group" || part === "channel");
\tif (markerIndex === -1) return null;
\tconst peerId = parts.slice(markerIndex + 1).join(":").trim();
\tif (!peerId) return null;
\tlet channel;
\tif (markerIndex >= 1) channel = parts[0]?.trim().toLowerCase();
\tconst delivery = {
\t\tmode: "announce",
\t\tto: peerId
\t};
\tif (channel) delivery.channel = channel;
\treturn delivery;
}`
const CRON_DELIVERY_INFERENCE_NEW = `function inferDeliveryFromSessionKey(agentSessionKey) {
\tconst rawSessionKey = agentSessionKey?.trim();
\tif (!rawSessionKey) return null;
\tconst { deliveryContext, threadId } = extractDeliveryInfo(rawSessionKey);
\tconst persistedDelivery = normalizeDeliveryContext(deliveryContext);
\tif (persistedDelivery?.channel && persistedDelivery?.to) {
\t\tconst delivery = {
\t\t\tmode: "announce",
\t\t\tchannel: persistedDelivery.channel,
\t\t\tto: persistedDelivery.to
\t\t};
\t\tif (persistedDelivery.accountId) delivery.accountId = persistedDelivery.accountId;
\t\tif (persistedDelivery.threadId != null) delivery.threadId = persistedDelivery.threadId;
\t\telse if (threadId != null) delivery.threadId = threadId;
\t\treturn delivery;
\t}
\tconst jsonIdx = rawSessionKey.indexOf(":{");
\tif (jsonIdx > 0) {
\t\ttry {
\t\t\tconst ctx = JSON.parse(rawSessionKey.slice(jsonIdx + 1));
\t\t\tif (ctx && typeof ctx.channel === "string" && ctx.channel.trim()) {
\t\t\t\tconst channel = ctx.channel.trim().toLowerCase();
\t\t\t\tconst peerId = (ctx.peerid || ctx.peerId || ctx.conversationId || "").trim();
\t\t\t\tconst chatType = (ctx.chattype || ctx.chatType || "direct").trim().toLowerCase();
\t\t\t\tconst accountId = (ctx.accountid || ctx.accountId || "").trim();
\t\t\t\tif (peerId) {
\t\t\t\t\tconst to = chatType === "group" ? \`group:\${peerId}\` : \`user:\${peerId}\`;
\t\t\t\t\tconst delivery = { mode: "announce", channel, to };
\t\t\t\t\tif (accountId && accountId !== "__default__") delivery.accountId = accountId;
\t\t\t\t\tif (threadId != null) delivery.threadId = threadId;
\t\t\t\t\treturn delivery;
\t\t\t\t}
\t\t\t}
\t\t} catch {}
\t}
\tconst parsed = parseAgentSessionKey(stripThreadSuffixFromSessionKey(rawSessionKey));
\tif (!parsed || !parsed.rest) return null;
\tconst parts = parsed.rest.split(":").filter(Boolean);
\tif (parts.length === 0) return null;
\tconst head = parts[0]?.trim().toLowerCase();
\tif (!head || head === "main" || head === "subagent" || head === "acp") return null;
\tif (head === "dingtalk-connector") {
\t\tconst accountId = parts[1]?.trim();
\t\tconst senderId = parts[2]?.trim();
\t\tif (accountId && senderId) {
\t\t\tconst delivery = {
\t\t\t\tmode: "announce",
\t\t\t\tchannel: "dingtalk-connector",
\t\t\t\tto: \`user:\${senderId}\`,
\t\t\t\taccountId
\t\t\t};
\t\t\tif (threadId != null) delivery.threadId = threadId;
\t\t\treturn delivery;
\t\t}
\t}
\tconst markerIndex = parts.findIndex((part) => part === "direct" || part === "dm" || part === "group" || part === "channel");
\tif (markerIndex === -1) return null;
\tconst peerId = parts.slice(markerIndex + 1).join(":").trim();
\tif (!peerId) return null;
\tlet channel;
\tif (markerIndex >= 1) channel = parts[0]?.trim().toLowerCase();
\tconst delivery = {
\t\tmode: "announce",
\t\tto: peerId
\t};
\tif (channel) delivery.channel = channel;
\tif (threadId != null) delivery.threadId = threadId;
\treturn delivery;
}`
const CRON_REMINDER_PROMPT_OLD = [
  'function buildCronEventPrompt(pendingEvents, opts) {',
  '\tconst deliverToUser = opts?.deliverToUser ?? true;',
  '\tconst eventText = pendingEvents.join("\\n").trim();',
  '\tif (!eventText) {',
  '\t\tif (!deliverToUser) return "A scheduled cron event was triggered, but no event content was found. Handle this internally and reply HEARTBEAT_OK when nothing needs user-facing follow-up.";',
  '\t\treturn "A scheduled cron event was triggered, but no event content was found. Reply HEARTBEAT_OK.";',
  '\t}',
  '\tif (!deliverToUser) return "A scheduled reminder has been triggered. The reminder content is:\\n\\n" + eventText + "\\n\\nHandle this reminder internally. Do not relay it to the user unless explicitly requested.";',
  '\treturn "A scheduled reminder has been triggered. The reminder content is:\\n\\n" + eventText + "\\n\\nPlease relay this reminder to the user in a helpful and friendly way.";',
  '}',
].join('\n')
const CRON_REMINDER_PROMPT_NEW = [
  'function buildCronEventPrompt(pendingEvents, opts) {',
  '\tconst deliverToUser = opts?.deliverToUser ?? true;',
  '\tconst eventText = pendingEvents.join("\\n").trim();',
  '\tif (!eventText) {',
  '\t\tif (!deliverToUser) return "A scheduled cron event was triggered, but no event content was found. Handle this internally and reply HEARTBEAT_OK when nothing needs user-facing follow-up.";',
  '\t\treturn "A scheduled cron event was triggered, but no event content was found. Reply HEARTBEAT_OK.";',
  '\t}',
  '\treturn eventText;',
  '}',
].join('\n')
const CRON_REMINDER_CURRENT_TIME_BODY_OLD = 'Body: appendCronStyleCurrentTimeLine(prompt, cfg, startedAt),'
const CRON_REMINDER_CURRENT_TIME_BODY_NEW = 'Body: hasCronEvents ? prompt : appendCronStyleCurrentTimeLine(prompt, cfg, startedAt),'

function walkJsFiles(dirPath: string, files: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  }
  catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walkJsFiles(fullPath, files)
      continue
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath)
    }
  }
}

export function patchCronToolOwnerOnly(source: string): { changed: boolean, content: string } {
  if (!source.includes('function createCronTool(') || !source.includes('name: "cron"')) {
    return { changed: false, content: source }
  }
  const next = source.replace(CRON_OWNER_ONLY_PATTERN, '$1false,')
  return {
    changed: next !== source,
    content: next,
  }
}

export function patchCronOwnerFallback(source: string): { changed: boolean, content: string } {
  if (!source.includes('OWNER_ONLY_TOOL_NAME_FALLBACKS') || !source.includes('"cron"')) {
    return { changed: false, content: source }
  }
  const next = source.replace(OWNER_ONLY_FALLBACK_PATTERN, '$1$2')
  return {
    changed: next !== source,
    content: next,
  }
}

export function patchWecomMessageProviderExecDeny(source: string): { changed: boolean, content: string } {
  if (!source.includes('TOOL_DENY_BY_MESSAGE_PROVIDER') || !source.includes('voice: ["tts"]')) {
    return { changed: false, content: source }
  }
  if (source.includes('wecom: ["exec", "process"]')) {
    return { changed: false, content: source }
  }
  const next = source.replace(
    WECOM_EXEC_DENY_PATTERN,
    'const TOOL_DENY_BY_MESSAGE_PROVIDER = { voice: ["tts"], wecom: ["exec", "process"] };',
  )
  return {
    changed: next !== source,
    content: next,
  }
}

export function patchCronSessionDeliveryInference(source: string): { changed: boolean, content: string } {
  if (
    !source.includes('function inferDeliveryFromSessionKey(agentSessionKey) {')
    || !source.includes('const parsed = parseAgentSessionKey(stripThreadSuffixFromSessionKey(rawSessionKey));')
  ) {
    return { changed: false, content: source }
  }
  const next = source.replace(CRON_DELIVERY_INFERENCE_OLD, CRON_DELIVERY_INFERENCE_NEW)
  return {
    changed: next !== source,
    content: next,
  }
}

export function patchCronReminderPromptEnvelope(source: string): { changed: boolean, content: string } {
  if (
    !source.includes('function buildCronEventPrompt(')
    || !source.includes('A scheduled reminder has been triggered. The reminder content is:')
  ) {
    return { changed: false, content: source }
  }
  const next = source.replace(CRON_REMINDER_PROMPT_OLD, CRON_REMINDER_PROMPT_NEW)
  return {
    changed: next !== source,
    content: next,
  }
}

export function patchCronReminderCurrentTimeSuffix(source: string): { changed: boolean, content: string } {
  if (
    !source.includes(CRON_REMINDER_CURRENT_TIME_BODY_OLD)
    || !source.includes('hasCronEvents')
  ) {
    return { changed: false, content: source }
  }
  const next = source.replace(
    CRON_REMINDER_CURRENT_TIME_BODY_OLD,
    CRON_REMINDER_CURRENT_TIME_BODY_NEW,
  )
  return {
    changed: next !== source,
    content: next,
  }
}

export function applyBundledOpenClawRuntimeHotfixes(runtimeRoot: string): { changed: boolean, patchedFiles: string[], errors: string[] } {
  const distRoot = path.join(runtimeRoot, 'dist')
  const jsFiles: string[] = []
  walkJsFiles(distRoot, jsFiles)

  const patchedFiles: string[] = []
  const errors: string[] = []

  for (const filePath of jsFiles) {
    let source = ''
    try {
      source = fs.readFileSync(filePath, 'utf8')
    }
    catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }

    const cronOwnerPatch = patchCronToolOwnerOnly(source)
    const fallbackPatch = patchCronOwnerFallback(cronOwnerPatch.content)
    const wecomExecPatch = patchWecomMessageProviderExecDeny(fallbackPatch.content)
    const cronDeliveryPatch = patchCronSessionDeliveryInference(wecomExecPatch.content)
    const cronReminderPromptPatch = patchCronReminderPromptEnvelope(cronDeliveryPatch.content)
    const cronReminderTimePatch = patchCronReminderCurrentTimeSuffix(cronReminderPromptPatch.content)
    if (
      !cronOwnerPatch.changed
      && !fallbackPatch.changed
      && !wecomExecPatch.changed
      && !cronDeliveryPatch.changed
      && !cronReminderPromptPatch.changed
      && !cronReminderTimePatch.changed
    ) {
      continue
    }

    try {
      fs.writeFileSync(filePath, cronReminderTimePatch.content, 'utf8')
      patchedFiles.push(filePath)
    }
    catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    changed: patchedFiles.length > 0,
    patchedFiles,
    errors,
  }
}
