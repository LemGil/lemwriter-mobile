import { test, expect } from '@playwright/test'

test.describe('Concurrent Edit Conflict', () => {
  test('detects conflict when same section edited on two devices', async ({ browser }) => {
    // Device 1: Create project and write initial content
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()
    await page1.goto('/')
    
    // Login or guest mode
    await page1.click('button:has-text("Trabajar Fuera de Línea")')
    await page1.click('button:has-text("Nuevo")')
    await page1.fill('input[placeholder*="Ej: La Gloria"]', 'Conflict Test Sermon')
    await page1.click('text=Sermón')
    await page1.click('button:has-text("Comenzar a Escribir")')
    
    await page1.locator('[contenteditable="true"]').first().fill('Versión inicial del contenido.')
    await page1.waitForTimeout(1500)
    await expect(page1.locator('text=Cambios guardados')).toBeVisible()
    
    // Go back to projects
    await page1.click('button[aria-label="Volver a proyectos"]')
    
    // Device 2: Open same project (simulate by direct navigation in same context for test)
    // In real scenario this would be a different browser/device
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()
    await page2.goto('/')
    await page2.click('button:has-text("Trabajar Fuera de Línea")')
    
    // Open same project on device 2
    await page2.click('text=Conflict Test Sermon')
    await page2.locator('[contenteditable="true"]').first().fill('Versión inicial del contenido.')
    await page2.waitForTimeout(1500)
    
    // Device 1: Edit section
    await page1.click('text=Conflict Test Sermon')
    await page1.locator('[contenteditable="true"]').first().fill('Versión inicial del contenido. Editado en dispositivo 1.')
    await page1.waitForTimeout(1500)
    await expect(page1.locator('text=Cambios guardados')).toBeVisible()
    
    // Device 2: Edit same section (without refresh - stale base)
    await page2.locator('[contenteditable="true"]').first().fill('Versión inicial del contenido. Editado en dispositivo 2.')
    await page2.waitForTimeout(1500)
    
    // Device 2 should detect conflict
    await expect(page2.locator('text=Conflicto de edición detectado')).toBeVisible({ timeout: 10000 })
    
    // Open conflict resolution modal
    await page2.click('text=Conflicto de edición detectado')
    
    // Should show both versions side by side
    await expect(page2.locator('text=Tu Versión en este dispositivo')).toBeVisible()
    await expect(page2.locator('text=Versión en la Nube / Otro Dispositivo')).toBeVisible()
    await expect(page2.locator('text=Editado en dispositivo 1')).toBeVisible()
    await expect(page2.locator('text=Editado en dispositivo 2')).toBeVisible()
    
    // Resolve with "Conservar Ambas"
    await page2.click('text=Conservar Ambas Versiones')
    
    // Should show success and create two sections
    await expect(page2.locator('text=Se crearon dos secciones')).toBeVisible({ timeout: 5000 })
    
    await context1.close()
    await context2.close()
  })
})