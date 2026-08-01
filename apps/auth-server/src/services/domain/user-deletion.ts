export type UserDeletionReason = 'user-requested' | 'admin' | 'compliance'

/** Port invoked before Better Auth permanently removes credential rows. */
export interface UserDeletionExecutor {
  softDeleteAll: (input: { userId: string, reason: UserDeletionReason }) => Promise<void>
}
