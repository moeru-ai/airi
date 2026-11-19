/**
 * A stable product event definition.
 *
 * The phantom `payload` field exists only for TypeScript inference. Analytics
 * providers receive the event name and payload, not this definition object.
 */
export interface AnalyticsEvent<Payload extends object> {
  readonly name: string
  readonly payload?: Payload
}

/** Extracts the payload accepted by one analytics event definition. */
export type InferAnalyticsEventPayload<Event> = Event extends AnalyticsEvent<infer Payload>
  ? Payload
  : never

/** Defines one product event and its payload contract. */
export function defineEvent<Payload extends object>(name: string): AnalyticsEvent<Payload> {
  return { name }
}
