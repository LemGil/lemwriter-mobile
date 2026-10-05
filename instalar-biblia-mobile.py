#!/usr/bin/env python3
"""
Instala en LemWriter Mobile:
  - Navegación por pestañas (Proyectos / Biblia)
  - Biblia de LECTURA offline RV1909 + VBL, con capítulos marcados como leídos y progreso
  - Biblia en el editor para insertar citas como nota tipo «biblia»

Uso: copia ESTE script y cambios-biblia-mobile.zip a la raíz del repo
lemwriter-mobile y ejecútalo:  python3 instalar-biblia-mobile.py
(o pasa la ruta del repo:       python3 instalar-biblia-mobile.py /ruta/al/repo)
"""
import json
import sys
import zipfile
from pathlib import Path

def main() -> int:
    destino = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
    zip_path = Path(__file__).resolve().parent / "cambios-biblia-mobile.zip"
    if not zip_path.exists():
        zip_path = destino / "cambios-biblia-mobile.zip"
    if not zip_path.exists():
        print("✗ No encuentro cambios-biblia-mobile.zip junto al script ni en el repo destino.")
        return 1
    pkg = destino / "package.json"
    if not pkg.exists() or "lemwriter-mobile" not in pkg.read_text(encoding="utf-8", errors="ignore"):
        print(f"✗ {destino} no parece la raíz de lemwriter-mobile (falta package.json del proyecto).")
        print("  Copia el script y el zip a la raíz del repo, o pasa la ruta: python3 instalar-biblia-mobile.py /ruta/al/repo")
        return 1
    with zipfile.ZipFile(zip_path) as z:
        nombres = z.namelist()
        z.extractall(destino)
    print(f"✓ Instalados {len(nombres)} archivos en {destino}")
    print("  - Nuevas vistas y servicios: src/components/BibliaVista.tsx, src/components/BibliaModal.tsx, src/biblia/")
    print("  - Actualizados: src/App.tsx (pestañas), src/components/Proyectos.tsx (botón Biblia), src/components/Editor.tsx (botón Biblia + insertar)")
    print()
    print("Siguiente paso (en la raíz del repo):")
    print("  npm run build")
    print("Si compila bien, publica como siempre (npm run deploy) y prueba en el teléfono:")
    print("  pestaña 📖 Biblia → Continuar leyendo → al final del capítulo «✓ Marcar como leído y continuar».")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
