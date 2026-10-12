# LemWriter Local — botón visible para borrar proyectos (2026-10-12)

**Lo nuevo:** cada tarjeta de proyecto ahora muestra un botón rojo 🗑️
junto al lápiz de editar. Al tocarlo se abre la confirmación
(«¿Eliminar Proyecto? … no se puede deshacer») y al confirmar se borra el
proyecto con todas sus secciones de las carpetas (`Documentos/LemWriter`).

El gesto de deslizar sigue funcionando igual; esto es la opción visible
que faltaba.

## Subida (desde la PC, como siempre)

1. `unzip -o lemwriter-local-borrar-proyecto.zip -d ~/lemwriter-fase2` (desde Descargas)
2. `cd ~/lemwriter-fase2 && git status --short`
   Todo cae dentro de `src/`; el único archivo en la raíz es este LEEME.
3. `git add -A`
   `git commit -m "Boton visible para borrar proyectos"`
   `git push`
4. GitHub → Actions → «Construir APK LemWriter Local» → **Run workflow**.
5. Instala `app-debug-firmada.apk` **encima, sin desinstalar**.

## Qué comprobar en el teléfono

- Cada proyecto muestra el botón 🗑️ rojo junto al lápiz.
- Al tocarlo sale la confirmación; al confirmar, el proyecto desaparece
  de la lista (y sus carpetas se borran).
- Al cancelar, no pasa nada.
