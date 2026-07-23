<script setup lang="ts">
/**
 * ErrorBoundary — 可复用的错误边界组件
 *
 * 考点：Vue 3 vs React 错误边界对比
 *   - React: 使用 class 组件的 componentDidCatch + getDerivedStateFromError
 *   - Vue 3: 使用 onErrorCaptured 组合式 API 钩子
 *   - Vue 3 的 onErrorCaptured 可以捕获：
 *     1. 子组件的渲染错误
 *     2. 子组件的 setup 错误
 *     3. 子组件的侦听器错误
 *     4. 子组件的生命周期钩子错误
 *   - 但不能捕获：异步回调中的错误（如 setTimeout、Promise）、事件处理器中的错误
 *
 * 使用方式：
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 *
 * 设计思路：
 *   - 使用 slot 渲染子组件，这样错误边界组件本身不会因为子组件错误而崩溃
 *   - onErrorCaptured 返回 false 阻止错误继续传播
 *   - 提供 retry 机制（通过 key 强制重新挂载子组件）
 */
import { ref, onErrorCaptured } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'

const error = ref<Error | null>(null)
const errorInfo = ref('')
const retryKey = ref(0)

onErrorCaptured((err, _instance, info) => {
  console.error('[ErrorBoundary] 捕获到错误:', err, '\nComponent:', _instance, '\nInfo:', info)
  error.value = err as Error
  errorInfo.value = info
  ;(err as any).__handled = true
  return false // 阻止错误继续向上冒泡
})

function handleRetry() {
  error.value = null
  errorInfo.value = ''
  retryKey.value++
}

function handleRefresh() {
  window.location.reload()
}
</script>

<template>
  <div v-if="error" class="flex items-center justify-center p-8">
    <div class="text-center max-w-md">
      <div class="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-3">
        <el-icon :size="28" color="var(--color-danger)"><WarningFilled /></el-icon>
      </div>
      <h3 class="text-base font-semibold text-text mb-2">组件渲染异常</h3>
      <p class="text-sm text-text-muted mb-4">
        该组件发生了错误，请尝试重试。如果问题持续，请刷新页面。
      </p>
      <details class="text-left mb-4">
        <summary class="text-xs text-text-muted cursor-pointer hover:text-text transition-colors">查看错误详情</summary>
        <pre class="mt-2 p-3 bg-brand-bg rounded-lg text-xs text-danger overflow-auto max-h-32">{{ error.message }}</pre>
        <p v-if="errorInfo" class="text-xs text-text-muted mt-1">Error info: {{ errorInfo }}</p>
      </details>
      <div class="flex gap-3 justify-center">
        <el-button type="primary" size="small" @click="handleRetry">重试</el-button>
        <el-button size="small" @click="handleRefresh">刷新页面</el-button>
      </div>
    </div>
  </div>
  <slot v-else :key="retryKey" />
</template>