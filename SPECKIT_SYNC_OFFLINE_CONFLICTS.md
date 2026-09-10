# SPECKIT Specification: Sync, Conflicts & Offline Resilience

**Project:** LemWriter Mobile v1.1  
**Module:** `src/lib/offlineStore.ts`, `src/lib/indexedDbStore.ts`, `src/hooks/useOnlineStatus.ts`, `src/components/Editor.tsx`, `src/components/ConflictoResolucionModal.tsx`  
**Priority:** CRITICAL — Data integrity, user trust, offline-first guarantee

---

## 1. SCOPE & OBJECTIVES

| Objective | Success Criteria |
|-----------|------------------|
| **Offline Write Durability** | Every keystroke persisted to IndexedDB within 1s (auto-save debounce) + immediate localStorage mirror |
| **Sync Queue Correctness** | All `PendingSyncAction` processed in FIFO order; deduplication of `UPDATE_SECTION` for same `id` |
| **Conflict Detection (Dual-Layer)** | 100% detection in both `Editor.guardar()` (pre-flight) AND `processOfflineSyncQueue()` (re-check) |
| **Conflict Resolution Integrity** | All 4 strategies (`keep_both`, `merge`, `keep_local`, `keep_remote`) produce correct final state locally + remotely |
| **No Data Loss** | Zero lost sections/projects across: online→offline→online transitions, app restarts, browser crashes |
| **Migration Safety** | `localStorage → IndexedDB` migration runs once, transfers 100% of data, idempotent |

---

## 2. TEST MATRIX

### 2.1 Unit Tests (Vitest) — `src/lib/__tests__/`

| Test File | Target | Key Scenarios |
|-----------|--------|---------------|
| `offlineStore.projects.test.ts` | `getOfflineProjects`, `saveOrUpdateOfflineProject`, `deleteOfflineProject` | CRUD, sorting by `updated_at`, `_isOfflineOnly` flag, initial project creation |
| `offlineStore.sections.test.ts` | `getOfflineSections`, `saveOfflineSectionContent`, `saveOrUpdateOfflineSection`, `deleteOfflineSection` | Section content updates, order_index reordering, project timestamp cascade |
| `offlineStore.syncQueue.test.ts` | `getPendingSyncQueue`, `addPendingSyncAction`, `removePendingSyncAction`, `clearPendingSyncQueue` | **Deduplication logic** (UPDATE_SECTION same id), FIFO ordering, event dispatch |
| `offlineStore.conflicts.test.ts` | `getPendingConflicts`, `saveConflict`, `removeConflict`, `resolveConflict` | All 4 resolutions, status transitions, `newSectionId` return for `keep_both`, event dispatch |
| `offlineStore.syncProcess.test.ts` | `processOfflineSyncQueue` (mocked Supabase) | **Conflict re-check during sync**, sequential processing, error counting, `lw:sync-status` events |
| `offlineStore.utils.test.ts` | `generateLocalId`, `isOfflineGuestSession`, `setOfflineGuestSession`, `cleanText` | ID uniqueness, guest session persistence, HTML→text normalization |

### 2.2 Integration Tests (Vitest + MSW) — `src/__integration__/`

| Test File | Flow | Assertions |
|-----------|------|------------|
| `editor-autosave-offline.test.tsx` | Type in Editor → wait 1.1s → verify IndexedDB + localStorage | `saveOfflineSectionContent` called, `guardadoExitoso=true`, no network request |
| `editor-autosave-online.test.tsx` | Online → type → auto-save → verify Supabase `update` call | `fetch` to Supabase REST, `updated_at` updated, Obsidian export fire-and-forget |
| `sync-queue-replay.test.tsx` | Offline: create 3 sections → Online: `syncNow()` → verify all 3 in Supabase | Queue length 3 → 0, `syncedCount=3`, `errors=0`, sections have real UUIDs (not `local_`) |
| `conflict-detection-editor.test.tsx` | Simulate remote newer version → type locally → auto-save → `EditConflict` created | Pre-flight GET detects `remoteTime > localBaseTime`, conflict saved, push aborted |
| `conflict-detection-sync.test.tsx` | Queue has UPDATE_SECTION → remote modified meanwhile → sync processes → conflict created | `processOfflineSyncQueue` re-check detects divergence, saves conflict, removes action from queue |
| `conflict-resolution-keep-both.test.tsx` | Resolve `keep_both` → verify 2 sections exist (remote + local copy) | Original section = remote content; new section = local content + "(Copia local)" title |
| `conflict-resolution-merge.test.tsx` | Resolve `merge` → verify combined content with divider | HTML contains both versions separated by `<hr>` + banner div |
| `migration-localstorage-to-idb.test.tsx` | Pre-populate localStorage → load app → verify IndexedDB populated | `migrado_desde_localstorage_v1=true`, projects+sections+queue+conflicts transferred |

### 2.3 E2E Tests (Playwright) — `e2e/`

| Test File | User Journey | Critical Checkpoints |
|-----------|--------------|----------------------|
| `offline-first-write.spec.ts` | 1. Open app (online) 2. Disconnect network 3. Create project + 3 sections + write content 4. Close tab 5. Reopen 6. Reconnect 7. Verify sync | Data survives reload offline; `pendingCount` badge appears; auto-sync on reconnect; `syncedCount` toast |
| `concurrent-edit-conflict.spec.ts` | 1. User A edits section on Device 1 2. User B edits same section on Device 2 3. Both save 4. Conflict detected 5. Resolve `keep_both` | Conflict banner appears on both; comparativa view shows both versions; resolution creates 2 sections |
| `guest-mode-persistence.spec.ts` | 1. Click "Trabajar Fuera de Línea" 2. Create 2 projects 3. Close browser 4. Reopen 5. Click "Acceder" (login) 6. Verify projects migrated to user | Guest data persists; on login, `offlineGuestSession=false`; projects get `user_id` on sync |
| `pwa-install-offline.spec.ts` | 1. Install PWA 2. Open standalone 3. Disconnect 4. Write sermon 5. Reconnect | Service Worker caches all assets; `navigator.onLine=false` handled; IndexedDB works in standalone |
| `backup-restore-roundtrip.spec.ts` | 1. Create 5 projects with sections 2. Export JSON backup 3. Clear IndexedDB (devtools) 4. Import JSON 5. Verify all restored | `restaurados=5`, `totalSecciones` matches, `onRestauracionExitosa` triggers reload |

---

## 3. TEST IMPLEMENTATION PATTERNS

### 3.1 Mocking Strategy

```typescript
// vitest.setup.ts
import { vi } from 'vitest'
import { IndexedDB } from 'fake-indexeddb' // or 'idb' with in-memory adapter

// 1. Supabase client mock
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
      then: vi.fn((cb) => cb({ data: [], error: null }))
    })),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn()
    }
  }
}))

// 2. Navigator.onLine control
Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
global.dispatchEvent = vi.fn()

// 3. localStorage mock (persists across tests)
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { store = {} }
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// 4. IndexedDB via fake-indexeddb (runs in Node)
import { FDBKeyRange, FDBTransaction } from 'fake-indexeddb'
global.IDBKeyRange = FDBKeyRange
global.IDBTransaction = FDBTransaction
```

### 3.2 Async Test Helpers

```typescript
// test/utils.tsx
export const waitForAutoSave = () => new Promise(r => setTimeout(r, 1100)) // > debounce 1s
export const flushPromises = () => new Promise(r => setImmediate(r))
export const triggerOnline = () => { navigator.onLine = true; window.dispatchEvent(new Event('online')) }
export const triggerOffline = () => { navigator.onLine = false; window.dispatchEvent(new Event('offline')) }
```

### 3.3 Conflict Simulation Helper

```typescript
// test/conflict-helpers.ts
export const createRemoteNewerVersion = (sectionId: string, newContent: string) => {
  // Mock supabase.from('lw_secciones').select().single() to return newer updated_at
  return { 
    id: sectionId, 
    content: newContent, 
    updated_at: new Date(Date.now() + 10000).toISOString() // 10s in future
  }
}
```

---

## 4. CI/CD INTEGRATION

```yaml
# .github/workflows/test-critical.yml
name: Critical Sync/Offline Tests
on: [push, pull_request]
jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run test:unit --coverage
      - run: bun run test:integration
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - run: bun run start & sleep 5
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test e2e/
```

---

## 5. COVERAGE TARGETS

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Line Coverage (offlineStore + indexedDbStore)** | ≥ 95% | Core data integrity logic |
| **Branch Coverage (conflict resolution)** | 100% | All 4 strategies + error paths |
| **Mutation Testing (Stryker)** | ≥ 80% | Catch missing assertions |
| **E2E Critical Paths** | 5 scenarios | Offline write, sync, conflict, guest, backup |

---

## 6. REGRESSION GUARDS (Must-Pass Before Merge)

| Guard | Implementation |
|-------|----------------|
| **No `local_` IDs in Synced Data** | Test: after `processOfflineSyncQueue`, all projects/sections have non-`local_` IDs |
| **Conflict Events Fired** | Test: `saveConflict` → `lw:conflict-detected` + `lw:conflicts-change` dispatched |
| **Sync Queue Not Stuck** | Test: `processOfflineSyncQueue` called twice → second call returns `{syncedCount: 0, errors: 0}` |
| **Migration Idempotent** | Test: run `migrateFromLocalStorageToIndexedDB` twice → second returns `{migrated: false}` |
| **Guest Session Cleared on Login** | Test: `setOfflineGuestSession(true)` → `supabase.auth.onAuthStateChange` with session → `isOfflineGuestSession() === false` |

---

## 7. DEBUGGING TOOLS (Dev-Only)

```typescript
// src/lib/debugSync.ts (excluded from production build)
export const debugSync = {
  dumpQueue: () => console.table(getPendingSyncQueue()),
  dumpConflicts: () => console.table(getPendingConflicts()),
  dumpProjects: () => console.table(getOfflineProjects()),
  dumpSections: (projectId) => console.table(getOfflineSections(projectId)),
  forceSync: () => processOfflineSyncQueue(),
  clearAll: () => { clearPendingSyncQueue(); /* ... */ }
}

// Expose in console: window.__LW_DEBUG__ = debugSync
```

---

## 8. ACCEPTANCE CHECKLIST (Definition of Done)

- [ ] All unit tests pass (`bun test:unit`)
- [ ] All integration tests pass (`bun test:integration`)
- [ ] All E2E tests pass (`npx playwright test`)
- [ ] Coverage thresholds met (`bun test:coverage`)
- [ ] Mutation score ≥ 80% (`bun stryker run`)
- [ ] No TypeScript errors (`bun run lint`)
- [ ] Manual QA: Offline write → reload → online → sync verified
- [ ] Manual QA: Concurrent edit conflict → resolve `keep_both` → 2 sections visible
- [ ] Manual QA: Guest mode → create data → login → data migrated
- [ ] Manual QA: Backup JSON → clear storage → restore → all data recovered

---

**Document Version:** 1.0  
**Author:** SpecKit Agent  
**Review Required:** Lead Engineer + QA Lead  
**Next Review:** After test implementation sprint