<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useRouter, useRoute } from 'vue-router'
import { computed, ref, onErrorCaptured, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Fold, Expand, Moon, Sunny, User, WarningFilled,
  HomeFilled, ChatDotRound, Cpu, Collection, DataAnalysis, Setting, UserFilled, Connection,
} from '@element-plus/icons-vue'

const appStore = useAppStore()
const router = useRouter()
const route = useRoute()

const activeMenu = computed(() => route.path)
const isCollapsed = computed(() => appStore.sidebarCollapsed)
const isDark = computed(() => appStore.darkMode)

/**
 * 错误边界
 *
 * 考点：Vue 3 onErrorCaptured 钩子
 *   - 在子组件抛出错误时被调用，可以返回 false 阻止错误继续向上冒泡
 *   - 这是 Vue 3 实现 ErrorBoundary 的核心 API（React 中有 componentDidCatch，Vue 3 用这个）
 *   - 返回 false 后，错误不会触发 app.config.errorHandler（但可以用 __handled 标记让 errorHandler 知道）
 *   - 生命周期：onErrorCaptured 在子组件树中任何未捕获错误发生时触发
 *
 * 为什么在这里做：
 *   MainLayout 是所有页面的父组件，在这里捕获错误可以防止整个内容区变黑，
 *   同时保留侧边栏的正常交互能力
 */
const renderError = ref<Error | null>(null)

// 监听路由变化，切换页面时自动清除错误状态
watch(() => route.path, () => {
  renderError.value = null
})

onErrorCaptured((err, _instance, info) => {
  console.error('[MainLayout ErrorBoundary] 捕获到子组件错误:', err, '\nInfo:', info)
  renderError.value = err as Error
  // 标记错误已处理，避免全局 errorHandler 重复弹框
  ;(err as any).__handled = true
  // 返回 false 阻止错误继续向上冒泡到 app.config.errorHandler
  return false
})

function handleRetry() {
  renderError.value = null
  // 通过刷新路由视图来重新渲染当前页面
  router.replace({ path: route.path, query: { ...route.query, _t: Date.now() } })
}

function handleRefresh() {
  window.location.reload()
}

/** 退出登录：清除本地 token 并跳转到登录页 */
async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    ElMessage.success('已退出登录')
    router.replace('/login')
  } catch {
    // 用户取消操作，不做任何处理
  }
}

// First group: core business
const primaryItems = [
  { path: '/home', title: '首页', icon: HomeFilled },
  { path: '/chat', title: '智能问答', icon: ChatDotRound },
  { path: '/research', title: 'Agent 调研', icon: Cpu },
  { path: '/knowledge', title: '知识库', icon: Collection },
  { path: '/dashboard', title: '数据大屏', icon: DataAnalysis },
]

// Second group: management
const secondaryItems = [
  { path: '/ai-config', title: 'AI 配置', icon: Setting },
  { path: '/users', title: '用户管理', icon: UserFilled },
  { path: '/mcp', title: 'MCP 控制台', icon: Connection },
]
</script>

<template>
  <div class="h-screen flex flex-col bg-brand-bg">
    <!-- ===================== Header ===================== -->
    <header class="h-12 flex items-center justify-between px-3 bg-brand-sidebar border-b border-brand-border shrink-0 z-10">
      <div class="flex items-center gap-2">
        <el-button text :icon="isCollapsed ? Expand : Fold" class="text-text! text-base!" @click="appStore.toggleSidebar()" />
        <div class="w-6 h-6 bg-brand-primary rounded flex items-center justify-center text-white font-bold text-xs shrink-0">M</div>
        <span v-show="!isCollapsed" class="text-text font-semibold text-sm hidden sm:block">MindCrew AI</span>
      </div>
      <div class="flex items-center gap-2">
        <el-button text :icon="isDark ? Sunny : Moon" class="text-text! text-base!" @click="appStore.toggleDarkMode()" />
        <el-dropdown trigger="click">
          <div class="flex items-center gap-1.5 cursor-pointer">
            <el-avatar :size="26" :icon="User" />
            <span v-show="!isCollapsed" class="text-text text-xs hidden sm:inline">管理员</span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>个人信息</el-dropdown-item>
              <el-dropdown-item>系统日志</el-dropdown-item>
              <el-dropdown-item type="danger" @click="handleLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <!-- ===================== Body ===================== -->
    <div class="flex flex-1 overflow-hidden">
      <!-- ===== Sidebar ===== -->
      <aside
        class="h-full bg-brand-sidebar border-r border-brand-border transition-all duration-300 shrink-0 overflow-y-auto overflow-x-hidden flex flex-col"
        :style="{ width: isCollapsed ? '52px' : '200px' }"
      >
        <!-- Primary Nav -->
        <nav class="flex-1 px-2 py-3 space-y-1">
          <a
            v-for="item in primaryItems" :key="item.path"
            class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors no-underline"
            :class="activeMenu === item.path
              ? 'bg-brand-primary/15 text-brand-light font-medium'
              : 'text-text-muted hover:bg-brand-bg hover:text-text'"
            @click="router.push(item.path)"
          >
            <el-icon :size="16"><component :is="item.icon" /></el-icon>
            <span v-show="!isCollapsed" class="whitespace-nowrap">{{ item.title }}</span>
          </a>

          <!-- Divider -->
          <div class="mx-3 my-2 border-t border-brand-border" />

          <!-- Secondary Nav -->
          <a
            v-for="item in secondaryItems" :key="item.path"
            class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors no-underline"
            :class="activeMenu === item.path
              ? 'bg-brand-primary/15 text-brand-light font-medium'
              : 'text-text-muted hover:bg-brand-bg hover:text-text'"
            @click="router.push(item.path)"
          >
            <el-icon :size="16"><component :is="item.icon" /></el-icon>
            <span v-show="!isCollapsed" class="whitespace-nowrap">{{ item.title }}</span>
          </a>
        </nav>

        <!-- Sidebar Footer -->
        <div v-show="!isCollapsed" class="px-3 py-3 border-t border-brand-border">
          <div class="text-xs text-text-muted leading-relaxed">
            <div>MindCrew v0.1.0</div>
            <div>Node.js 20 · Vue 3.5</div>
          </div>
        </div>
      </aside>

      <!-- ===== Content ===== -->
      <main class="flex-1 overflow-auto p-4 flex flex-col">
        <!-- Error Fallback: 子组件渲染异常时显示，防止整个内容区变黑 -->
        <div v-if="renderError" class="flex-1 flex items-center justify-center">
          <div class="text-center max-w-md">
            <div class="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
              <el-icon :size="32" color="var(--color-danger)"><WarningFilled /></el-icon>
            </div>
            <h2 class="text-lg font-semibold text-text mb-2">页面渲染异常</h2>
            <p class="text-sm text-text-muted mb-4">
              当前页面组件发生错误，请尝试重试。如果问题持续，请刷新页面。
            </p>
            <details class="text-left mb-4">
              <summary class="text-xs text-text-muted cursor-pointer hover:text-text transition-colors">查看错误详情</summary>
              <pre class="mt-2 p-3 bg-brand-bg rounded-lg text-xs text-danger overflow-auto max-h-32">{{ renderError.message }}</pre>
            </details>
            <div class="flex gap-3 justify-center">
              <el-button type="primary" @click="handleRetry">重试</el-button>
              <el-button @click="handleRefresh">刷新页面</el-button>
            </div>
          </div>
        </div>

        <router-view v-else v-slot="{ Component }">
          <transition name="slide-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>
