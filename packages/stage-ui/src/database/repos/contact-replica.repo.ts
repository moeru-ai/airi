import type { ContactReplicaRecord, ContactReplicaStorage } from '../../services/contact-replica'

import { storage } from '../storage'

/** IDB stores the catalog and its commands in one write, independently for each account. */
export const contactReplicaRepo: ContactReplicaStorage = {
  load: ownerId => storage.getItemRaw<ContactReplicaRecord>(`local:contacts/catalog/${ownerId}`),
  save: record => storage.setItemRaw(`local:contacts/catalog/${record.ownerId}`, record),
}
