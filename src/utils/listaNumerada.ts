import { OrderedList } from '@tiptap/extension-ordered-list'

// Lista ordenada con tipo de numeración, como en LemWriter de PC:
// 1,2,3 · I,II,III · i,ii,iii · A,B,C · a,b,c
// El estilo viaja en el HTML como data-list-style sobre el <ol>,
// así el PC, el modo lectura y el PDF lo respetan igual.

export type EstiloNumeracion = 'decimal' | 'upper-roman' | 'lower-roman' | 'upper-alpha' | 'lower-alpha'

export const ESTILOS_NUMERACION: { id: EstiloNumeracion; etiqueta: string }[] = [
  { id: 'decimal', etiqueta: '1, 2, 3' },
  { id: 'upper-roman', etiqueta: 'I, II, III' },
  { id: 'lower-roman', etiqueta: 'i, ii, iii' },
  { id: 'upper-alpha', etiqueta: 'A, B, C' },
  { id: 'lower-alpha', etiqueta: 'a, b, c' },
]

export const ListaNumerada = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: 'decimal',
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute('data-list-style') as EstiloNumeracion) || 'decimal',
        renderHTML: (attributes: { listStyle?: EstiloNumeracion }) => {
          if (!attributes.listStyle || attributes.listStyle === 'decimal') {
            return {}
          }
          return { 'data-list-style': attributes.listStyle }
        },
      },
    }
  },
})

export default ListaNumerada
