import type { ChatRequestInput } from '@proj-airi/stage-shared/chat-request'
import type { TerminalNotice } from '@proj-airi/stage-shared/terminal-approval'

import { defineInvokeEventa } from '@moeru/eventa'
import { chatRequestSchema } from '@proj-airi/stage-shared/chat-request'
import { terminalSnapshotSchema } from '@proj-airi/stage-shared/terminal-approval'

import * as v from 'valibot'

import { createRequestWindowEventa } from '.'

export const chatRequestRegister = defineInvokeEventa<{ requestId?: string }, ChatRequestInput>('eventa:invoke:chat-request:register')
export const chatRequestFinish = defineInvokeEventa<void, { requestId: string }>('eventa:invoke:chat-request:finish')
export const chatRequestCancel = defineInvokeEventa<void, { requestId: string }>('eventa:invoke:chat-request:cancel')
export const turboLaneSchema = v.picklist(['terminal', 'computer_use'])
export type TurboLane = v.InferOutput<typeof turboLaneSchema>
export const approvalGrantModeSchema = v.picklist(['ask', 'auto', 'full'])
export type ApprovalGrantMode = v.InferOutput<typeof approvalGrantModeSchema>
export const sessionApprovalGrant = defineInvokeEventa<ApprovalGrantMode | false, { sessionId: string, lane: TurboLane, mode?: ApprovalGrantMode }>('eventa:invoke:terminal-approval:session-grant')
export const terminalOutcomeNotice = defineInvokeEventa<{ status: 'stored' | 'suppressed', sessionId: string, messageId: string }, TerminalNotice>('eventa:invoke:terminal-approval:outcome-notice')

export const terminalApprovalWindow = createRequestWindowEventa('terminal-approval')
const approvalSubmissionSchema = v.strictObject({ ...chatRequestSchema.entries, senderWebContentsId: v.number() })
const terminalCommandApprovalViewSchema = v.strictObject({
  kind: v.literal('terminal'),
  actionId: v.string(),
  expiresAt: v.number(),
  serverName: v.string(),
  submission: approvalSubmissionSchema,
  snapshot: terminalSnapshotSchema,
})
const confirmationApprovalViewSchema = v.strictObject({
  kind: v.literal('confirmation'),
  actionId: v.string(),
  expiresAt: v.number(),
  title: v.string(),
  detail: v.string(),
  cancelLabel: v.string(),
  allowLabel: v.string(),
  sessionId: v.string(),
  turnId: v.optional(v.string()),
  toolCallId: v.optional(v.string()),
  serverName: v.optional(v.string()),
  toolName: v.optional(v.string()),
})

export const terminalApprovalViewSchema = v.union([terminalCommandApprovalViewSchema, confirmationApprovalViewSchema])
export type TerminalApprovalView = v.InferOutput<typeof terminalApprovalViewSchema>
export type ApprovalPrompt = Omit<v.InferOutput<typeof confirmationApprovalViewSchema>, 'kind' | 'actionId' | 'expiresAt'>
