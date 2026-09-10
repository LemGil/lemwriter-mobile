import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Editor from '../components/Editor'
import * as offlineStore from '../lib/offlineStore'
import { supabase } from '../lib/supabase'
import { triggerOnline, waitForAutoSave, flushPromises, resetAllMocks, createRemoteNewerVersion } from '../../test/vitest.setup'

vi.mock('../lib/supabase', () => {
  const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
  const mockEq = vi.fn(() => ({ order: mockOrder, single: mockSingle }))
  const mockSelect = vi.fn(() => ({ eq: mockEq, order: mockOrder, single: mockSingle }))
  const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
  const sharedFromInstance = {
    select: mockSelect,
    upsert: mockUpsert,
    delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
    update: mockUpdate,
  }
  const mockFrom = vi.fn(() => sharedFromInstance)
  return {
    supabase: { from: mockFrom, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) } }
  }
})
vi.mock('../lib/offlineStore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOfflineSections: vi.fn().mockReturnValue([
      { id: 'sec-1', project_id: 'proj-1', title: 'Introducción', content: '<p>Original</p>', order_index: 0, _isOfflineOnly: false, updated_at: new Date(Date.now() - 300000).toISOString() }
    ]),
    saveOfflineSectionContent: vi.fn(),
    saveOfflineSections: vi.fn(),
    saveOrUpdateOfflineProject: vi.fn(),
    addPendingSyncAction: vi.fn(),
    generateLocalId: vi.fn(() => 'local_sec_new'),
    saveConflict: vi.fn(),
    getPendingConflicts: vi.fn().mockReturnValue([])
  }
})

vi.mock('../hooks/useDictado', () => ({
  useDictado: () => ({
    dictando: false,
    modoExtendido: false,
    transcribiendo: false,
    tiempoGrabacion: 0,
    audioLevel: 0,
    toggleDictado: vi.fn(),
    toggleExtendido: vi.fn(),
    detenerTodo: vi.fn()
  })
}))

vi.mock('../components/ExportarPDFModal', () => ({ ExportarPDFModal: () => null }))
vi.mock('../components/ModoLecturaModal', () => ({ ModoLecturaModal: () => null }))
vi.mock('../components/SugerirTitulosModal', () => ({ SugerirTitulosModal: () => null }))
vi.mock('../components/ConflictoResolucionModal', () => {
  const MockModal = ({ isOpen, onClose }: any) => isOpen ? <div data-testid="conflicto-modal" onClick={onClose}>Conflicto Modal</div> : null
  return { default: MockModal, ConflictoResolucionModal: MockModal }
})
vi.mock('../services/exportObsidianService', () => ({ buildObsidianExport: vi.fn().mockReturnValue(null) }))

const mockSupabase = supabase as any
const mockOfflineStore = offlineStore as any

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('Editor - Conflict Detection Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetAllMocks()
    triggerOnline()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultProps = {
    proyecto: { id: 'proj-1', title: 'Test Sermon', type: 'sermon' },
    onBack: vi.fn(),
    onUpdateProyecto: vi.fn()
  }

  it('detects conflict in Editor.guardar() when remote newer and content differs', async () => {
    mockSupabase.from().select().single.mockResolvedValue({
      data: createRemoteNewerVersion('sec-1', '<p>Remote edit</p>', 5),
      error: null
    })

    render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

    // Deja que la promesa mockeada del fetch inicial resuelva y el
    // componente re-renderice, sin depender del polling real de findBy*.
    await act(async () => {
      await flushPromises()
    })

    const editorContent = screen.getByRole('textbox')
    fireEvent.change(editorContent, { target: { innerHTML: '<p>Local edit</p>' } })

    await act(async () => {
      vi.advanceTimersByTime(1100)
      await flushPromises()
    })

    expect(mockOfflineStore.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: 'sec-1',
        localContent: expect.stringContaining('Local edit'),
        remoteContent: expect.stringContaining('Remote edit'),
        status: 'pending'
      })
    )

    expect(mockSupabase.from().update).not.toHaveBeenCalled()
  })

  it('does NOT detect conflict when content identical despite remote newer', async () => {
    mockSupabase.from().select().single.mockResolvedValue({
      data: createRemoteNewerVersion('sec-1', '<p>Same content</p>', 5),
      error: null
    })

    render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

    await act(async () => {
      await flushPromises()
    })

    const editorContent = screen.getByRole('textbox')
    fireEvent.change(editorContent, { target: { innerHTML: '<p>Same content</p>' } })

    await act(async () => {
      vi.advanceTimersByTime(1100)
      await flushPromises()
    })

    expect(mockOfflineStore.saveConflict).not.toHaveBeenCalled()
    expect(mockSupabase.from().update).toHaveBeenCalled()
  })

  it('does NOT detect conflict when remote older than base', async () => {
    mockSupabase.from().select().single.mockResolvedValue({
      data: {
        id: 'sec-1',
        content: '<p>Old remote</p>',
        updated_at: new Date(Date.now() - 600000).toISOString(),
        project_id: 'proj-1',
        title: 'Introducción'
      },
      error: null
    })

    render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

    await act(async () => {
      await flushPromises()
    })

    const editorContent = screen.getByRole('textbox')
    fireEvent.change(editorContent, { target: { innerHTML: '<p>Local edit</p>' } })

    await act(async () => {
      vi.advanceTimersByTime(1100)
      await flushPromises()
    })

    expect(mockOfflineStore.saveConflict).not.toHaveBeenCalled()
    expect(mockSupabase.from().update).toHaveBeenCalled()
  })

  it('shows conflict banner in OfflineIndicator when conflicts exist', async () => {
    mockOfflineStore.getPendingConflicts.mockReturnValue([
      { id: 'conflict-1', projectId: 'proj-1', sectionId: 'sec-1', status: 'pending' }
    ])

    const { rerender } = render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

    await act(async () => {
      await flushPromises()
    })

    rerender(<Editor {...defaultProps} />)

    await act(async () => {
      await flushPromises()
    })

    expect(screen.getByText(/Conflicto de edición detectado/i)).toBeInTheDocument()
  })
})
