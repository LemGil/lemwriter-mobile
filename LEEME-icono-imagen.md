# LemWriter Local — icono visible + imagen nítida (2026-10-09)

Dos arreglos sobre la APK actual:

1. **Icono nuevo**: tu logo principal con «LOCAL» en letras doradas grandes,
   todo dentro de la zona que el lanzador no recorta. Antes la franja quedaba
   pegada al borde inferior, el sistema la cortaba y no se leía.
2. **Imagen de compartir nítida**: la sección se dibuja al doble de tamaño
   (2160 px de ancho), para que al verla y ampliarla en WhatsApp el texto se
   lea claro. El PDF también sale más nítido.

## Subida (desde la PC, como la vez pasada)

1. `unzip -o lemwriter-local-icono-imagen-v2.zip -d ~/lemwriter-fase2` (desde Descargas)
2. `cd ~/lemwriter-fase2 && git status --short`
   Todo cae dentro de `android/` y `src/`; el único archivo en la raíz es este LEEME.
3. `git add -A`
   `git commit -m "Icono LOCAL visible e imagen de compartir nitida"`
   `git push`
4. GitHub → Actions → «Construir APK LemWriter Local» → **Run workflow**.
5. Instala `app-debug-firmada.apk` **encima, sin desinstalar**.

## Qué comprobar en el teléfono

- El icono en el lanzador: la pluma con «LOCAL» legible debajo.
- Abre una sección con texto → **Compartir → Imagen**: mándala por WhatsApp,
  ábrela, amplía: el texto se tiene que leer nítido.
- **Compartir → PDF**: abre el PDF y comprueba que se lee igual de claro.
