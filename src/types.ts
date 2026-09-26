// Tipos compartidos de LemWriter Mobile.
//
// Centraliza las interfaces usadas en varios módulos para evitar
// definiciones duplicadas e imports sin resolver.

export interface Proyecto {
  id: string
  title: string
  type: string
  updated_at: string
  created_at?: string
  user_id?: string
  _isOfflineOnly?: boolean
}
