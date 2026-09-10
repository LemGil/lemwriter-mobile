import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Proyectos from '../components/Proyectos'
import * as offlineStore from '../lib/offlineStore'
import { triggerOnline, triggerOffline, waitForAutoSave, flushPromises, resetAllMocks } from '../../test/vitest.setup'

vi.mock('../lib/supabase', () => {
  const mockEq = vi.fn().mockResolvedValue({ data: [], error: null })
  const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockFrom = vi.fn(() => ({
    select: vi.fn(() => ({ eq: mockEq, order: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    upsert: mockUpsert,
    delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })),
  }))
  return {
    supabase: { from: mockFrom, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) } }
  }
})
vi.mock('../lib/offlineStore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getOfflineProjects: vi.fn().mockReturnValue([
      { id: 'proj-1', title: 'Sermon 1', type: 'sermon', updated_at: new Date().toISOString(), _isOfflineOnly: true },
      { id: 'proj-2', title: 'Study 1', type: 'estudio', updated_at: new Date(Date.now() - 10000).toISOString(), _isOfflineOnly: true }
    ]),
    saveOrUpdateOfflineProject: vi.fn(),
    deleteOfflineProject: vi.fn(),
    addPendingSyncAction: vi.fn(),
    generateLocalId: vi.fn(() => 'local_proj_new'),
    getPendingSyncQueue: vi.fn(() => []),
    processOfflineSyncQueue: vi.fn().mockResolvedValue({ syncedCount: 2, errors: 0 }),
    getPendingConflicts: vi.fn().mockReturnValue([]),
    getOfflineSections: vi.fn().mockReturnValue([{ id: 'sec-1', project_id: 'proj-1', title: 'Intro', content: '', order_index: 0 }]),
    saveOfflineSections: vi.fn()
  }
})

vi.mock('../components/SwipeableProjectCard', () => ({
  SwipeableProjectCard: ({ proyecto, onSelect, onEdit, onDelete }) => (
    <div data-testid={`project-${proyecto.id}`} onClick={() => onSelect(proyecto)}>
      <span>{proyecto.title}</span>
      <button onClick={(e) => { e.stopPropagation(); onEdit(proyecto, e as any); }}>Edit</button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(proyecto); }}>Delete</button>
    </div>
  )
}))

vi.mock('../components/ConflictoResolucionModal', () => ({
  default: ({ isOpen, onClose }: any) => isOpen ? <div data-testid="conflicto-modal" onClick={onClose}>Conflicto Modal</div> : null,
  ConflictoResolucionModal: ({ isOpen, onClose }: any) => isOpen ? <div data-testid="conflicto-modal" onClick={onClose}>Conflicto Modal</div> : null
}))

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('Proyectos - Sync Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetAllMocks()
    triggerOnline()
    // Sin fake timers globales: estos tests dependen de waitFor(),
    // que se cuelga si setTimeout está fake-eado (mismo motivo que en
    // conflict-resolution.test.tsx).
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultProps = {
    onSelect: vi.fn(),
    busqueda: '',
    filtroTipo: 'todos',
    onTiposLoaded: vi.fn(),
    session: { user: { id: 'user-123' } }
  }

  it('shows pending count badge when offline with pending actions', async () => {
    const { getPendingSyncQueue } = await import('../lib/offlineStore')
    vi.mocked(getPendingSyncQueue).mockReturnValue([
      { id: 'sync-1', type: 'CREATE_PROJECT', payload: {}, timestamp: Date.now() },
      { id: 'sync-2', type: 'UPDATE_SECTION', payload: {}, timestamp: Date.now() }
    ])

    triggerOffline()
    render(<Proyectos {...defaultProps} />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/2 pendientes por subir/i)).toBeInTheDocument()
    })
  })

  it('syncs on reconnect', async () => {
    const { processOfflineSyncQueue } = await import('../lib/offlineStore')
    vi.mocked(processOfflineSyncQueue).mockResolvedValue({ syncedCount: 2, errors: 0 })

    triggerOffline()
    render(<Proyectos {...defaultProps} />, { wrapper: createWrapper() })

    triggerOnline()

    await waitFor(() => {
      expect(processOfflineSyncQueue).toHaveBeenCalled()
    })
  })

  it('creates project offline and queues for sync', async () => {
    const { addPendingSyncAction, saveOrUpdateOfflineProject } = await import('../lib/offlineStore')

    render(<Proyectos {...defaultProps} />, { wrapper: createWrapper() })

    // El botón "Nuevo" puede tardar en aparecer si el componente
    // muestra skeletons mientras carga los proyectos offline.
    fireEvent.click(await screen.findByText('Nuevo'))

    fireEvent.change(screen.getByPlaceholderText(/tema del mensaje/i), { target: { value: 'Offline Sermon' } })
    fireEvent.click(screen.getByText('Sermón'))

    triggerOffline()

    fireEvent.click(screen.getByText('Comenzar a Escribir'))

    await waitFor(() => {
      expect(addPendingSyncAction).toHaveBeenCalledWith('CREATE_PROJECT', expect.objectContaining({ title: 'Offline Sermon' }))
      expect(addPendingSyncAction).toHaveBeenCalledWith('CREATE_SECTION', expect.any(Object))
      expect(saveOrUpdateOfflineProject).toHaveBeenCalled()
    })
  })
})
