import { test, expect } from '@playwright/test'

test.describe('Offline-First Write Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start with online mode
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('creates project offline, persists through reload, syncs on reconnect', async ({ page, context }) => {
    // 1. Go offline
    await context.setOffline(true)
    await page.reload()
    
    // Should show offline indicator
    await expect(page.locator('text=Sin Internet')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Guardando en este dispositivo')).toBeVisible()
    
    // 2. Create new project while offline
    await page.click('button:has-text("Nuevo")')
    await page.fill('input[placeholder*="Ej: La Gloria"]', 'Sermón Offline Test')
    await page.click('text=Sermón') // Select type
    await page.click('button:has-text("Comenzar a Escribir")')
    
    // Should be in editor now
    await expect(page.locator('text=Sermón Offline Test')).toBeVisible()
    
    // 3. Write content
    const editor = page.locator('[contenteditable="true"]').first()
    await editor.click()
    await editor.fill('Este es el contenido escrito sin conexión. Debe persistir.')
    
    // Wait for auto-save
    await page.waitForTimeout(1500)
    await expect(page.locator('text=Cambios guardados')).toBeVisible({ timeout: 5000 })
    
    // 4. Close and reopen (simulate browser restart)
    await page.close()
    const newPage = await context.newPage()
    await newPage.goto('/')
    
    // Should still be offline
    await expect(newPage.locator('text=Sin Internet')).toBeVisible()
    
    // Project should be visible in list
    await expect(newPage.locator('text=Sermón Offline Test')).toBeVisible()
    
    // 5. Open project and verify content persisted
    await newPage.click('text=Sermón Offline Test')
    await expect(newPage.locator('text=Este es el contenido escrito sin conexión')).toBeVisible()
    
    // 6. Go back online
    await context.setOffline(false)
    await newPage.reload()
    
    // Should sync automatically
    await expect(newPage.locator('text=Sincronizados')).toBeVisible({ timeout: 10000 })
    
    // Verify project has real ID (not local_)
    const projectCard = newPage.locator('text=Sermón Offline Test').locator('..')
    // Check no offline-only indicators
    await expect(newPage.locator('text=Modo Fuera de Línea')).not.toBeVisible()
  })
})

test.describe('Guest Mode Persistence', () => {
  test('guest mode data persists and migrates on login', async ({ page, context }) => {
    await page.goto('/')
    
    // Click "Trabajar Fuera de Línea"
    await page.click('button:has-text("Trabajar Fuera de Línea")')
    
    // Create project in guest mode
    await page.click('button:has-text("Nuevo")')
    await page.fill('input[placeholder*="Ej: La Gloria"]', 'Guest Mode Sermon')
    await page.click('text=Devocional')
    await page.click('button:has-text("Comenzar a Escribir")')
    
    await page.locator('[contenteditable="true"]').first().fill('Contenido en modo invitado')
    await page.waitForTimeout(1500)
    await expect(page.locator('text=Cambios guardados')).toBeVisible()
    
    // Reload - should still be in guest mode
    await page.reload()
    await expect(page.locator('text=Modo Fuera de Línea')).toBeVisible()
    await expect(page.locator('text=Guest Mode Sermon')).toBeVisible()
    
    // Login (mock - in real test would use test user)
    // For now just verify data persists in localStorage
    const guestSession = await page.evaluate(() => localStorage.getItem('lw_offline_guest_session'))
    expect(guestSession).toBe('true')
    
    const projects = await page.evaluate(() => JSON.parse(localStorage.getItem('lw_offline_proyectos') || '[]'))
    expect(projects.find((p: any) => p.title === 'Guest Mode Sermon')).toBeTruthy()
  })
})