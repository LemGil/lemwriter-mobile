import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateLocalId,
  isOfflineGuestSession,
  setOfflineGuestSession
} from '../offlineStore'
import { resetAllMocks } from '../../test/vitest.setup'

describe('offlineStore - Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.resetModules()
  })

  describe('generateLocalId', () => {
    it('generates unique IDs with correct prefix format', () => {
      const projId = generateLocalId('local_proj')
      const secId = generateLocalId('local_sec')
      
      expect(projId).toMatch(/^local_proj_\d+_[a-z0-9]{7}$/)
      expect(secId).toMatch(/^local_sec_\d+_[a-z0-9]{7}$/)
    })

    it('produces different IDs on each call', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(generateLocalId('local_proj'))
      }
      expect(ids.size).toBe(100)
    })

    it('includes timestamp for rough ordering', () => {
      const before = Date.now()
      const id = generateLocalId('local_proj')
      const after = Date.now()
      
      const timestampStr = id.split('_')[2]
      const timestamp = parseInt(timestampStr, 10)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('isOfflineGuestSession / setOfflineGuestSession', () => {
    it('returns false initially', () => {
      expect(isOfflineGuestSession()).toBe(false)
    })

    it('returns true after enabling', () => {
      setOfflineGuestSession(true)
      expect(isOfflineGuestSession()).toBe(true)
    })

    it('returns false after disabling', () => {
      setOfflineGuestSession(true)
      setOfflineGuestSession(false)
      expect(isOfflineGuestSession()).toBe(false)
    })

    it('persists in localStorage', () => {
      setOfflineGuestSession(true)
      expect(localStorage.getItem('lw_offline_guest_session')).toBe('true')
      
      setOfflineGuestSession(false)
      expect(localStorage.getItem('lw_offline_guest_session')).toBe('false')
    })

    it('dispatches lw:session-change event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      setOfflineGuestSession(true)
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'lw:session-change' })
      )
    })
  })

  describe('cleanText (internal)', () => {
    // Test the cleanText function used in conflict detection
    const cleanText = (str: string) => 
      (str || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

    it('strips HTML tags', () => {
      expect(cleanText('<p>Hello</p>')).toBe('Hello')
      expect(cleanText('<strong>Bold</strong> text')).toBe('Bold text')
    })

    it('normalizes whitespace', () => {
      expect(cleanText('Hello    world')).toBe('Hello world')
      expect(cleanText('Hello\n\nworld')).toBe('Hello world')
    })

    it('handles empty and null', () => {
      expect(cleanText('')).toBe('')
      expect(cleanText(null as any)).toBe('')
      expect(cleanText(undefined as any)).toBe('')
    })

    it('preserves text content from complex HTML', () => {
      const html = `
        <h1>Title</h1>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>
        <blockquote>Quote</blockquote>
      `
      expect(cleanText(html)).toBe('Title Paragraph with bold and italic. Quote')
    })
  })
})