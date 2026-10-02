/**
 * The subjects that information may reach. `public` reaches anyone.
 * Subject sets are sorted and unique, so equal audiences serialize equally.
 */
export type Audience
  = | { kind: 'public' }
    | { kind: 'subjects', subjects: readonly string[] }

/** The host owner. Every host surface shows every session to this subject. */
export const OWNER_SUBJECT = 'user:owner'

/** The binding of the owner's private scene. It adds no subject beyond the owner. */
export const OWNER_PRIVATE_BINDING = 'owner:private'

export const PUBLIC_AUDIENCE: Audience = Object.freeze({ kind: 'public' })

/** Creates a normalized subject audience. An empty set reaches no subject. */
export function subjectAudience(subjects: Iterable<string>): Audience {
  return { kind: 'subjects', subjects: Array.from(new Set(subjects)).sort() }
}

export const OWNER_AUDIENCE: Audience = Object.freeze(subjectAudience([OWNER_SUBJECT]))

/**
 * Reports whether `allowed` reaches every subject of `effective`.
 * A run can read a record only when its effective audience is included in the record's allowed audience.
 */
export function audienceIncludes(allowed: Audience, effective: Audience): boolean {
  if (allowed.kind === 'public')
    return true
  if (effective.kind === 'public')
    return false
  return effective.subjects.every(subject => allowed.subjects.includes(subject))
}

/** The audience that every input allows. A write inherits it from everything the run read. */
export function intersectAudiences(...audiences: readonly Audience[]): Audience {
  const restricted = audiences.filter((audience): audience is Extract<Audience, { kind: 'subjects' }> => audience.kind === 'subjects')
  if (restricted.length === 0)
    return PUBLIC_AUDIENCE
  const [first, ...rest] = restricted
  return subjectAudience(first.subjects.filter(subject => rest.every(audience => audience.subjects.includes(subject))))
}

/** The audience that any output reaches. A run's effective audience is the union of its outputs. */
export function unionAudiences(...audiences: readonly Audience[]): Audience {
  if (audiences.some(audience => audience.kind === 'public'))
    return PUBLIC_AUDIENCE
  return subjectAudience(audiences.flatMap(audience => audience.kind === 'subjects' ? audience.subjects : []))
}

/**
 * Derives the audience of a scene from its bindings.
 * Each external binding adds its members as one subject. The owner sees every scene, so every scene includes the owner.
 */
export function audienceFromBindings(bindings: readonly string[] = []): Audience {
  return subjectAudience([
    OWNER_SUBJECT,
    ...bindings.filter(binding => binding !== OWNER_PRIVATE_BINDING).map(binding => `${binding}:members`),
  ])
}
