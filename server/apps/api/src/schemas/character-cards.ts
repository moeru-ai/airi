import { defineFieldSyncTables } from './field-sync'

/** The character cards that a user synchronizes between devices. */
export const characterCardTables = defineFieldSyncTables('character_cards')

export const characterCards = characterCardTables.documents
export const characterCardFields = characterCardTables.fields
