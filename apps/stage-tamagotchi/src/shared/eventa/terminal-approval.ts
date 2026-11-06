import type { ChatRequestInput } from '@proj-airi/stage-shared/chat-request'

import { defineInvokeEventa } from '@moeru/eventa'
import { chatRequestSchema } from '@proj-airi/stage-shared/chat-request'
import { terminalSnapshotSchema } from '@proj-airi/stage-shared/terminal-approval'

import * as v from 'valibot'

import { createRequestWindowEventa } from '.'

export const chatRequestRegister = defineInvokeEventa<{ requestId?: string }, ChatRequestInput>('eventa:invoke:chat-request:register')
export const chatRequestFinish = defineInvokeEventa<void, { requestId: string }>('eventa:invoke:chat-request:finish')
export const chatRequestCancel = defineInvokeEventa<void, { requestId: string }>('eventa:invoke:chat-request:cancel')

export const terminalApprovalWindow = createRequestWindowEventa('terminal-approval')
export const terminalApprovalViewSchema = v.strictObject({
  actionId: v.string(),
  expiresAt: v.number(),
  serverName: v.string(),
  submission: v.strictObject({ ...chatRequestSchema.entries, senderWebContentsId: v.number() }),
  snapshot: terminalSnapshotSchema,
})
export type TerminalApprovalView = v.InferOutput<typeof terminalApprovalViewSchema>
