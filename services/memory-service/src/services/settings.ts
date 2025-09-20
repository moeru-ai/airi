import { eq } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { memorySettingsTable } from '../db/schema'

// Types for settings
export type MemorySettings = typeof memorySettingsTable.$inferSelect
export type NewMemorySettings = typeof memorySettingsTable.$inferInsert

// Default settings
const DEFAULT_SETTINGS: Omit<NewMemorySettings, 'id' | 'created_at' | 'updated_at'> = {
  // Embedded Postgres
  embedded_postgres: true,
  // LLM Settings
  mem_llm_provider: 'openai',
  mem_llm_model: 'gpt-3.5-turbo',
  mem_llm_api_key: '', // Must be set by user
  mem_llm_temperature: 7, // not being used
  mem_llm_max_tokens: 2000, // not being used

  // Embedding Settings
  mem_embedding_provider: 'openai',
  mem_embedding_model: 'text-embedding-3-small',
  mem_embedding_api_key: '', // Must be set by user
  mem_embedding_dimensions: 1536,

  // Memory Settings
  // TODO [lucas-oma]: add mem settings here when implemented
}

export class SettingsService {
  private static instance: SettingsService
  private cachedSettings: MemorySettings | null = null
  private lastFetchTime: number = 0
  private readonly CACHE_TTL = 60000 // 1 minute cache
  private db = useDrizzle()

  private constructor() {}

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService()
    }
    return SettingsService.instance
  }

  private isCacheValid(): boolean {
    return this.cachedSettings !== null && (Date.now() - this.lastFetchTime) < this.CACHE_TTL
  }

  /**
   * Get current settings, using cache if available and valid
   */
  public async getSettings(): Promise<MemorySettings> {
    if (this.isCacheValid()) {
      // console.log('Memory settings (from cache):', this.cachedSettings)
      return this.cachedSettings!
    }

    try {
      const settings = await this.db.select().from(memorySettingsTable).limit(1)

      if (settings.length === 0) {
        // Initialize with defaults if no settings exist
        const newSettings = await this.initializeSettings()
        this.cachedSettings = newSettings
        this.lastFetchTime = Date.now()
        // console.log('Memory settings (initialized with defaults):', newSettings)
        return newSettings
      }

      this.cachedSettings = settings[0]
      this.lastFetchTime = Date.now()
      // console.log('Memory settings (from DB):', settings[0])
      return settings[0]
    }
    catch (error) {
      // If table doesn't exist yet, return default-like settings object
      if (error instanceof Error && error.message.includes('relation "memory_settings" does not exist')) {
        console.warn('Memory settings table does not exist yet, using temporary defaults')
        // Return a settings-like object with defaults and a temporary ID
        const tempSettings = {
          id: '00000000-0000-0000-0000-000000000000',
          created_at: Date.now(),
          updated_at: Date.now(),
          ...DEFAULT_SETTINGS,
          // Set regeneration flags to false to prevent loops
          mem_is_regenerating: false,
          mem_regeneration_progress: 0,
          mem_regeneration_total_items: 0,
          mem_regeneration_processed_items: 0,
          mem_regeneration_avg_batch_time_ms: 0,
          mem_regeneration_last_batch_time_ms: 0,
          mem_regeneration_current_batch_size: 50,
        } as MemorySettings

        return tempSettings
      }
      throw error // Re-throw if it's a different error
    }
  }

  /**
   * Initialize settings with defaults
   */
  private async initializeSettings(): Promise<MemorySettings> {
    const [settings] = await this.db.insert(memorySettingsTable)
      .values(DEFAULT_SETTINGS)
      .returning()
    return settings
  }

  /**
   * Update settings
   */
  public async updateSettings(updates: Partial<NewMemorySettings>): Promise<MemorySettings> {
    const currentSettings = await this.getSettings()

    const [updatedSettings] = await this.db.update(memorySettingsTable)
      .set({
        ...updates,
        updated_at: Date.now(),
      })
      .where(eq(memorySettingsTable.id, currentSettings.id))
      .returning()

    // Update cache with new settings
    this.cachedSettings = updatedSettings
    this.lastFetchTime = Date.now()

    console.warn('Memory settings updated:', {
      previous: currentSettings,
      new: updatedSettings,
      changes: updates,
    })

    return updatedSettings
  }

  /**
   * Reset settings to defaults
   */
  public async resetToDefaults(): Promise<MemorySettings> {
    const currentSettings = await this.getSettings()

    const [settings] = await this.db.update(memorySettingsTable)
      .set({
        ...DEFAULT_SETTINGS,
        updated_at: Date.now(),
      })
      .where(eq(memorySettingsTable.id, currentSettings.id))
      .returning()

    // Update cache with default settings
    this.cachedSettings = settings
    this.lastFetchTime = Date.now()

    return settings
  }

  /**
   * Validate API keys by checking they're not empty
   */
  public async validateApiKeys(): Promise<{
    isValid: boolean
    errors: string[]
  }> {
    const settings = await this.getSettings()
    const errors: string[] = []

    if (!settings.mem_llm_api_key) {
      errors.push('LLM API key is not set')
    }
    if (!settings.mem_embedding_api_key) {
      errors.push('Embedding API key is not set')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}
