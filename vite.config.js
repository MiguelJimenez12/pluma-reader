import { defineConfig } from 'vite'

export default defineConfig({
  // Transforma JSX sin exigir una importación explícita de React en cada componente.
  esbuild: { jsx: 'automatic' },
})
