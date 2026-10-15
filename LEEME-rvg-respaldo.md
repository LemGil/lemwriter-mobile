# LEEME — RVG + respaldo ZIP + resaltado + copia del original + artefacto numerado

Paquete combinado para LemWriter Local. **No uses el zip anterior**
(`lemwriter-local-respaldo-zip.zip`): este lo incluye todo.

## Qué trae

1. **Reina-Valera Gómez (RVG)** — tercera versión de la Biblia (RV1909 · VBL · RVG),
   66 libros y 31 102 versículos verificados. Licencia CC BY-NC-ND 4.0
   (© 2004, 2010, 2023 Dr. Humberto Gómez Caballero; uso no comercial, sin
   modificar el texto). Fuente: eBible.org.
2. **Cambiar de versión dentro de la lectura** — las píldoras RV1909 | VBL | RVG
   ahora están también en la pantalla del capítulo y en el Modo Leer
   (pantalla completa). Ya no hay que salir para cambiar de versión; la app
   recuerda la elegida.
3. **Respaldo ZIP de las carpetas** — en Respaldo → pestaña Obsidian, panel
   «💾 Respaldo ZIP de las carpetas»: «📦 Crear respaldo ZIP» guarda todo
   `Documentos/LemWriter` en `Documentos/LemWriter-respaldo-<fecha>.zip`;
   «📤 Compartir» lo envía por WhatsApp/correo; «♻️ Restaurar desde ZIP»
   (confirmación en dos toques) devuelve las carpetas a ese estado.
4. **Resaltado conservado** — el resaltado del editor ya no se pierde al
   guardar y reabrir (viaja en el `.md` como el color y la justificación).
5. **Copia del documento original** — al importar, casilla «Guardar copia del
   archivo original en el proyecto» (activada por defecto): el `.docx`/`.pdf`
   queda en `<proyecto>/originales/`.
6. **Artefacto numerado** — la descarga de GitHub se llama
   `LemWriter-Local-APK-<número de corrida>` para no confundirla con APK viejas.

No incluye el punto 1 («Preparar para Academia»): los proyectos pasan a la PC
por Syncthing y se publican desde allí.

## Pasos (en la PC, desde ~/Descargas)

```bash
cd ~/Descargas
unzip -o lemwriter-local-rvg-respaldo.zip -d ~/lemwriter-fase2
cd ~/lemwriter-fase2
git status --short
git add -A
git commit -m "RVG tercera version, cambio de version en lectura, respaldo ZIP, resaltado y original al importar"
git push
```

Después: en GitHub, **Run workflow** en «Construir APK LemWriter Local»,
descargar el artefacto `LemWriter-Local-APK-<número>` **de esa corrida**,
e instalar la APK encima (sin desinstalar).

## Verificar en el teléfono

1. Biblia → leer un capítulo → arriba verás **RV1909 | VBL | RVG**: cambia sin salir.
2. «📖 Leer» (pantalla completa) → también trae las tres píldoras.
3. Respaldo → pestaña Obsidian → «📦 Crear respaldo ZIP» → `✅ Respaldo creado`.
4. Editor: resalta una frase, guarda, reabre → sigue resaltada.
5. Importa un documento con la casilla activada → el original queda en `originales/`.

## Archivos del paquete

- `src/biblia/datos/rvg/` (66 libros + index.json) — NUEVO
- `src/biblia/bibliaService.ts` (registra la RVG)
- `src/components/BibliaVista.tsx` (píldoras en lectura y Modo Leer)
- `src/components/BibliaModal.tsx` (recuerda la versión elegida)
- `src/lib/__tests__/bibliaRvg.test.ts` — NUEVO
- `src/components/settings/RespaldoZipCarpetas.tsx`, `src/lib/respaldoZip.ts` — NUEVO
- `src/components/RespaldoTotalModal.tsx`, `src/lib/folderStore.ts`,
  `src/lib/fsAdapter.ts`, `src/lib/fsCapacitor.ts`, `src/lib/localStore.ts`,
  `src/components/ImportarDocumentoModal.tsx`
- `src/lib/__tests__/respaldoZip.test.ts`, `src/lib/__tests__/resaltadoOriginal.test.ts`
- `.github/workflows/build-apk.yml` (solo cambia el nombre del artefacto)

Verificado: 49/49 pruebas relacionadas, `tsc` limpio, build local y nube OK.
