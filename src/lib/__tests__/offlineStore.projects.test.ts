import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getOfflineProjects,
  saveOfflineProjects,
  saveOrUpdateOfflineProject,
  deleteOfflineProject,
  generateLocalId
} from '../offlineStore'
import * as idb from '../indexedDbStore'
import { waitForAutoSave, flushPromises, resetAllMocks, triggerOffline, triggerOnline } from '../../test/vitest.setup'

// Mock IndexedDB functions
vi.mock('../indexedDbStore', () => ({
  idbGetAllProjects: vi.fn().mockResolvedValue([]),
  idbSaveProject: vi.fn().mockResolvedValue(undefined),
  idbSaveAllProjects: vi.fn().mockResolvedValue(undefined),
  idbDeleteProject: vi.fn().mockResolvedValue(undefined),
  requestPersistentStorage: vi.fn().mockResolvedValue(true),
  migrateFromLocalStorageToIndexedDB: vi.fn().mockResolvedValue({ migrated: false, projectsCount: 0, sectionsCount: 0 })
}))

describe('offlineStore - Projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('getOfflineProjects', () => {
    it('returns empty array initially and creates default project', async () => {
      const projects = getOfflineProjects()
      expect(Array.isArray(projects)).toBe(true)
      expect(projects.length).toBe(1)
      expect(projects[0].id).toBe('local_proj_inicial')
      expect(projects[0].title).toBe('Mi Primer Sermón (Modo Local)')
      expect(projects[0]._isOfflineOnly).toBe(true)
    })

    it('returns cached projects from memory on subsequent calls', async () => {
      const projects1 = getOfflineProjects()
      const projects2 = getOfflineProjects()
      expect(projects1).toBe(projects2) // Same reference from memory cache
    })

    it('sorts projects by updated_at descending', async () => {
      const now = new Date().toISOString()
      const earlier = new Date(Date.now() - 3600000).toISOString()
      
      localStorage.setItem('lw_offline_proyectos', JSON.stringify([
        { id: 'p1', title: 'Project 1', type: 'sermon', updated_at: earlier, _isOfflineOnly: true },
        { id: 'p2', title: 'Project 2', type: 'estudio', updated_at: now, _isOfflineOnly: true }
      ]))

      // Reset memory cache to force reload from localStorage
      vi.resetModules()
      const { getOfflineProjects: getProjectsFresh } = await import('../offlineStore')
      const projects = getProjectsFresh()
      
      expect(projects[0].id).toBe('p2') // Most recent first
      expect(projects[1].id).toBe('p1')
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('lw_offline_proyectos', 'invalid-json')
      const projects = getOfflineProjects()
      expect(projects.length).toBe(1) // Falls back to default project
    })
  })

  describe('saveOfflineProjects', () => {
    it('updates memory cache and localStorage', () => {
      const projects = [
        { id: 'p1', title: 'Project 1', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true }
      ]
      saveOfflineProjects(projects)
      
      const stored = JSON.parse(localStorage.getItem('lw_offline_proyectos') || '[]')
      expect(stored).toEqual(projects)
      expect(idb.idbSaveAllProjects).toHaveBeenCalledWith(projects)
    })

    it('updates memory cache reference', () => {
      const projects = [{ id: 'p1', title: 'Project 1', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true }]
      saveOfflineProjects(projects)
      const retrieved = getOfflineProjects()
      expect(retrieved).toBe(projects) // Same reference
    })
  })

  describe('saveOrUpdateOfflineProject', () => {
    it('adds new project to beginning of list', () => {
      const existing = getOfflineProjects()
      const initialCount = existing.length
      
      const newProject = {
        id: 'new-proj',
        title: 'New Project',
        type: 'devocional',
        updated_at: new Date().toISOString(),
        _isOfflineOnly: true
      }
      
      saveOrUpdateOfflineProject(newProject)
      
      const projects = getOfflineProjects()
      expect(projects.length).toBe(initialCount + 1)
      expect(projects[0].id).toBe('new-proj') // Added to beginning
    })

    it('updates existing project and moves to top', () => {
      // First add a project
      const existing = getOfflineProjects()
      const testProject = {
        id: 'test-update',
        title: 'Original Title',
        type: 'sermon',
        updated_at: new Date(Date.now() - 10000).toISOString(),
        _isOfflineOnly: true
      }
      saveOfflineProjects([...existing, testProject])
      
      // Now update it
      const updated = { ...testProject, title: 'Updated Title', updated_at: new Date().toISOString() }
      saveOrUpdateOfflineProject(updated)
      
      const projects = getOfflineProjects()
      const found = projects.find(p => p.id === 'test-update')
      expect(found?.title).toBe('Updated Title')
      expect(projects[0].id).toBe('test-update') // Moved to top
    })

    it('updates localStorage and calls IndexedDB', async () => {
      const project = { id: 'p1', title: 'Test', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true }
      saveOrUpdateOfflineProject(project)
      
      expect(idb.idbSaveProject).toHaveBeenCalledWith(project)
      const stored = JSON.parse(localStorage.getItem('lw_offline_proyectos') || '[]')
      expect(stored.some((p: any) => p.id === 'p1')).toBe(true)
    })
  })

  describe('deleteOfflineProject', () => {
    it('removes project from memory, localStorage, and IndexedDB', async () => {
      const project = { id: 'to-delete', title: 'To Delete', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true }
      saveOfflineProjects([project])
      
      deleteOfflineProject('to-delete')
      
      const projects = getOfflineProjects()
      expect(projects.find(p => p.id === 'to-delete')).toBeUndefined()
      expect(idb.idbDeleteProject).toHaveBeenCalledWith('to-delete')
      expect(localStorage.getItem('lw_offline_secciones_to-delete')).toBeNull()
    })

    it('clears associated sections cache', async () => {
      const project = { id: 'proj-with-sections', title: 'Test', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true }
      saveOfflineProjects([project])
      // Simulate sections in memory cache
      const { memorySectionsCache } = await import('../offlineStore')
      memorySectionsCache.set('proj-with-sections', [{ id: 's1', project_id: 'proj-with-sections', title: 'Sec', content: '', order_index: 0 }])
      
      deleteOfflineProject('proj-with-sections')
      
      const { memorySectionsCache: cache } = await import('../offlineStore')
      expect(cache.has('proj-with-sections')).toBe(false)
    })
  })

  describe('generateLocalId', () => {
    it('generates unique IDs with prefix and timestamp', () => {
      const id1 = generateLocalId('local_proj')
      const id2 = generateLocalId('local_proj')
      
      expect(id1).toMatch(/^local_proj_\d+_[a-z0-9]{7}$/)
      expect(id2).toMatch(/^local_proj_\d+_[a-z0-9]{7}$/)
      expect(id1).not.toBe(id2)
    })

    it('generates different prefixes correctly', () => {
      const projId = generateLocalId('local_proj')
      const secId = generateLocalId('local_sec')
      
      expect(projId).toMatch(/^local_proj_/)
      expect(secId).toMatch(/^local_sec_/)
    })
  })
})