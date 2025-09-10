/**
 * Type Definitions for Memory Service
 *
 * This file defines:
 * - Request/Response interfaces for API endpoints
 * - Memory data structures
 * - Platform-specific types
 * - Validation schemas
 */

// import type { z } from 'zod'

// TODO: Define Zod schemas for validation
// export const CreateMemorySchema = z.object({
//   content: z.string().min(1),
//   memory_type: z.enum(['working', 'short_term', 'long_term', 'muscle']),
//   category: z.string().min(1),
//   importance: z.number().min(1).max(10).default(5),
//   emotional_impact: z.number().min(-10).max(10).default(0),
//   platform: z.string().default('unknown'),
//   session_id: z.string().optional(),
//   metadata: z.record(z.unknown()).default({}),
// })

// TODO: Define request types
// export type CreateMemoryRequest = z.infer<typeof CreateMemorySchema>

// TODO: Define response types
// export interface MemoryResponse {
//   id: string
//   content: string
//   memory_type: string
//   category: string
//   importance: number
//   emotional_impact: number
//   created_at: number
//   last_accessed: number
//   access_count: number
//   platform: string
//   session_id?: string
//   metadata: Record<string, unknown>
// }

// TODO: Define search request types
// export interface SearchMemoryRequest {
//   query: string
//   limit?: number
//   memory_type?: string
//   category?: string
//   platform?: string
//   session_id?: string
// }

// TODO: Define session types
// export interface CreateSessionRequest {
//   platform: string
//   user_id: string
//   metadata?: Record<string, unknown>
// }

// TODO: Define error response types
// export interface ErrorResponse {
//   error: string
//   code?: string
//   details?: Record<string, unknown>
// }

// TODO [lucas-oma]: consider removing this file
