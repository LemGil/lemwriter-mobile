import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getOfflineSections,
  saveOfflineSections,
  saveOfflineSectionContent,
  saveOrUpdateOfflineSection,
  deleteOfflineSection
} from '../offlineStore'
import * as idb from '../indexedDbStore'
import { resetAllMocks } from '../../test/vitest.setup'

vi.mock('../indexedDbStore', () => ({
  idbGetSections: vi.fn().mockResolvedValue([]),
  idbSaveSections: vi.fn().mockResolvedValue(undefined),
  idbDeleteSection: vi.fn().mockResolvedValue(undefined)
}))

describe('offlineStore - Sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Reset memory cache by re-importing
    vi.resetModules()
  })

  const mockProjectId = 'test-project-123'
  const now = new Date().toISOString()

  const createSection = (overrides: any = {}) => ({
    id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    project_id: mockProjectId,
    title: 'Test Section',
    content: '<p>Content</p>',
    order_index: 0,
    created_at: now,
    updated_at: now,
    _isOfflineOnly: false,
    ...overrides
  })

  describe('getOfflineSections', () => {
    it('returns empty array for new project', () => {
      const sections = getOfflineSections(mockProjectId)
      expect(sections).toEqual([])
    })

    it('loads from localStorage and sorts by order_index', () => {
      const sec1 = createSection({ id: 's1', order_index: 2, title: 'Third' })
      const sec2 = createSection({ id: 's2', order_index: 0, title: 'First' })
      const sec3 = createSection({ id: 's3', order_index: 1, title: 'Second' })
      
      localStorage.setItem(`lw_offline_secciones_${mockProjectId}`, JSON.stringify([sec1, sec2, sec3]))
      
      const sections = getOfflineSections(mockProjectId)
      expect(sections.length).toBe(3)
      expect(sections[0].id).toBe('s2')
      expect(sections[1].id).toBe('s3')
      expect(sections[2].id).toBe('s1')
    })

    it('caches in memory for subsequent calls', () => {
      const sec = createSection()
      localStorage.setItem(`lw_offline_secciones_${mockProjectId}`, JSON.stringify([sec]))
      
      const sections1 = getOfflineSections(mockProjectId)
      const sections2 = getOfflineSections(mockProjectId)
      expect(sections1).toBe(sections2)
    })

    it('handles corrupted localStorage', () => {
      localStorage.setItem(`lw_offline_secciones_${mockProjectId}`, 'not-json')
      const sections = getOfflineSections(mockProjectId)
      expect(sections).toEqual([])
    })
  })

  describe('saveOfflineSections', () => {
    it('replaces all sections for project', () => {
      const sec1 = createSection({ id: 's1', order_index: 0 })
      const sec2 = createSection({ id: 's2', order_index: 1 })
      
      saveOfflineSections(mockProjectId, [sec1, sec2])
      
      const stored = JSON.parse(localStorage.getItem(`lw_offline_secciones_${mockProjectId}`) || '[]')
      expect(stored.length).toBe(2)
      expect(idb.idbSaveSections).toHaveBeenCalledWith(mockProjectId, [sec1, sec2])
    })

    it('updates memory cache', () => {
      const sections = [createSection({ id: 's1' }), createSection({ id: 's2' })]
      saveOfflineSections(mockProjectId, sections)
      
      const retrieved = getOfflineSections(mockProjectId)
      expect(retrieved).toBe(sections)
    })

    it('handles empty array', () => {
      saveOfflineSections(mockProjectId, [])
      const stored = JSON.parse(localStorage.getItem(`lw_offline_secciones_${mockProjectId}`) || '[]')
      expect(stored).toEqual([])
    })
  })

  describe('saveOfflineSectionContent', () => {
    it('updates content and updated_at for existing section', () => {
      const sec = createSection({ id: 'target-section', content: '<p>Old</p>', updated_at: now })
      saveOfflineSections(mockProjectId, [sec])
      
      const newContent = '<p>New content</p>'
      const beforeUpdate = new Date().toISOString()
      saveOfflineSectionContent(mockProjectId, 'target-section', newContent)
      const afterUpdate = new Date().toISOString()
      
      const sections = getOfflineSections(mockProjectId)
      const updated = sections.find(s => s.id === 'target-section')
      expect(updated?.content).toBe(newContent)
      expect(updated?.updated_at >= beforeUpdate).toBe(true)
      expect(updated?.updated_at <= afterUpdate).toBe(true)
    })

    it('updates project updated_at timestamp', async () => {
      const projectId = 'project-for-section-test'
      const project = { id: projectId, title: 'Test', type: 'sermon', updated_at: now, _isOfflineOnly: true }
      const { saveOfflineProjects } = await import('../offlineStore')
      saveOfflineProjects([project])
      
      const sec = createSection({ project_id: projectId, id: 'sec-1' })
      saveOfflineSections(projectId, [sec])
      
      const oldProjectTime = project.updated_at
      saveOfflineSectionContent(projectId, 'sec-1', '<p>Updated</p>')
      
      const { getOfflineProjects } = await import('../offlineStore')
      const projects = getOfflineProjects()
      const updatedProject = projects.find(p => p.id === projectId)
      expect(updatedProject?.updated_at > oldProjectTime).toBe(true)
    })

    it('does nothing for non-existent section', () => {
      saveOfflineSectionContent(mockProjectId, 'non-existent', '<p>Content</p>')
      const sections = getOfflineSections(mockProjectId)
      expect(sections.length).toBe(0)
    })
  })

  describe('saveOrUpdateOfflineSection', () => {
    it('adds new section when not exists', () => {
      const newSec = createSection({ id: 'new-section', order_index: 5 })
      saveOrUpdateOfflineSection(mockProjectId, newSec)
      
      const sections = getOfflineSections(mockProjectId)
      expect(sections.length).toBe(1)
      expect(sections[0].id).toBe('new-section')
    })

    it('updates existing section preserving other fields', () => {
      const existing = createSection({ id: 'existing', title: 'Original', content: '<p>Old</p>', order_index: 2 })
      saveOfflineSections(mockProjectId, [existing])
      
      const update = { id: 'existing', title: 'Updated', content: '<p>New</p>' }
      saveOrUpdateOfflineSection(mockProjectId, update)
      
      const sections = getOfflineSections(mockProjectId)
      const updated = sections[0]
      expect(updated.title).toBe('Updated')
      expect(updated.content).toBe('<p>New</p>')
      expect(updated.order_index).toBe(2) // Preserved
    })

    it('maintains sort order after update', () => {
      const sec1 = createSection({ id: 's1', order_index: 0 })
      const sec2 = createSection({ id: 's2', order_index: 1 })
      saveOfflineSections(mockProjectId, [sec1, sec2])
      
      // Update sec1 with new order_index
      saveOrUpdateOfflineSection(mockProjectId, { id: 's1', order_index: 5 })
      
      const sections = getOfflineSections(mockProjectId)
      expect(sections[0].id).toBe('s2')
      expect(sections[1].id).toBe('s1')
    })
  })

  describe('deleteOfflineSection', () => {
    it('removes section from project', () => {
      const sec1 = createSection({ id: 's1' })
      const sec2 = createSection({ id: 's2' })
      saveOfflineSections(mockProjectId, [sec1, sec2])
      
      deleteOfflineSection(mockProjectId, 's1')
      
      const sections = getOfflineSections(mockProjectId)
      expect(sections.length).toBe(1)
      expect(sections[0].id).toBe('s2')
    })

    it('handles deleting non-existent section gracefully', () => {
      const sec = createSection({ id: 's1' })
      saveOfflineSections(mockProjectId, [sec])
      
      deleteOfflineSection(mockProjectId, 'non-existent')
      
      const sections = getOfflineSections(mockProjectId)
      expect(sections.length).toBe(1)
    })
  })
})