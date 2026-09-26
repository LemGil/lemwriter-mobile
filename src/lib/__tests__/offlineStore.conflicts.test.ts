import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getPendingConflicts,
  saveConflict,
  removeConflict,
  resolveConflict,
  saveOfflineSectionContent
} from '../offlineStore'
import * as idb from '../indexedDbStore'
import * as supabaseModule from '../supabase'
import { resetAllMocks, createConflict, createRemoteNewerVersion } from '../../../test/vitest.setup'

vi.mock('../indexedDbStore', () => ({
  idbGetConflicts: vi.fn().mockResolvedValue([]),
  idbSaveConflict: vi.fn().mockResolvedValue(undefined),
  idbDeleteConflict: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../offlineStore', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    getOfflineSections: vi.fn().mockReturnValue([]),
    saveOfflineSections: vi.fn(),
    saveOfflineSectionContent: vi.fn(),
    saveOrUpdateOfflineProject: vi.fn(),
    getOfflineProjects: vi.fn().mockReturnValue([]),
    addPendingSyncAction: vi.fn()
  }
})

describe('offlineStore - Conflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.resetModules()
  })

  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((cb) => cb({ data: null, error: null }))
    }))
  }

  vi.mock('../supabase', () => ({
    supabase: mockSupabase
  }))

  describe('getPendingConflicts', () => {
    it('returns only pending conflicts', () => {
      const conflicts = [
        createConflict({ id: 'c1', status: 'pending' }),
        createConflict({ id: 'c2', status: 'resolved' }),
        createConflict({ id: 'c3', status: 'pending' })
      ]
      localStorage.setItem('lw_offline_conflicts', JSON.stringify(conflicts))
      
      const pending = getPendingConflicts()
      expect(pending.length).toBe(2)
      expect(pending.every(c => c.status === 'pending')).toBe(true)
    })

    it('caches in memory', () => {
      localStorage.setItem('lw_offline_conflicts', JSON.stringify([createConflict()]))
      const c1 = getPendingConflicts()
      const c2 = getPendingConflicts()
      expect(c1).toBe(c2)
    })
  })

  describe('saveConflict', () => {
    it('adds new conflict and dispatches events', () => {
      const conflict = createConflict({ id: 'new-conflict' })
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      
      saveConflict(conflict)
      
      const stored = JSON.parse(localStorage.getItem('lw_offline_conflicts') || '[]')
      expect(stored.length).toBe(1)
      expect(stored[0].id).toBe('new-conflict')
      expect(idb.idbSaveConflict).toHaveBeenCalledWith(conflict)
      
      // Check events dispatched
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'lw:conflicts-change',
          detail: { count: 1 }
        })
      )
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'lw:conflict-detected',
          detail: conflict
        })
      )
    })

    it('updates existing pending conflict for same section', () => {
      const existing = createConflict({ id: 'existing', sectionId: 'sec-1', status: 'pending' })
      localStorage.setItem('lw_offline_conflicts', JSON.stringify([existing]))
      
      const updated = createConflict({ id: 'updated', sectionId: 'sec-1', localContent: '<p>New local</p>' })
      saveConflict(updated)
      
      const stored = JSON.parse(localStorage.getItem('lw_offline_conflicts') || '[]')
      expect(stored.length).toBe(1)
      expect(stored[0].id).toBe('updated')
      expect(stored[0].localContent).toBe('<p>New local</p>')
    })

    it('does not overwrite resolved conflicts', () => {
      const resolved = createConflict({ id: 'resolved', sectionId: 'sec-1', status: 'resolved' })
      localStorage.setItem('lw_offline_conflicts', JSON.stringify([resolved]))
      
      const newConflict = createConflict({ id: 'new', sectionId: 'sec-1' })
      saveConflict(newConflict)
      
      const stored = JSON.parse(localStorage.getItem('lw_offline_conflicts') || '[]')
      expect(stored.length).toBe(2) // Both kept
    })
  })

  describe('removeConflict', () => {
    it('removes conflict and dispatches event', () => {
      const conflict = createConflict({ id: 'to-remove' })
      localStorage.setItem('lw_offline_conflicts', JSON.stringify([conflict]))
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      
      removeConflict('to-remove')
      
      const stored = JSON.parse(localStorage.getItem('lw_offline_conflicts') || '[]')
      expect(stored.length).toBe(0)
      expect(idb.idbDeleteConflict).toHaveBeenCalledWith('to-remove')
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'lw:conflicts-change',
          detail: { count: 0 }
        })
      )
    })
  })

  describe('resolveConflict', () => {
    const projectId = 'test-project'
    const sectionId = 'test-section'
    const baseConflict = createConflict({
      projectId,
      sectionId,
      localContent: '<p>Local version</p>',
      remoteContent: '<p>Remote version</p>',
      localUpdatedAt: new Date().toISOString(),
      remoteUpdatedAt: new Date(Date.now() + 60000).toISOString()
    })

    beforeEach(async () => {
      localStorage.setItem('lw_offline_conflicts', JSON.stringify([baseConflict]))
      // Mock offlineStore functions used by resolveConflict
      const { getOfflineSections, saveOfflineSections, saveOfflineSectionContent, saveOrUpdateOfflineProject, getOfflineProjects, addPendingSyncAction } = await import('../offlineStore')
      vi.mocked(getOfflineSections).mockReturnValue([{ id: sectionId, project_id: projectId, title: 'Test', content: '', order_index: 0 }])
      vi.mocked(saveOfflineSections).mockImplementation(() => {})
      vi.mocked(saveOfflineSectionContent).mockImplementation(() => {})
      vi.mocked(saveOrUpdateOfflineProject).mockImplementation(() => {})
      vi.mocked(getOfflineProjects).mockReturnValue([{ id: projectId, title: 'Test', type: 'sermon', updated_at: new Date().toISOString() }])
      vi.mocked(addPendingSyncAction).mockImplementation(() => {})
    })

    it('resolves keep_local - overwrites remote with local', async () => {
      const result = await resolveConflict(baseConflict.id, 'keep_local')
      
      expect(result.success).toBe(true)
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ content: '<p>Local version</p>' })
      )
    })

    it('resolves keep_remote - adopts remote version locally', async () => {
      const { getOfflineSections } = await import('../offlineStore')
      vi.mocked(getOfflineSections).mockReturnValue([{ id: sectionId, project_id: projectId, title: 'Test', content: '<p>Local</p>', order_index: 0 }])
      
      const result = await resolveConflict(baseConflict.id, 'keep_remote')
      
      expect(result.success).toBe(true)
      // Should update local section with remote content
      expect(saveOfflineSectionContent).toHaveBeenCalledWith(
        projectId,
        sectionId,
        '<p>Remote version</p>'
      )
    })

    it('resolves keep_both - creates new section with local content', async () => {
      const { getOfflineSections, saveOfflineSections } = await import('../offlineStore')
      vi.mocked(getOfflineSections).mockReturnValue([{ id: sectionId, project_id: projectId, title: 'Test', content: '<p>Local</p>', order_index: 0 }])
      vi.mocked(saveOfflineSections).mockImplementation(() => {})
      
      mockSupabase.from().insert().single.mockResolvedValueOnce({
        data: { id: 'new-section-id', project_id: projectId, title: 'Test (Copia local)', content: '<p>Local version</p>', order_index: 1 },
        error: null
      })
      
      const result = await resolveConflict(baseConflict.id, 'keep_both')
      
      expect(result.success).toBe(true)
      expect(result.newSectionId).toBeDefined()
      // Should create new section locally
      expect(saveOfflineSections).toHaveBeenCalled()
      const sections = vi.mocked(saveOfflineSections).mock.calls[0][1]
      expect(sections.some((s: any) => s.title.includes('Copia local'))).toBe(true)
    })

    it('resolves merge - combines both versions with divider', async () => {
      const result = await resolveConflict(baseConflict.id, 'merge')
      
      expect(result.success).toBe(true)
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ 
          content: expect.stringContaining('<hr') 
        })
      )
      // Check combined content structure
      const updateCall = mockSupabase.from().update.mock.calls[0][0]
      expect(updateCall.content).toContain('<p>Local version</p>')
      expect(updateCall.content).toContain('<p>Remote version</p>')
      expect(updateCall.content).toContain('Versión sincronizada desde otro dispositivo')
    })

    it('removes resolved conflict and dispatches lw:conflict-resolved', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      
      await resolveConflict(baseConflict.id, 'keep_local')
      
      const stored = JSON.parse(localStorage.getItem('lw_offline_conflicts') || '[]')
      expect(stored.length).toBe(0)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'lw:conflict-resolved',
          detail: expect.objectContaining({ 
            conflictId: baseConflict.id,
            resolution: 'keep_local'
          })
        })
      )
    })

    it('handles offline mode by queuing sync action', async () => {
      // Simulate offline
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
      
      await resolveConflict(baseConflict.id, 'keep_local')
      
      const { addPendingSyncAction } = await import('../offlineStore')
      expect(addPendingSyncAction).toHaveBeenCalledWith(
        'UPDATE_SECTION',
        expect.objectContaining({ content: '<p>Local version</p>' })
      )
    })

    it('returns failure for non-existent conflict', async () => {
      const result = await resolveConflict('non-existent-id', 'keep_local')
      expect(result.success).toBe(false)
    })
  })
})