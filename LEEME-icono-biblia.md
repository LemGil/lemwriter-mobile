# LemWriter Local: icono (su logo + LOCAL), Biblia con Leer/noche, arreglo del Editor y Compartir en 3 formas

## Qué trae este paquete
1. **Icono propio** (ya no el genérico de Capacitor): su logo principal —la pluma
   dorada con la cruz sobre el arco— con la franja dorada «LOCAL» debajo, en
   todas las densidades de `android/app/src/main/res/`, más el fondo azul marino
   en `values/ic_launcher_background.xml`.
2. **Biblia con «Leer» y nocturnidad**: `src/components/BibliaVista.tsx` suma el
   botón «📖 Leer» (pantalla completa), temas 🌙 Noche / ☀️ Día / 📜 Sepia, tamaño
   de letra A−/A+ y «Reiniciar lectura». Ese código existía desde el 2026-10-05
   pero nunca había subido a GitHub.
3. **Arreglo del Editor** (reporte del 2026-10-09):
   - La numeración **A, B, C / a, b, c** (y la de I, II, III) ya no se pierde al
     guardar: en el archivo `.md` viaja como «A.», «a.», «I.» y al reabrir la
     sección vuelve igual. Antes todo quedaba «1. 2. 3.». (`src/lib/folderStore.ts`)
   - **Tx** ahora sí limpia todo: títulos, listas, negritas, colores y resaltados
     vuelven a texto normal. Antes solo quitaba las marcas y parecía no hacer
     nada. (`src/components/Editor.tsx`)
4. **Compartir en 3 formas** (nuevo): el botón «Compartir» del Editor ahora abre
   un menú para elegir al momento:
   - 📝 **Texto**: como hoy, listo para pegar y copiable.
   - 🖼️ **Imagen**: la sección dibujada tal como se ve (tarjeta azul y dorada);
     ideal para WhatsApp, pero el texto no se puede copiar.
   - 📄 **PDF**: documento por páginas para leer e imprimir; tampoco copiable.
   (`src/lib/compartirImagen.ts`; en Imagen/PDF las fotos de la sección no viajan.)

## Cómo subirlo (desde la PC, clon `lemwriter-fase2`)
1. Descomprimir este zip ENCIMA del clon, respetando las rutas (todo cae dentro
   de `android/...` y `src/...`). Verificar con `git status --short` que ningún
   archivo quede suelto en la raíz.
2. `git add -A`, commit (ej. «Icono LOCAL, Biblia con Leer, Editor y Compartir»)
   y `git push`.
3. GitHub → Actions → «Construir APK LemWriter Local» → Run workflow.
4. Descargar el artefacto LemWriter-Local-APK e instalar
   `app-debug-firmada.apk` ENCIMA de la actual (sin desinstalar; la firma es la
   tuya).

## Al abrirla, revisar
- El icono se ve con tu logo y la franja LOCAL.
- Biblia → abrir un capítulo → «📖 Leer» → cambiar a 🌙 Noche.
- Editor → numerar con «A, B, C», salir de la sección y volver a entrar: las
  letras quedan. Y Tx sobre un título con negrita lo deja como texto normal.
- Editor → «Compartir»: sale el menú con Texto / Imagen / PDF; probar las tres.
