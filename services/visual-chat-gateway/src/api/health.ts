import { defineEventHandler } from 'h3'

export function createHealthRoute() {
  return defineEventHandler(() => ({ ok: true }))
}
