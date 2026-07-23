<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value.trim() || !password.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const res = await authApi.login({ username: username.value, password: password.value })
    localStorage.setItem('token', res.token)
    localStorage.setItem('user', JSON.stringify(res.user))
    router.replace('/home')
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleLogin()
}
</script>

<template>
  <div class="h-screen flex items-center justify-center bg-brand-bg">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="w-12 h-12 bg-brand-primary rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
          M
        </div>
        <h1 class="text-xl font-bold text-text">MindCrew AI</h1>
        <p class="text-xs text-text-muted mt-1">企业级 Agent 知识库系统</p>
      </div>

      <!-- Form -->
      <div class="bg-brand-card border border-brand-border rounded-xl p-6 space-y-4">
        <div>
          <label class="text-xs text-text-muted block mb-1.5">用户名</label>
          <el-input
            v-model="username"
            placeholder="请输入用户名"
            :prefix-icon="null"
            size="large"
            @keydown="handleKeyDown"
          />
        </div>
        <div>
          <label class="text-xs text-text-muted block mb-1.5">密码</label>
          <el-input
            v-model="password"
            type="password"
            placeholder="请输入密码"
            show-password
            size="large"
            @keydown="handleKeyDown"
          />
        </div>

        <div v-if="error" class="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <el-button
          type="primary"
          size="large"
          class="w-full"
          :loading="loading"
          :disabled="!username.trim() || !password.trim()"
          @click="handleLogin"
        >
          {{ loading ? '登录中...' : '登 录' }}
        </el-button>
      </div>

      <p class="text-xs text-text-muted text-center mt-4">
        默认管理员账号：admin / admin123
      </p>
    </div>
  </div>
</template>
