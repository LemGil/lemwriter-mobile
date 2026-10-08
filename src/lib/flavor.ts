// src/lib/flavor.ts
//
// Interruptor del sabor «LemWriter Local».
//
// vite.config.js inyecta import.meta.env.VITE_LOCAL = '1' solo cuando la
// compilación se hace con BUILD_LOCAL=1 (el flujo de GitHub Actions que
// construye la APK «LemWriter Local»). En la app de siempre — web, PWA y
// la APK actual — vale '' y todo se comporta exactamente como hasta ahora:
// la capa de datos es la de la nube (offlineStore) y hay puerta de ingreso.

export const ES_LOCAL: boolean = import.meta.env.VITE_LOCAL === '1'
