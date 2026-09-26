import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Editor from '../components/Editor'
import { supabase } from '../lib/supabase'
import * as offlineStore from '../lib/offlineStore'
import { triggerOnline, triggerOffline, waitForAutoSave, flushPromises, resetAllMocks } from '../../test/vitest.setup'

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
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    getOfflineSections: vi.fn().mockReturnValue([
      { id: 'sec-1', project_id: 'proj-1', title: 'Introducción', content: '', order_index: 0, _isOfflineOnly: false, updated_at: new Date(Date.now() - 300000).toISOString() }
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

vi.mock('../components/ExportarPDFModal', () => ({
  ExportarPDFModal: ({ isOpen, onClose }) => isOpen ? <div data-testid="export-pdf-modal" onClick={onClose}>Export PDF Modal</div> : null
}))

vi.mock('../components/ModoLecturaModal', () => ({
  ModoLecturaModal: ({ isOpen, onClose }) => isOpen ? <div data-testid="modo-lectura-modal" onClick={onClose}>Modo Lectura Modal</div> : null
}))

vi.mock('../components/SugerirTitulosModal', () => ({
  SugerirTitulosModal: ({ isOpen, onClose }) => isOpen ? <div data-testid="sugerir-titulos-modal" onClick={onClose}>Sugerir Títulos Modal</div> : null
}))

vi.mock('../components/ConflictoResolucionModal', () => ({
  ConflictoResolucionModal: ({ isOpen, onClose }) => isOpen ? <div data-testid="conflicto-modal" onClick={onClose}>Conflicto Modal</div> : null
}))

vi.mock('../services/exportObsidianService', () => ({
  buildObsidianExport: vi.fn().mockReturnValue(null),
  writeObsidianFile: vi.fn().mockResolvedValue(false)
}))

vi.mock('../services/obsidianFsService', () => ({
  writeObsidianFile: vi.fn().mockResolvedValue(false)
}))

const mockSupabase = supabase as any

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('Editor - Integration', () => {
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

  it('renders editor with Tiptap', async () => {
    render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

    await act(async () => {
      await flushPromises()
    })

    expect(screen.getByText('Test Sermon')).toBeInTheDocument()
  })

  describe('Auto-save offline', () => {
    it('saves to offlineStore immediately on change', async () => {
      render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

      await act(async () => {
        await flushPromises()
      })

      const editorContent = screen.getByRole('textbox')
      fireEvent.change(editorContent, { target: { innerHTML: '<p>New content</p>' } })

      await act(async () => {
        vi.advanceTimersByTime(1100)
        await flushPromises()
      })

      expect(offlineStore.saveOfflineSectionContent).toHaveBeenCalledWith(
        'proj-1',
        'sec-1',
        expect.stringContaining('New content')
      )
    })

    it('does not call Supabase when offline', async () => {
      triggerOffline()
      render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

      await act(async () => {
        await flushPromises()
      })

      const editorContent = screen.getByRole('textbox')
      fireEvent.change(editorContent, { target: { innerHTML: '<p>Offline content</p>' } })

      await act(async () => {
        vi.advanceTimersByTime(1100)
        await flushPromises()
      })

      expect(mockSupabase.from).not.toHaveBeenCalled()
      expect(offlineStore.addPendingSyncAction).toHaveBeenCalledWith(
        'UPDATE_SECTION',
        expect.objectContaining({ content: expect.stringContaining('Offline content') })
      )
    })
  })

  describe('Auto-save online', () => {
    it('calls Supabase update when online', async () => {
      mockSupabase.from().update().eq.mockResolvedValue({ error: null })
      mockSupabase.from().select().single.mockResolvedValue({
        data: { id: 'sec-1', content: '', updated_at: new Date(Date.now() - 600000).toISOString() },
        error: null
      })

      render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

      await act(async () => {
        await flushPromises()
      })

      const editorContent = screen.getByRole('textbox')
      fireEvent.change(editorContent, { target: { innerHTML: '<p>Online content</p>' } })

      await act(async () => {
        vi.advanceTimersByTime(1100)
        await flushPromises()
      })

      await act(async () => {
        await flushPromises()
      })

      expect(mockSupabase.from).toHaveBeenCalledWith('lw_secciones')
      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Online content') })
      )
    })

    it('detects conflict when remote newer and content differs', async () => {
      mockSupabase.from().select().single.mockResolvedValue({
        data: {
          id: 'sec-1',
          content: '<p>Remote version</p>',
          updated_at: new Date(Date.now() + 5000).toISOString(),
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
      fireEvent.change(editorContent, { target: { innerHTML: '<p>Local version</p>' } })

      await act(async () => {
        vi.advanceTimersByTime(1100)
        await flushPromises()
      })

      await act(async () => {
        await flushPromises()
      })

      expect(offlineStore.saveConflict).toHaveBeenCalled()
      expect(mockSupabase.from().update).not.toHaveBeenCalled()
    })
  })

  describe('Navigation protection', () => {
    it('shows confirmation modal when leaving with unsaved changes', async () => {
      render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

      await act(async () => {
        await flushPromises()
      })

      const editorContent = screen.getByRole('textbox')
      fireEvent.change(editorContent, { target: { innerHTML: '<p>Unsaved</p>' } })

      const backButton = screen.getByRole('button', { name: /volver/i })
      fireEvent.click(backButton)

      expect(screen.getByText(/modificaciones recientes/i)).toBeInTheDocument()
    })

    it('allows leaving when no unsaved changes', async () => {
      render(<Editor {...defaultProps} />, { wrapper: createWrapper() })

      await act(async () => {
        await flushPromises()
      })

      const backButton = screen.getByRole('button', { name: /volver/i })
      fireEvent.click(backButton)

      expect(defaultProps.onBack).toHaveBeenCalled()
      expect(screen.queryByText(/modificaciones recientes/i)).not.toBeInTheDocument()
    })
  })
})
