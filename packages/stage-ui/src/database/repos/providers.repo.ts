import { storage } from '../storage'

export interface ProviderCatalogProvider {
  id: string
  definitionId: string
  name: string
  config: Record<string, any>
  validated: boolean
  validationBypassed: boolean
}

export const providersRepo = {
  async getAll() {
    return await storage.getItem<Record<string, ProviderCatalogProvider>>('local:providers') || {}
  },

  async saveAll(providers: Record<string, ProviderCatalogProvider>) {
    await storage.setItem('local:providers', providers)
  },

  async upsert(provider: ProviderCatalogProvider) {
    const all = await this.getAll()
    all[provider.id] = provider
    await this.saveAll(all)
  },

  async remove(id: string) {
    const all = await this.getAll()
    delete all[id]
    await this.saveAll(all)
  },
}
