import { defineConfig, presetUno, presetIcons, presetAttributify } from 'unocss'
import transformerDirectives from '@unocss/transformer-directives'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      prefix: 'i-',
    }),
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      brand: {
        primary: 'var(--color-primary)',
        light: 'var(--color-primary-light)',
        dark: 'var(--color-primary-dark)',
        bg: 'var(--color-bg)',
        sidebar: 'var(--color-sidebar)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
      },
      accent: {
        cyan: 'var(--color-info)',
        emerald: 'var(--color-success)',
        amber: 'var(--color-warning)',
        rose: 'var(--color-danger)',
      },
      info: 'var(--color-info)',
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      danger: 'var(--color-danger)',
      text: 'var(--color-text)',
      'text-muted': 'var(--color-text-muted)',
    },
  },
  shortcuts: {
    'btn-primary': 'px-5 py-2 bg-brand-primary text-text rounded-lg hover:opacity-85 transition-all duration-200 font-medium',
    'card': 'bg-brand-card border border-brand-border rounded-xl p-6 transition-colors duration-200',
    'input-base': 'w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary',
  },
})
