import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { migrateFromLocalStorageToIndexedDB } from '../indexedDbStore'
import * as idb from '../indexedDbStore'
import { resetAllMocks } from '../../test/vitest.setup'

vi.mock('../indexedDbStore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    idbGetAllProjects: vi.fn().mockResolvedValue([]),
    idbSaveAllProjects: vi.fn().mockResolvedValue(undefined),
    idbGetSections: vi.fn().mockResolvedValue([]),
    idbSaveSections: vi.fn().mockResolvedValue(undefined),
    idbGetSyncQueue: vi.fn().mockResolvedValue([]),
    idbSaveSyncQueue: vi.fn().mockResolvedValue(undefined),
    idbGetConflicts: vi.fn().mockResolvedValue([]),
    idbSaveConflict: vi.fn().mockResolvedValue(undefined),
    idbGetMeta: vi.fn().mockResolvedValue(false), // Not migrated yet
    idbSetMeta: vi.fn().mockResolvedValue(undefined)
  }
})

describe('IndexedDB Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('migrates projects from localStorage to IndexedDB', async () => {
    const projects = [
      { id: 'proj-1', title: 'Project 1', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true },
      { id: 'proj-2', title: 'Project 2', type: 'estudio', updated_at: new Date(Date.now() - 10000).toISOString(), _isOfflineOnly: true }
    ]
    localStorage.setItem('lw_offline_proyectos', JSON.stringify(projects))
    
    // Mock sections for each project
    const { idbGetSections } = await import('../indexedDbStore')
    vi.mocked(idbGetSections)
      .mockResolvedValueOnce([{ id: 'sec-1', project_id: 'proj-1', title: 'Intro', content: '', order_index: 0 }])
      .mockResolvedValueOnce([{ id: 'sec-2', project_id: 'proj-2', title: 'Intro', content: '', order_index: 0 }])
    
    const result = await migrateFromLocalStorageToIndexedDB()
    
    expect(result.migrated).toBe(true)
    expect(result.projectsCount).toBe(2)
    expect(result.sectionsCount).toBe(2)
    expect(idb.idbSaveAllProjects).toHaveBeenCalledWith(projects)
    expect(idb.idbSaveSections).toHaveBeenCalledTimes(2)
  })

  it('migrates sync queue', async () => {
    const queue = [
      { id: 'sync-1', type: 'CREATE_PROJECT', payload: {}, timestamp: Date.now() },
      { id: 'sync-2', type: 'UPDATE_SECTION', payload: {}, timestamp: Date.now() }
    ]
    localStorage.setItem('lw_offline_pending_sync_queue', JSON.stringify(queue))
    
    const result = await migrateFromLocalStorageToIndexedDB()
    
    expect(idb.idbSaveSyncQueue).toHaveBeenCalledWith(queue)
  })

  it('sets migration flag in meta', async () => {
    await migrateFromLocalStorageToIndexedDB()
    
    const { idbSetMeta } = await import('../indexedDbStore')
    expect(idb.idbSetMeta).toHaveBeenCalledWith('migrado_desde_localstorage_v1', true)
    expect(idb.idbSetMeta).toHaveBeenCalledWith('fecha_migracion_idb', expect.any(String))
  })

  it('skips migration if already done', async () => {
    const { idbGetMeta } = await import('../indexedDbStore')
    vi.mocked(idbGetMeta).mockResolvedValueOnce(true) // Already migrated
    
    const result = await migrateFromLocalStorageToIndexedDB()
    
    expect(result.migrated).toBe(false)
    expect(result.projectsCount).toBe(0)
    expect(idb.idbSaveAllProjects).not.toHaveBeenCalled()
  })

  it('handles empty localStorage gracefully', async () => {
    const result = await migrateFromLocalStorageToIndexedDB()
    
    expect(result.migrated).toBe(true) // Still runs but finds nothing
    expect(result.projectsCount).toBe(0)
    expect(result.sectionsCount).toBe(0)
  })

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem('lw_offline_proyectos', 'invalid-json')
    
    const result = await migrateFromLocalStorageToIndexedDB()
    
    expect(result.migrated).toBe(false)
    expect(result.projectsCount).toBe(0)
  })

  it('is idempotent - running twice returns migrated: false second time', async () => {
    const projects = [{ id: 'proj-1', title: 'Test', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true }]
    localStorage.setItem('lw_offline_proyectos', JSON.stringify(projects))
    
    // First run
    const result1 = await migrateFromLocalStorageToIndexedDB()
    expect(result1.migrated).toBe(true)
    
    // Second run (meta now returns true)
    const { idbGetMeta } = await import('../indexedDbStore')
    vi.mocked(idbGetMeta).mockResolvedValueOnce(true)
    
    const result2 = await migrateFromLocalStorageToIndexedDB()
    expect(result2.migrated).toBe(false)
  })
})