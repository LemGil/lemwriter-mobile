# LEEME — Concordancia Strong en la RVG (español)

## Qué es

Al leer la **Reina-Valera Gómez**, las palabras con número Strong aparecen
subrayadas con puntos. Al tocar una palabra se abre su ficha: número Strong
(p. ej. H7225), la palabra en hebreo o griego, su transliteración
(pronunciación), la parte del discurso, los significados en español y la
definición. Funciona en la pantalla de lectura y en el Modo Leer («📖 Leer»).
Solo en la RVG: la RV1909 y la VBL son texto plano sin etiquetas Strong.

Si el diccionario no tiene una palabra en español (pasa con pocas), la ficha
muestra la definición en inglés como respaldo, marcada «(en inglés)».

Todo offline, sin conexión.

## Fuentes y licencias (se muestran en la app)

- Diccionario hebreo/griego en español: © Sociedades Bíblicas Unidas,
  CC BY-SA 4.0.
- Transliteración y respaldo en inglés: Open Scriptures, CC BY-SA.
- Texto RVG: CC BY-NC-ND 4.0 — © 2004, 2010, 2023 Dr. Humberto Gómez Caballero.

## Pasos (en la PC, desde ~/Descargas)

```bash
cd ~/Descargas
unzip -o lemwriter-local-strong-rvg.zip -d ~/lemwriter-fase2
cd ~/lemwriter-fase2
git add -A
git commit -m "Concordancia Strong en espanol para la RVG"
git push
```

Después: en GitHub, **Run workflow** en «Construir APK LemWriter Local»,
descargar el artefacto `LemWriter-Local-APK-<número>` **de esa corrida**,
e instalar la APK encima (sin desinstalar).

## Verificar en el teléfono

1. Biblia → RVG → abre Génesis 1: verás palabras subrayadas con puntos
   (p. ej. «principio»).
2. Toca «principio»: debe abrir la ficha **STRONG H7225** con רֵאשִׁית,
   «sustantivo f», glosas (principio, mejor…) y la definición en español.
3. Prueba en el Nuevo Testamento (p. ej. Juan 1:1, «Palabra» → G3056, λόγος).
4. Abre «📖 Leer»: las palabras también se pueden tocar ahí.

## Archivos del paquete

- `src/biblia/datos/strong/diccionario-es.json` (NUEVO, 1.3 MB): 6 415 entradas
  en español indexadas por número Strong.
- `src/biblia/datos/strong/rvg-palabras.json` (NUEVO, 5.9 MB): qué palabra de
  cada versículo lleva qué número Strong (461 236 palabras alineadas).
- `src/biblia/strongService.ts` (NUEVO): carga bajo demanda, tokenizador y búsqueda.
- `src/components/BibliaVista.tsx`: palabras tocables + ficha Strong + créditos.
- `src/lib/__tests__/strong.test.ts` (NUEVO): 8 pruebas.

Verificado: 8/8 pruebas nuevas, tsc limpio, build de la APK (capacitor) OK.
Los 30 fallos de `offlineStore.*` son preexistentes, sin cambios.
