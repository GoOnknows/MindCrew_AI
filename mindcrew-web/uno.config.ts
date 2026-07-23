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
        primary: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
        light: 'rgb(var(--color-primary-light-rgb) / <alpha-value>)',
        dark: 'rgb(var(--color-primary-dark-rgb) / <alpha-value>)',
        bg: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
        sidebar: 'rgb(var(--color-sidebar-rgb) / <alpha-value>)',
        card: 'rgb(var(--color-card-rgb) / <alpha-value>)',
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
      },
      accent: {
        cyan: 'rgb(var(--color-info-rgb) / <alpha-value>)',
        emerald: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        amber: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
        rose: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
      },
      info: 'rgb(var(--color-info-rgb) / <alpha-value>)',
      success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
      warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
      danger: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
      text: 'rgb(var(--color-text-rgb) / <alpha-value>)',
      'text-muted': 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
    },
  },
  shortcuts: {
    'btn-primary': 'px-5 py-2 bg-brand-primary text-white rounded-lg hover:opacity-85 transition-all duration-200 font-medium',
    'card': 'bg-brand-card border border-brand-border rounded-xl p-6 transition-colors duration-200',
    'input-base': 'w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-primary',
  },
})
