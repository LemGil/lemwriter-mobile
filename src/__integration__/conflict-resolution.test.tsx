import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConflictoResolucionModal } from '../components/ConflictoResolucionModal'
import * as offlineStore from '../lib/offlineStore'
import { supabase } from '../lib/supabase'
import { resetAllMocks, createConflict, flushPromises } from '../../test/vitest.setup'

vi.mock('../lib/offlineStore', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    resolveConflict: vi.fn().mockResolvedValue({ success: true, newSectionId: undefined })
  }
})

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

const mockOfflineStore = offlineStore as any
const mockSupabase = supabase as any

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const baseConflict = createConflict({
  id: 'test-conflict-1',
  projectId: 'proj-1',
  projectTitle: 'Test Project',
  sectionId: 'sec-1',
  sectionTitle: 'Introducción',
  localContent: '<p>Local version</p>',
  remoteContent: '<p>Remote version</p>',
  localUpdatedAt: new Date().toISOString(),
  remoteUpdatedAt: new Date(Date.now() + 60000).toISOString()
})

describe('ConflictoResolucionModal - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders conflict with both versions side by side', () => {
    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Tu Versión en este dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Versión en la Nube / Otro Dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Local version')).toBeInTheDocument()
    expect(screen.getByText('Remote version')).toBeInTheDocument()
  })

  it('shows word counts for both versions', () => {
    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
      { wrapper: createWrapper() }
    )

    const contadores = screen.getAllByText(/2 palabras/)
    expect(contadores.length).toBe(4)
  })

  it('resolves keep_both and calls onResolved', async () => {
    const onResolved = vi.fn()
    mockOfflineStore.resolveConflict.mockResolvedValue({ success: true, newSectionId: 'new-sec-1' })

    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByText('Conservar Ambas Versiones'))

    await waitFor(() => {
      expect(mockOfflineStore.resolveConflict).toHaveBeenCalledWith('test-conflict-1', 'keep_both')
      expect(onResolved).toHaveBeenCalledWith('keep_both', 'new-sec-1')
    })
  })

  it('resolves merge and combines content', async () => {
    const onResolved = vi.fn()
    mockOfflineStore.resolveConflict.mockResolvedValue({ success: true })

    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByText('Combinar Ambas en una'))

    await waitFor(() => {
      expect(mockOfflineStore.resolveConflict).toHaveBeenCalledWith('test-conflict-1', 'merge')
      expect(onResolved).toHaveBeenCalledWith('merge', undefined)
    })
  })

  it('resolves keep_local', async () => {
    const onResolved = vi.fn()
    mockOfflineStore.resolveConflict.mockResolvedValue({ success: true })

    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByText('Conservar Solo Mi Versión Local'))

    await waitFor(() => {
      expect(mockOfflineStore.resolveConflict).toHaveBeenCalledWith('test-conflict-1', 'keep_local')
      expect(onResolved).toHaveBeenCalledWith('keep_local', undefined)
    })
  })

  it('resolves keep_remote', async () => {
    const onResolved = vi.fn()
    mockOfflineStore.resolveConflict.mockResolvedValue({ success: true })

    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={onResolved}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByText('Aceptar Versión de la Nube'))

    await waitFor(() => {
      expect(mockOfflineStore.resolveConflict).toHaveBeenCalledWith('test-conflict-1', 'keep_remote')
      expect(onResolved).toHaveBeenCalledWith('keep_remote', undefined)
    })
  })

  it('switches between comparison views', () => {
    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Tu Versión en este dispositivo')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Solo Local'))
    expect(screen.getByText('Local version')).toBeInTheDocument()
    expect(screen.queryByText('Versión en la Nube')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Solo Nube'))
    expect(screen.getByText('Remote version')).toBeInTheDocument()
    expect(screen.queryByText('Tu Versión')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Lado a lado'))
    expect(screen.getByText('Tu Versión en este dispositivo')).toBeInTheDocument()
    expect(screen.getByText('Versión en la Nube / Otro Dispositivo')).toBeInTheDocument()
  })

  it('disables buttons while resolving', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    let resolvePromise: Promise<any>
    mockOfflineStore.resolveConflict.mockImplementation(() => {
      resolvePromise = new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      return resolvePromise
    })

    render(
      <ConflictoResolucionModal
        conflicto={baseConflict}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByText('Conservar Ambas Versiones'))

    expect(screen.getByText('Conservar Ambas Versiones').closest('button')).toBeDisabled()
    expect(screen.getByText('Combinar Ambas en una').closest('button')).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(100)
      await flushPromises()
    })
  })
})
