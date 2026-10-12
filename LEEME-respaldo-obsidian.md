# LemWriter Local — Respaldo: Obsidian en la APK, sin panel de prueba, carpeta raíz con explorador (2026-10-12)

**1. Botón de Obsidian arreglado en la APK.** El botón «Conectar carpeta
MinisterioWiki/raw» usaba una función que solo existe en Chrome de
escritorio, por eso no hacía nada en el teléfono. Ahora en la APK abre el
explorador de carpetas: eliges la carpeta (por defecto ya apunta a
`Almacenamiento/MinisterioWiki/raw`, que llega sola por Syncthing) y cada
autoguardado escribe el `.md` ahí.

**2. Quitado el panel «🧪 Prueba de Carpetas».** Ya cumplió su misión.

**3. Carpeta raíz con explorador.** En su lugar hay una sección
«📁 Carpeta raíz de LemWriter Local» que muestra dónde viven tus proyectos
y un botón «🔍 Cambiar carpeta…» para elegirla navegando (ya no hay que
escribir la dirección a mano). Al cambiarla, la app se reinicia y lee los
proyectos de la nueva carpeta.

## Subida (desde la PC)

1. `unzip -o lemwriter-local-respaldo-obsidian.zip -d ~/lemwriter-fase2` (desde Descargas)
2. `rm -f ~/lemwriter-fase2/src/components/settings/LocalTestPanel.tsx` (panel viejo, ya no se usa)
3. `cd ~/lemwriter-fase2 && git status --short`
   Todo cae dentro de `src/`; verás el `LocalTestPanel.tsx` como borrado (D) y este LEEME en la raíz.
4. `git add -A`
   `git commit -m "Obsidian en la APK y carpeta raiz con explorador"`
   `git push`
5. GitHub → Actions → «Construir APK LemWriter Local» → **Run workflow**.
6. Instala `app-debug-firmada.apk` **encima, sin desinstalar**.

## Qué comprobar en el teléfono (con Internet para descargar)

- Respaldo → Obsidian: «Conectar carpeta MinisterioWiki/raw» abre el
  explorador → busca `Almacenamiento/MinisterioWiki/raw` → «Usar esta
  carpeta» → queda conectado mostrando la ruta.
- Edita una sección y guarda: el `.md` debe aparecer en esa carpeta
  (revísalo con el administrador de archivos).
- Ya no está el panel 🧪; en su lugar «📁 Carpeta raíz» con el botón
  «🔍 Cambiar carpeta…» → eliges navegando → la app se reinicia.
