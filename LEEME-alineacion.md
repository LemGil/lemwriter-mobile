# LemWriter Local — La justificación ya no se pierde + títulos que no se repiten (2026-10-13)

**1. Justificar/centrar/derecha ahora sobreviven al guardar y reabrir.**
El defecto: al guardar, la app convertía el texto a `.md` y en el camino
tiraba la alineación (`style="text-align: justify"`); al reabrir, el párrafo
volvía a la izquierda. Ahora el `.md` guarda un marcador discreto al final
de la línea (`<!-- alinear: justify -->`) y al abrir se restaura la
alineación. Vale para párrafos, títulos y bloques.

**2. Incluye el arreglo de los títulos repetidos** («Pasaje Bíblico» que se
multiplicaba en cada ciclo guardar→abrir). Ese paquete nunca se subió, así
que viene incluido aquí: **ya no hace falta el zip `lemwriter-local-notas-fix.zip`**.
Los proyectos con títulos repetidos se curan solos al abrirlos.

## Subida (desde la PC)

1. `unzip -o lemwriter-local-alineacion.zip -d ~/lemwriter-fase2` (desde Descargas)
2. `cd ~/lemwriter-fase2 && git status --short`
   Todo cae dentro de `src/`; verás este LEEME en la raíz.
3. `git add -A`
   `git commit -m "Justificacion conservada en el .md y titulos sin duplicar"`
   `git push`
4. GitHub → Actions → «Construir APK LemWriter Local» → **Run workflow**.
5. Instala `app-debug-firmada.apk` **encima, sin desinstalar**.

## Qué comprobar en el teléfono (con Internet para descargar)

- Abre una sección, justifica un párrafo y centra un título, sal y vuelve a
  entrar: la alineación debe seguir igual.
- Guarda dos o tres veces seguidas: no deben aparecer marcadores ni texto
  raro en el contenido.
- En un proyecto con «Pasaje Bíblico» repetido, ábrelo: debe quedar un solo
  título.
