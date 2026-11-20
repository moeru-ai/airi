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
export const autoApprovalReviewClassSchema = v.picklist(['delete', 'write', 'desktop'])
export type AutoApprovalReviewClass = v.InferOutput<typeof autoApprovalReviewClassSchema>
export const autoApprovalTerminalCardSchema = v.strictObject({
  lane: v.literal('terminal'),
  cwd: v.string(),
  command: v.string(),
  reviewClass: autoApprovalReviewClassSchema,
})
export const autoApprovalComputerCardSchema = v.strictObject({
  lane: v.literal('computer_use'),
  actionKind: v.string(),
  appName: v.string(),
  windowTitle: v.string(),
  reviewClass: v.literal('desktop'),
  targetName: v.string(),
  detail: v.string(),
})
export const autoApprovalCardSchema = v.variant('lane', [autoApprovalTerminalCardSchema, autoApprovalComputerCardSchema])
export type AutoApprovalCard = v.InferOutput<typeof autoApprovalCardSchema>
export const autoApprovalReviewResultSchema = v.strictObject({
  decision: v.picklist(['allow', 'refuse']),
})
export type AutoApprovalReviewResult = v.InferOutput<typeof autoApprovalReviewResultSchema>
export const autoApprovalReview = defineInvokeEventa<AutoApprovalReviewResult, AutoApprovalCard>('eventa:invoke:terminal-approval:auto-review')
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
