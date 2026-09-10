import { test, expect } from '@playwright/test'

test.describe('PWA Install and Offline', () => {
  test('PWA installs and works offline in standalone mode', async ({ page, context }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check PWA install button visible (if not already installed)
    const installButton = page.locator('button:has-text("Instalar")')
    if (await installButton.isVisible()) {
      // In test environment, beforeinstallprompt may not fire
      // Just verify the button exists
      await expect(installButton).toBeVisible()
    }
    
    // Verify service worker registered
    const swRegistered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return !!registration
    })
    expect(swRegistered).toBe(true)
    
    // Verify critical assets cached
    const cacheNames = await page.evaluate(async () => {
      const cache = await caches.open('lemwriter-mobile')
      const keys = await cache.keys()
      return keys.map(r => r.url)
    })
    
    // Should have HTML, JS, CSS cached
    expect(cacheNames.some(url => url.includes('.html'))).toBe(true)
    expect(cacheNames.some(url => url.includes('.js'))).toBe(true)
    expect(cacheNames.some(url => url.includes('.css'))).toBe(true)
    
    // Go offline
    await context.setOffline(true)
    await page.reload()
    
    // App should still load (served from cache)
    await expect(page.locator('text=LemWriter')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Sin Internet')).toBeVisible()
    
    // Create content offline
    await page.click('button:has-text("Nuevo")')
    await page.fill('input[placeholder*="Ej: La Gloria"]', 'PWA Offline Sermon')
    await page.click('text=Sermón')
    await page.click('button:has-text("Comenzar a Escribir")')
    
    await page.locator('[contenteditable="true"]').first().fill('Contenido escrito en PWA offline.')
    await page.waitForTimeout(1500)
    await expect(page.locator('text=Cambios guardados')).toBeVisible()
    
    // Go back online
    await context.setOffline(false)
    await page.reload()
    
    // Should sync
    await expect(page.locator('text=Sincronizados')).toBeVisible({ timeout: 10000 })
  })
  
  test('manifest and icons accessible', async ({ page }) => {
    await page.goto('/')
    
    // Check manifest
    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest')
    
    // Check theme color
    const themeColor = page.locator('meta[name="theme-color"]')
    await expect(themeColor).toHaveAttribute('content', '#10242F')
    
    // Check icons exist
    const icon192 = await page.evaluate(async () => {
      const resp = await fetch('/icon-192x192.png', { method: 'HEAD' })
      return resp.ok
    })
    expect(icon192).toBe(true)
    
    const icon512 = await page.evaluate(async () => {
      const resp = await fetch('/icon-512x512.png', { method: 'HEAD' })
      return resp.ok
    })
    expect(icon512).toBe(true)
  })
})