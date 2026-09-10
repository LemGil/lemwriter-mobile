import { test, expect } from '@playwright/test'

test.describe('Backup and Restore Roundtrip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Use guest mode for predictable testing
    await page.click('button:has-text("Trabajar Fuera de Línea")')
  })

  test('exports JSON backup and restores successfully', async ({ page }) => {
    // Create multiple projects with sections
    const projects = [
      { title: 'Sermon 1', type: 'Sermón', sections: ['Intro 1', 'Point 1', 'Conclusion 1'] },
      { title: 'Study 1', type: 'Estudio', sections: ['Intro 2', 'Section A', 'Section B'] },
      { title: 'Devotional 1', type: 'Devocional', sections: ['Morning', 'Evening'] }
    ]
    
    for (const proj of projects) {
      await page.click('button:has-text("Nuevo")')
      await page.fill('input[placeholder*="Ej: La Gloria"]', proj.title)
      await page.click(`text=${proj.type}`)
      await page.click('button:has-text("Comenzar a Escribir")')
      
      // Write content in first section
      await page.locator('[contenteditable="true"]').first().fill(proj.sections[0])
      await page.waitForTimeout(1500)
      
      // Add more sections
      for (let i = 1; i < proj.sections.length; i++) {
        await page.click('button:has-text("Organizar")')
        await page.click('button:has-text("Nueva sección")')
        await page.fill('input[placeholder*="Título"]', proj.sections[i])
        await page.click('button:has-text("Crear")')
        await page.locator('[contenteditable="true"]').first().fill(proj.sections[i])
        await page.waitForTimeout(1500)
      }
      
      // Go back to projects list
      await page.click('button[aria-label="Volver a proyectos"]')
    }
    
    // Verify all projects created
    for (const proj of projects) {
      await expect(page.locator(`text=${proj.title}`)).toBeVisible()
    }
    
    // Open Respaldo Total modal
    await page.click('button:has-text("RESPALDO")')
    await expect(page.locator('text=Copia de Seguridad')).toBeVisible()
    
    // Select "Datos JSON" tab
    await page.click('text=Datos JSON')
    
    // Click "Descargar Respaldo JSON"
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Descargar Respaldo JSON")')
    const download = await downloadPromise
    
    // Verify download
    expect(download.suggestedFilename()).toMatch(/LemWriter_Respaldo_Total_.*\.json/)
    
    // Read backup content
    const backupPath = await download.path()
    const fs = require('fs')
    const backupContent = fs.readFileSync(backupPath, 'utf-8')
    const backupData = JSON.parse(backupContent)
    
    expect(backupData.version).toBe('1.0.0')
    expect(backupData.total_proyectos).toBe(3)
    expect(backupData.proyectos.length).toBe(3)
    
    // Clear all data (simulate fresh install)
    await page.evaluate(() => {
      localStorage.clear()
      indexedDB.deleteDatabase('LemWriter_Ministerial_DB')
    })
    await page.reload()
    
    // Should be back to empty state
    await page.click('button:has-text("Trabajar Fuera de Línea")')
    await expect(page.locator('text=El altar de revelación está listo')).toBeVisible()
    
    // Restore backup
    await page.click('button:has-text("RESPALDO")')
    await page.click('text=Datos JSON')
    
    // Select backup file
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.click('button:has-text("Seleccionar Archivo de Respaldo")')
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(backupPath)
    
    // Should show success
    await expect(page.locator('text=Se restauraron 3 proyectos')).toBeVisible({ timeout: 10000 })
    
    // Verify all projects restored
    for (const proj of projects) {
      await expect(page.locator(`text=${proj.title}`)).toBeVisible()
    }
    
    // Verify content in each project
    for (const proj of projects) {
      await page.click(`text=${proj.title}`)
      await expect(page.locator(`text=${proj.sections[0]}`)).toBeVisible()
      await page.click('button[aria-label="Volver a proyectos"]')
    }
  })

  test('ZIP export contains all projects as HTML', async ({ page }) => {
    // Create a couple projects
    await page.click('button:has-text("Nuevo")')
    await page.fill('input[placeholder*="Ej: La Gloria"]', 'ZIP Test Sermon')
    await page.click('text=Sermón')
    await page.click('button:has-text("Comenzar a Escribir")')
    await page.locator('[contenteditable="true"]').first().fill('Content for ZIP export')
    await page.waitForTimeout(1500)
    await page.click('button[aria-label="Volver a proyectos"]')
    
    // Open Respaldo Total
    await page.click('button:has-text("RESPALDO")')
    await page.click('text=Carpeta ZIP')
    
    // Download ZIP
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("Descargar Carpeta ZIP")')
    const download = await downloadPromise
    
    expect(download.suggestedFilename()).toMatch(/LemWriter_Coleccion_PDF_.*\.zip/)
    
    // Verify ZIP contents (basic check)
    const JSZip = require('jszip')
    const buffer = await download.path()
    const zip = await JSZip.loadAsync(buffer)
    
    const files = Object.keys(zip.files)
    expect(files.length).toBeGreaterThan(1)
    expect(files.some(f => f.includes('COMPENDIO_GENERAL'))).toBe(true)
    expect(files.some(f => f.includes('ZIP_Test_Sermon'))).toBe(true)
  })
})