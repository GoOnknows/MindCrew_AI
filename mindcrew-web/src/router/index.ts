import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', noAuth: true },
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/home',
    children: [
      {
        path: '/home',
        name: 'Home',
        component: () => import('@/views/Home.vue'),
        meta: { title: '首页' },
      },
      {
        path: '/chat',
        name: 'Chat',
        component: () => import('@/views/chat/ChatView.vue'),
        meta: { title: '智能问答' },
      },
      {
        path: '/research',
        name: 'Research',
        component: () => import('@/views/research/ResearchView.vue'),
        meta: { title: 'Agent 调研' },
      },
      {
        path: '/knowledge',
        name: 'Knowledge',
        component: () => import('@/views/knowledge/KnowledgeView.vue'),
        meta: { title: '知识库' },
      },
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '数据大屏' },
      },
      {
        path: '/ai-config',
        name: 'AIConfig',
        component: () => import('@/views/ai-config/AIConfigView.vue'),
        meta: { title: 'AI 配置' },
      },
      {
        path: '/users',
        name: 'Users',
        component: () => import('@/views/users/UsersView.vue'),
        meta: { title: '用户管理' },
      },
      {
        path: '/mcp',
        name: 'MCP',
        component: () => import('@/views/mcp/MCPView.vue'),
        meta: { title: 'MCP 控制台' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// ─── Auth Guard ───
router.beforeEach((to) => {
  document.title = `${to.meta.title as string} - MindCrew AI`

  const token = localStorage.getItem('token')
  if (!token && !to.meta.noAuth) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  if (token && to.name === 'Login') {
    return { name: 'Home' }
  }
})

export default router
