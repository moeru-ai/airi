/**
 * What one long-term memory entry holds, and what its index line tells. The memory finalizer and the tidy-up share these
 * rules, so a tidy-up never merges what the finalizer keeps apart. A chat finds an entry by its index line, so the line
 * names what the body holds.
 */
export const MEMORY_ENTRY_INSTRUCTIONS = [
  'An entry holds one topic: one person, one pet, one hobby or interest, one place, one job, one project, or one kind of like, such as music. Never write one entry about the user as a whole.',
  'The description names the topic and its main facts in one line, so a reader of the index knows what the entry holds.',
]
