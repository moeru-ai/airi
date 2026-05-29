import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/**
 * Survey invite emails sent after paid Stripe checkout fulfillment.
 */
export const communitySurveyInviteEmail = pgTable('community_survey_invite_email', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().unique(),
  stripeSessionId: text('stripe_session_id').notNull().unique(),
  toEmail: text('to_email'),
  surveyUrl: text('survey_url'),
  status: text('status').notNull().default('pending'),
  failureReason: text('failure_reason'),
  attemptCount: integer('attempt_count').notNull().default(1),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type CommunitySurveyInviteEmail = InferSelectModel<typeof communitySurveyInviteEmail>
export type NewCommunitySurveyInviteEmail = InferInsertModel<typeof communitySurveyInviteEmail>
