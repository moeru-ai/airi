import type { ShortTermMemoryRecord } from '@proj-airi/memory-alaya'

import { alayaSchemaVersion } from '@proj-airi/memory-alaya'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { alayaShortTermMemoryRepo } from '../../database/repos/alaya-short-term-memory.repo'

function entryKey(workspaceId: string, memoryId: string) {
  return `${workspaceId}/${memoryId}`
}

export const useMemoryShortTermRecordsStore = defineStore('memory-short-term-records', () => {
  const recordsByWorkspace = ref<Record<string, ShortTermMemoryRecord[]>>({})
  const loadingByWorkspace = ref<Record<string, boolean>>({})
  const errorByWorkspace = ref<Record<string, string | null>>({})
  const deletingByEntryKey = ref<Record<string, boolean>>({})
  const clearingByWorkspace = ref<Record<string, boolean>>({})

  const totalRecords = computed(() => {
    return Object.values(recordsByWorkspace.value).reduce((sum, records) => sum + records.length, 0)
  })

  function setWorkspaceRecords(workspaceId: string, records: ShortTermMemoryRecord[]) {
    recordsByWorkspace.value = {
      ...recordsByWorkspace.value,
      [workspaceId]: records,
    }
  }

  function setWorkspaceLoading(workspaceId: string, loading: boolean) {
    loadingByWorkspace.value = {
      ...loadingByWorkspace.value,
      [workspaceId]: loading,
    }
  }

  function setWorkspaceError(workspaceId: string, error: string | null) {
    errorByWorkspace.value = {
      ...errorByWorkspace.value,
      [workspaceId]: error,
    }
  }

  function setEntryDeleting(workspaceId: string, memoryId: string, deleting: boolean) {
    const key = entryKey(workspaceId, memoryId)
    deletingByEntryKey.value = {
      ...deletingByEntryKey.value,
      [key]: deleting,
    }
  }

  function setWorkspaceClearing(workspaceId: string, clearing: boolean) {
    clearingByWorkspace.value = {
      ...clearingByWorkspace.value,
      [workspaceId]: clearing,
    }
  }

  async function loadWorkspaceRecords(workspaceId: string) {
    if (!workspaceId)
      return []

    setWorkspaceLoading(workspaceId, true)
    setWorkspaceError(workspaceId, null)
    try {
      await alayaShortTermMemoryRepo.ensureSchemaVersion(alayaSchemaVersion)
      const records = await alayaShortTermMemoryRepo.listByWorkspace(workspaceId)
      setWorkspaceRecords(workspaceId, records)
      return records
    }
    catch (error) {
      setWorkspaceError(
        workspaceId,
        error instanceof Error ? error.message : String(error),
      )
      return []
    }
    finally {
      setWorkspaceLoading(workspaceId, false)
    }
  }

  async function deleteWorkspaceRecord(workspaceId: string, memoryId: string) {
    if (!workspaceId || !memoryId)
      return false

    setEntryDeleting(workspaceId, memoryId, true)
    setWorkspaceError(workspaceId, null)
    try {
      const deleted = await alayaShortTermMemoryRepo.deleteMemory(workspaceId, memoryId)

      if (!deleted) {
        await loadWorkspaceRecords(workspaceId)
        return false
      }

      setWorkspaceRecords(
        workspaceId,
        (recordsByWorkspace.value[workspaceId] || []).filter(record => record.memoryId !== memoryId),
      )
      return true
    }
    catch (error) {
      setWorkspaceError(
        workspaceId,
        error instanceof Error ? error.message : String(error),
      )
      return false
    }
    finally {
      setEntryDeleting(workspaceId, memoryId, false)
    }
  }

  async function clearWorkspaceRecords(workspaceId: string) {
    if (!workspaceId)
      return 0

    setWorkspaceClearing(workspaceId, true)
    setWorkspaceError(workspaceId, null)
    try {
      const removedCount = await alayaShortTermMemoryRepo.clearWorkspace(workspaceId)
      setWorkspaceRecords(workspaceId, [])
      return removedCount
    }
    catch (error) {
      setWorkspaceError(
        workspaceId,
        error instanceof Error ? error.message : String(error),
      )
      return 0
    }
    finally {
      setWorkspaceClearing(workspaceId, false)
    }
  }

  return {
    recordsByWorkspace,
    loadingByWorkspace,
    errorByWorkspace,
    deletingByEntryKey,
    clearingByWorkspace,
    totalRecords,
    loadWorkspaceRecords,
    deleteWorkspaceRecord,
    clearWorkspaceRecords,
    entryKey,
  }
})
