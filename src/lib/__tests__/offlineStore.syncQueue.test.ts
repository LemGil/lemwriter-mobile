import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getPendingSyncQueue,
  addPendingSyncAction,
  removePendingSyncAction,
  clearPendingSyncQueue
} from '../offlineStore'
import * as idb from '../indexedDbStore'
import { resetAllMocks } from '../../../test/vitest.setup'

vi.mock('../indexedDbStore', () => ({
  idbGetSyncQueue: vi.fn().mockResolvedValue([]),
  idbSaveSyncQueue: vi.fn().mockResolvedValue(undefined)
}))

describe('offlineStore - Sync Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const createAction = (overrides: any = {}) => ({
    id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    type: 'UPDATE_SECTION' as const,
    payload: { id: 'section-1', content: '<p>Test</p>' },
    timestamp: Date.now(),
    ...overrides
  })

  describe('getPendingSyncQueue', () => {
    it('returns empty array initially', () => {
      const queue = getPendingSyncQueue()
      expect(queue).toEqual([])
    })

    it('loads from localStorage and sorts by timestamp', () => {
      const action1 = createAction({ id: 'a1', timestamp: 1000 })
      const action2 = createAction({ id: 'a2', timestamp: 2000 })
      const action3 = createAction({ id: 'a3', timestamp: 1500 })
      
      localStorage.setItem('lw_offline_pending_sync_queue', JSON.stringify([action1, action2, action3]))
      
      const queue = getPendingSyncQueue()
      expect(queue.length).toBe(3)
      expect(queue[0].id).toBe('a1')
      expect(queue[1].id).toBe('a3')
      expect(queue[2].id).toBe('a2')
    })

    it('caches in memory', () => {
      const action = createAction()
      localStorage.setItem('lw_offline_pending_sync_queue', JSON.stringify([action]))
      
      const q1 = getPendingSyncQueue()
      const q2 = getPendingSyncQueue()
      expect(q1).toBe(q2)
    })
  })

  describe('addPendingSyncAction', () => {
    it('adds action to queue and persists', () => {
      const action = { type: 'CREATE_PROJECT' as const, payload: { title: 'New Project' } }
      addPendingSyncAction(action.type, action.payload)
      
      const queue = getPendingSyncQueue()
      expect(queue.length).toBe(1)
      expect(queue[0].type).toBe('CREATE_PROJECT')
      expect(queue[0].payload).toEqual(action.payload)
      expect(idb.idbSaveSyncQueue).toHaveBeenCalled()
    })

    it('dispatches lw:pending-sync-change event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      addPendingSyncAction('UPDATE_SECTION', { id: 's1' })
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'lw:pending-sync-change' })
      )
    })

    describe('UPDATE_SECTION deduplication', () => {
      it('replaces existing UPDATE_SECTION for same section id', () => {
        // Add first update
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-1', content: '<p>First</p>' })
        expect(getPendingSyncQueue().length).toBe(1)
        
        // Add second update for same section
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-1', content: '<p>Second</p>' })
        
        const queue = getPendingSyncQueue()
        expect(queue.length).toBe(1) // Not 2!
        expect(queue[0].payload.content).toBe('<p>Second</p>') // Latest wins
      })

      it('does not deduplicate different section ids', () => {
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-1', content: '<p>1</p>' })
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-2', content: '<p>2</p>' })
        
        expect(getPendingSyncQueue().length).toBe(2)
      })

      it('does not deduplicate non-UPDATE_SECTION actions', () => {
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-1', content: '<p>1</p>' })
        addPendingSyncAction('CREATE_SECTION', { id: 'section-1', title: 'New' })
        
        expect(getPendingSyncQueue().length).toBe(2)
      })

      it('preserves timestamp of latest action', () => {
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-1', content: '<p>First</p>' })
        const firstTimestamp = getPendingSyncQueue()[0].timestamp
        
        // Wait a bit to ensure different timestamp
        vi.advanceTimersByTime(10)
        
        addPendingSyncAction('UPDATE_SECTION', { id: 'section-1', content: '<p>Second</p>' })
        const secondTimestamp = getPendingSyncQueue()[0].timestamp
        
        expect(secondTimestamp).toBeGreaterThanOrEqual(firstTimestamp)
      })
    })
  })

  describe('removePendingSyncAction', () => {
    it('removes specific action by id', () => {
      const action1 = createAction({ id: 'remove-me' })
      const action2 = createAction({ id: 'keep-me' })
      localStorage.setItem('lw_offline_pending_sync_queue', JSON.stringify([action1, action2]))
      
      removePendingSyncAction('remove-me')
      
      const queue = getPendingSyncQueue()
      expect(queue.length).toBe(1)
      expect(queue[0].id).toBe('keep-me')
    })

    it('dispatches lw:pending-sync-change event', () => {
      const action = createAction({ id: 'to-remove' })
      localStorage.setItem('lw_offline_pending_sync_queue', JSON.stringify([action]))
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      
      removePendingSyncAction('to-remove')
      
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'lw:pending-sync-change' })
      )
    })
  })

  describe('clearPendingSyncQueue', () => {
    it('empties queue and clears localStorage', () => {
      localStorage.setItem('lw_offline_pending_sync_queue', JSON.stringify([createAction(), createAction()]))
      
      clearPendingSyncQueue()
      
      expect(getPendingSyncQueue()).toEqual([])
      expect(localStorage.getItem('lw_offline_pending_sync_queue')).toBeNull()
      expect(idb.idbSaveSyncQueue).toHaveBeenCalledWith([])
    })

    it('dispatches lw:pending-sync-change event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      clearPendingSyncQueue()
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'lw:pending-sync-change' })
      )
    })
  })
})