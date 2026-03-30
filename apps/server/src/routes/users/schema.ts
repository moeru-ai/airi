import { boolean, literal, object, union } from 'valibot'

export const UpdateCurrentUserSchema = object({
  adultVerified: boolean(),
  allowSensitiveContent: boolean(),
  contentTier: union([
    literal('standard'),
    literal('sensitive'),
    literal('explicit'),
  ]),
})
