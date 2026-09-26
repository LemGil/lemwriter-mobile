import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processOfflineSyncQueue, getPendingSyncQueue, addPendingSyncAction } from '../offlineStore'
import * as supabaseModule from '../supabase'
import { resetAllMocks, triggerOnline, triggerOffline, createRemoteNewerVersion } from '../../../test/vitest.setup'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((cb) => cb({ data: null, error: null }))
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
    }
  }
}))

// Mock offlineStore functions used during sync
vi.mock('../offlineStore', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    getOfflineProjects: vi.fn().mockReturnValue([]),
    saveOfflineProjects: vi.fn(),
    getOfflineSections: vi.fn().mockReturnValue([]),
    saveOfflineSections: vi.fn(),
    saveOrUpdateOfflineProject: vi.fn(),
    saveOfflineSectionContent: vi.fn(),
    deleteOfflineProject: vi.fn(),
    addPendingSyncAction: vi.fn(),
    removePendingSyncAction: vi.fn(),
    getPendingSyncQueue: vi.fn(() => getPendingSyncQueue()), // Use real implementation
    saveConflict: vi.fn()
  }
})

describe('offlineStore - Sync Process', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.resetModules()
    triggerOnline()
  })

  const mockSupabase = supabaseModule.supabase as any

  describe('processOfflineSyncQueue', () => {
    it('returns early if already syncing', async () => {
      // Set isSyncing flag by importing and checking internal state
      const result1 = await processOfflineSyncQueue()
      const result2 = await processOfflineSyncQueue() // Should return early
      
      expect(result2.syncedCount).toBe(0)
      expect(result2.errors).toBe(0)
    })

    it('returns early if offline', async () => {
      triggerOffline()
      const result = await processOfflineSyncQueue()
      expect(result.syncedCount).toBe(0)
    })

    it('returns early if queue empty', async () => {
      const result = await processOfflineSyncQueue()
      expect(result.syncedCount).toBe(0)
    })

    it('processes CREATE_PROJECT action', async () => {
      const newProject = { 
        id: 'local_proj_123', 
        title: 'New Project', 
        type: 'sermon', 
        user_id: 'user-123',
        updated_at: new Date().toISOString()
      }
      addPendingSyncAction('CREATE_PROJECT', newProject)
      
      mockSupabase.from().insert().single.mockResolvedValueOnce({
        data: { id: 'server-proj-456', ...newProject, _isOfflineOnly: false },
        error: null
      })
      
      const { getOfflineProjects, saveOfflineProjects } = await import('../offlineStore')
      vi.mocked(getOfflineProjects).mockReturnValue([{ ...newProject, _isOfflineOnly: true }])
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
      expect(result.errors).toBe(0)
      expect(mockSupabase.from).toHaveBeenCalledWith('lw_proyectos')
    })

    it('processes UPDATE_PROJECT action', async () => {
      addPendingSyncAction('UPDATE_PROJECT', { 
        id: 'server-proj-1', 
        title: 'Updated Title', 
        type: 'estudio' 
      })
      
      mockSupabase.from().update().eq.mockResolvedValueOnce({ error: null })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated Title', type: 'estudio' })
      )
    })

    it('skips UPDATE_PROJECT for local_ IDs', async () => {
      addPendingSyncAction('UPDATE_PROJECT', { 
        id: 'local_proj_123', 
        title: 'Updated Title' 
      })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1) // Still counts as synced (removed from queue)
      expect(mockSupabase.from().update).not.toHaveBeenCalled()
    })

    it('processes DELETE_PROJECT action', async () => {
      addPendingSyncAction('DELETE_PROJECT', { id: 'server-proj-1' })
      
      mockSupabase.from().delete().eq.mockResolvedValueOnce({ error: null })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
      expect(mockSupabase.from).toHaveBeenCalledWith('lw_secciones')
      expect(mockSupabase.from).toHaveBeenCalledWith('lw_proyectos')
    })

    it('processes CREATE_SECTION action', async () => {
      addPendingSyncAction('CREATE_SECTION', { 
        id: 'local_sec_123', 
        project_id: 'server-proj-1', 
        title: 'New Section', 
        content: '<p>Content</p>', 
        order_index: 0 
      })
      
      mockSupabase.from().insert().single.mockResolvedValueOnce({
        data: { id: 'server-sec-456', project_id: 'server-proj-1', title: 'New Section', content: '<p>Content</p>', order_index: 0 },
        error: null
      })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
    })

    describe('UPDATE_SECTION conflict re-check', () => {
      it('detects conflict when remote newer than base and content differs', async () => {
        addPendingSyncAction('UPDATE_SECTION', { 
          id: 'server-sec-1', 
          content: '<p>Local edit</p>', 
          projectId: 'server-proj-1',
          projectTitle: 'Test Project',
          base_updated_at: new Date(Date.now() - 10000).toISOString(),
          client_updated_at: new Date().toISOString()
        })
        
        // Remote has been updated since our base
        mockSupabase.from().select().single.mockResolvedValueOnce({
          data: createRemoteNewerVersion('server-sec-1', '<p>Remote edit</p>', 5),
          error: null
        })
        
        const result = await processOfflineSyncQueue()
        
        expect(result.syncedCount).toBe(0) // Not synced, conflict created
        expect(result.errors).toBe(0)
        // saveConflict should have been called
        const { saveConflict } = await import('../offlineStore')
        expect(saveConflict).toHaveBeenCalled()
      })

      it('proceeds with update if remote not newer than base', async () => {
        addPendingSyncAction('UPDATE_SECTION', { 
          id: 'server-sec-1', 
          content: '<p>Local edit</p>', 
          base_updated_at: new Date(Date.now() - 1000).toISOString() // Base is very recent
        })
        
        // Remote is older than base
        mockSupabase.from().select().single.mockResolvedValueOnce({
          data: { 
            id: 'server-sec-1', 
            content: '<p>Old remote</p>', 
            updated_at: new Date(Date.now() - 5000).toISOString(),
            project_id: 'server-proj-1',
            title: 'Test'
          },
          error: null
        })
        
        mockSupabase.from().update().eq.mockResolvedValueOnce({ error: null })
        
        const result = await processOfflineSyncQueue()
        
        expect(result.syncedCount).toBe(1)
        expect(mockSupabase.from().update).toHaveBeenCalled()
      })

      it('proceeds with update if content identical despite remote newer', async () => {
        addPendingSyncAction('UPDATE_SECTION', { 
          id: 'server-sec-1', 
          content: '<p>Same content</p>', 
          base_updated_at: new Date(Date.now() - 10000).toISOString()
        })
        
        // Remote newer but content identical
        mockSupabase.from().select().single.mockResolvedValueOnce({
          data: createRemoteNewerVersion('server-sec-1', '<p>Same content</p>', 5),
          error: null
        })
        
        mockSupabase.from().update().eq.mockResolvedValueOnce({ error: null })
        
        const result = await processOfflineSyncQueue()
        
        expect(result.syncedCount).toBe(1)
      })

      it('handles local_ IDs by skipping conflict check', async () => {
        addPendingSyncAction('UPDATE_SECTION', { 
          id: 'local_sec_123', 
          content: '<p>Local only</p>' 
        })
        
        const result = await processOfflineSyncQueue()
        
        expect(result.syncedCount).toBe(1)
        expect(mockSupabase.from().select).not.toHaveBeenCalled()
      })
    })

    it('processes DELETE_SECTION action', async () => {
      addPendingSyncAction('DELETE_SECTION', { id: 'server-sec-1' })
      
      mockSupabase.from().delete().eq.mockResolvedValueOnce({ error: null })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
    })

    it('processes REORDER_SECTIONS action', async () => {
      addPendingSyncAction('REORDER_SECTIONS', { 
        sections: [
          { id: 'server-sec-1', order_index: 1 },
          { id: 'server-sec-2', order_index: 0 }
        ] 
      })
      
      mockSupabase.from().update().eq.mockResolvedValue({ error: null })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
      expect(mockSupabase.from().update).toHaveBeenCalledTimes(2)
    })

    it('counts errors and continues processing', async () => {
      addPendingSyncAction('UPDATE_PROJECT', { id: 'server-proj-1', title: 'Fail' })
      addPendingSyncAction('UPDATE_PROJECT', { id: 'server-proj-2', title: 'Success' })
      
      mockSupabase.from().update().eq
        .mockResolvedValueOnce({ error: new Error('Network error') })
        .mockResolvedValueOnce({ error: null })
      
      const result = await processOfflineSyncQueue()
      
      expect(result.syncedCount).toBe(1)
      expect(result.errors).toBe(1)
    })

    it('dispatches lw:sync-status events', async () => {
      addPendingSyncAction('UPDATE_PROJECT', { id: 'server-proj-1', title: 'Test' })
      mockSupabase.from().update().eq.mockResolvedValueOnce({ error: null })
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      
      await processOfflineSyncQueue()
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'lw:sync-status',
          detail: expect.objectContaining({ syncing: true })
        })
      )
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'lw:sync-status',
          detail: expect.objectContaining({ 
            syncing: false, 
            syncedCount: 1, 
            errors: 0 
          })
        })
      )
    })

    it('updates last sync timestamp on completion', async () => {
      addPendingSyncAction('UPDATE_PROJECT', { id: 'server-proj-1', title: 'Test' })
      mockSupabase.from().update().eq.mockResolvedValueOnce({ error: null })
      
      await processOfflineSyncQueue()
      
      const lastSync = localStorage.getItem('lw_offline_last_sync_time')
      expect(lastSync).not.toBeNull()
      expect(new Date(lastSync!).getTime()).toBeCloseTo(Date.now(), -2) // Within ~100ms
    })
  })
})