import '@testing-library/jest-dom/vitest'
import { vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL MOCKS
// ─────────────────────────────────────────────────────────────────────────────

const localStorageStore: Record<string, string> = {}
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => localStorageStore[k] || null,
    setItem: (k: string, v: string) => { localStorageStore[k] = String(v) },
    removeItem: (k: string) => { delete localStorageStore[k] },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) },
    get length() { return Object.keys(localStorageStore).length },
    key: (i: number) => Object.keys(localStorageStore)[i] || null
  },
  writable: true
})

Object.defineProperty(navigator, 'onLine', { writable: true, value: true })

const eventListeners: Map<string, Set<EventListener>> = new Map()
const originalAddEventListener = window.addEventListener
const originalRemoveEventListener = window.removeEventListener
const originalDispatchEvent = window.dispatchEvent

window.addEventListener = vi.fn((type: string, listener: EventListener) => {
  if (!eventListeners.has(type)) eventListeners.set(type, new Set())
  eventListeners.get(type)!.add(listener)
  originalAddEventListener.call(window, type, listener)
})
window.removeEventListener = vi.fn((type: string, listener: EventListener) => {
  eventListeners.get(type)?.delete(listener)
  originalRemoveEventListener.call(window, type, listener)
})
window.dispatchEvent = vi.fn((event: Event) => {
  eventListeners.get(event.type)?.forEach(l => l(event))
  return originalDispatchEvent.call(window, event)
})

export const createSupabaseMock = (overrides: any = {}) => ({
  from: vi.fn((table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn((cb) => cb({ data: [], error: null })),
    ...overrides[table]
  })),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    ...overrides.auth
  },
  ...overrides
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

Object.defineProperty(navigator, 'standalone', { writable: true, value: false })

Object.defineProperty(window, 'showDirectoryPicker', {
  writable: true,
  value: vi.fn().mockResolvedValue({
    name: 'raw',
    getDirectoryHandle: vi.fn().mockResolvedValue({}),
    getFileHandle: vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined)
      })
    }),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted')
  })
})

global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
  onstop: null,
  mimeType: 'audio/webm',
  state: 'inactive'
})) as any
global.MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true)

const mockAudioContext = {
  createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn()
  }),
  close: vi.fn().mockResolvedValue(undefined)
}
global.AudioContext = vi.fn().mockImplementation(() => mockAudioContext) as any
;(window as any).webkitAudioContext = global.AudioContext

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    })
  }
})

Object.defineProperty(navigator, 'vibrate', {
  writable: true,
  value: vi.fn()
})

Object.defineProperty(navigator, 'share', {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined)
})
Object.defineProperty(navigator, 'canShare', {
  writable: true,
  value: vi.fn().mockReturnValue(true)
})

global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32))
    },
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
      return arr
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const waitForAutoSave = () => new Promise(resolve => setTimeout(resolve, 1100))
export const flushPromises = async () => {
  // Esperar la promesa de guardar() si existe (registrada por el listener de change)
  if (typeof window !== 'undefined' && (window as any).__lastGuardarPromise) {
    await (window as any).__lastGuardarPromise
    ;(window as any).__lastGuardarPromise = null
  }
  // Vueltas adicionales de microtasks para efectos secundarios
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}
export const triggerOnline = () => { navigator.onLine = true; window.dispatchEvent(new Event('online')) }
export const triggerOffline = () => { navigator.onLine = false; window.dispatchEvent(new Event('offline')) }
export const advanceTimers = (ms: number) => vi.advanceTimersByTime(ms)

export const resetAllMocks = () => {
  vi.clearAllMocks()
  Object.keys(localStorageStore).forEach(k => delete localStorageStore[k])
  eventListeners.clear()
}

window.HTMLElement.prototype.scrollIntoView = vi.fn()

// IMPORTANTE: sin vi.useFakeTimers() aquí. Los timers son reales por defecto
// para que waitFor()/findBy*() funcionen. Cada archivo de test activa fake
// timers explícitamente en su propio beforeEach solo cuando los necesita
// (para vi.advanceTimersByTime en el debounce del auto-save).
beforeEach(() => {
  resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  resetAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT SIMULATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const createRemoteNewerVersion = (sectionId: string, newContent: string, minutesAhead = 1) => ({
  id: sectionId,
  content: newContent,
  updated_at: new Date(Date.now() + minutesAhead * 60 * 1000).toISOString(),
  title: 'Test Section',
  project_id: 'test-project'
})

export const createLocalSection = (id: string, content: string, minutesAgo = 5) => ({
  id,
  project_id: 'test-project',
  title: 'Test Section',
  content,
  order_index: 0,
  updated_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
  _isOfflineOnly: false
})

export const createConflict = (overrides: any = {}) => ({
  id: `conflict_${Date.now()}`,
  projectId: 'test-project',
  projectTitle: 'Test Project',
  sectionId: 'test-section',
  sectionTitle: 'Test Section',
  localContent: '<p>Local version</p>',
  remoteContent: '<p>Remote version</p>',
  localUpdatedAt: new Date().toISOString(),
  remoteUpdatedAt: new Date(Date.now() + 60000).toISOString(),
  baseUpdatedAt: new Date(Date.now() - 300000).toISOString(),
  detectedAt: new Date().toISOString(),
  status: 'pending' as const,
  ...overrides
})

export const mswHandlers = []

export { vi }
