import type { Context } from 'hono'

/**
 * Rejects an array at compile time.
 *
 * A success body is one resource object. A list goes through {@link list} or
 * {@link paginated}, so a later pagination field stays an additive change.
 */
type NotArray<T> = T extends readonly unknown[] ? never : unknown

/** Body of an unpaginated list response. */
export interface ListBody<R> {
  records: R[]
}

/** Body of a paginated list response. */
export interface PaginatedBody<R> extends ListBody<R> {
  hasMore: boolean
}

/**
 * Responds `200` with one resource and no envelope.
 *
 * @example
 * return ok(c, await chatService.getChat(user.id, id))
 */
export function ok<T extends object>(c: Context, resource: T & NotArray<T>) {
  return c.json(resource, 200)
}

/**
 * Responds `201` with the resource that the request created.
 *
 * @example
 * return created(c, await chatService.createChat(user.id, input))
 */
export function created<T extends object>(c: Context, resource: T & NotArray<T>) {
  return c.json(resource, 201)
}

/**
 * Responds `204` with no body, after a delete.
 *
 * @example
 * return noContent(c)
 */
export function noContent(c: Context) {
  return c.body(null, 204)
}

/**
 * Responds `200` with `{ records }`.
 *
 * @example
 * return list(c, await service.listEnabled())
 */
export function list<R>(c: Context, records: R[]) {
  const body: ListBody<R> = { records }
  return c.json(body, 200)
}

/**
 * Responds `200` with `{ records, hasMore }`.
 *
 * Read `limit` and `offset` with `LimitOffsetPaginationQuerySchema` before you call it.
 *
 * @example
 * return paginated(c, { records, hasMore })
 */
export function paginated<R>(c: Context, page: PaginatedBody<R>) {
  const body: PaginatedBody<R> = { records: page.records, hasMore: page.hasMore }
  return c.json(body, 200)
}
