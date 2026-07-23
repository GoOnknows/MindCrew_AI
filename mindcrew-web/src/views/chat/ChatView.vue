<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { chatApi, modelApi, type ModelConfig } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { ChatDotRound, User, Promotion, Delete, Plus, ChatLineSquare, Cloudy } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

interface Msg { id: string; role: string; content: string; timestamp: number }
const messages = ref<Msg[]>([])
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const isStreaming = ref(false)
const currentSessionId = ref<string | null>(null)
const sessions = ref<any[]>([])

// 模型选择
const models = ref<ModelConfig[]>([])
const selectedModelId = ref<string | undefined>(undefined)
const modelLoading = ref(true)

/**
 * AbortController — 用于在组件卸载时中断正在进行的 SSE 流式请求
 *
 * 考点：AbortController + fetch 中断机制
 *   - AbortController 是 Web API，用于取消异步操作（fetch、事件监听等）
 *   - controller.signal 传递给 fetch，调用 controller.abort() 时 fetch 会抛出 AbortError
 *   - 需要区分"用户主动取消"（AbortError）和"真正的网络错误"
 *   - 如果不处理组件卸载时的流式请求，会导致：
 *     1. 内存泄漏（fetch 和 reader 未释放）
 *     2. 对已卸载组件的响应式状态更新，可能触发 Vue 渲染警告
 *     3. SSE 数据持续写入 messages，导致已卸载组件的数据残留
 */
let abortController: AbortController | null = null

onBeforeUnmount(() => {
  // 组件卸载时中断正在进行的流式请求
  if (abortController) {
    abortController.abort()
    abortController = null
  }
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => messages.value.length, () => scrollToBottom())

// ─── Sessions ───
async function loadSessions() {
  try { sessions.value = await chatApi.sessions() } catch (e) {
    ElMessage.warning(`加载对话历史失败：${getErrorMessage(e)}`)
  }
}

async function selectSession(s: any) {
  currentSessionId.value = s.id
  try {
    const msgs = await chatApi.getMessages(s.id)
    messages.value = msgs.map((m: any) => ({
      id: m.id, role: m.role, content: m.content, timestamp: new Date(m.createdAt).getTime(),
    }))
  } catch (e) {
    ElMessage.warning(`加载消息记录失败：${getErrorMessage(e)}`)
  }
}

async function newChat() {
  messages.value = []
  currentSessionId.value = null
}

async function handleDeleteSession(id: string, e: Event) {
  e.stopPropagation()
  try {
    await chatApi.deleteSession(id)
    if (currentSessionId.value === id) {
      messages.value = []
      currentSessionId.value = null
    }
    await loadSessions()
  } catch (e) {
    ElMessage.error(`删除会话失败：${getErrorMessage(e)}`)
  }
}

onMounted(async () => {
  await Promise.all([
    loadSessions(),
    loadModels(),
  ])
  if (sessions.value.length > 0) {
    selectSession(sessions.value[0])
  }
  modelLoading.value = false
})

async function loadModels() {
  try {
    const list = await modelApi.list()
    models.value = list
    // 默认选中默认模型
    const defaultModel = list.find((m) => m.isDefault)
    if (defaultModel) selectedModelId.value = defaultModel.id
  } catch (e) {
    ElMessage.warning(`加载模型列表失败：${getErrorMessage(e)}`)
  }
}

// ─── Send ───
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  messages.value.push({ id: String(Date.now()), role: 'user', content: text, timestamp: Date.now() })
  inputText.value = ''
  isStreaming.value = true

  if (!currentSessionId.value) {
    try {
      const session = await chatApi.createSession()
      currentSessionId.value = (session as any).id
      await loadSessions()
    } catch (e) {
      ElMessage.error(`创建会话失败：${getErrorMessage(e)}`)
      isStreaming.value = false
      return
    }
  }

  const token = localStorage.getItem('token')
  const params = new URLSearchParams({ query: text })
  if (currentSessionId.value) params.set('sessionId', currentSessionId.value)
  if (selectedModelId.value) params.set('modelId', selectedModelId.value)

  const aiMsg: Msg = { id: 'ai-' + Date.now(), role: 'assistant', content: '', timestamp: Date.now() }
  messages.value.push(aiMsg)

  // 创建新的 AbortController，用于中断本次流式请求
  abortController = new AbortController()

  try {
    const url = `/api/chat/stream?${params.toString()}`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abortController.signal,
    })
    if (!response.ok) throw new Error('Stream request failed')
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (!reader) throw new Error('No reader')

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (data.startsWith('__SESSION__:')) {
            const sid = data.replace('__SESSION__:', '').replace('__', '')
            if (sid && !currentSessionId.value) {
              currentSessionId.value = sid
              await loadSessions()
            }
          } else if (data !== '[DONE]') {
            aiMsg.content += data
          }
        }
      }
    }
  } catch (e) {
    // 区分用户主动取消（AbortError）和真正的网络错误
    // AbortError.name === 'AbortError'，说明是组件卸载时主动中断的，不需要显示错误
    if ((e as Error).name === 'AbortError') {
      // 用户切换页面或组件卸载，静默处理
      return
    }
    aiMsg.content = aiMsg.content || `[错误] ${(e as Error).message}`
  } finally {
    abortController = null
    isStreaming.value = false
  }

  await loadSessions()
  scrollToBottom()
}

async function handleClear() {
  if (currentSessionId.value) {
    try { await chatApi.deleteSession(currentSessionId.value) } catch (e) {
      ElMessage.error(`清空对话失败：${getErrorMessage(e)}`)
    }
  }
  messages.value = []
  currentSessionId.value = null
  await loadSessions()
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
}
</script>

<template>
  <div class="flex-1 flex gap-0 min-h-0">
    <!-- ========== Session Sidebar ========== -->
    <aside class="w-56 shrink-0 border-r border-brand-border flex flex-col bg-brand-bg/50">
      <div class="px-4 py-4 border-b border-brand-border">
        <h2 class="text-sm font-semibold text-text">对话历史</h2>
      </div>
      <div class="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <div v-if="sessions.length === 0" class="text-xs text-text-muted text-center py-8">
          暂无历史对话
        </div>
        <div
          v-for="s in sessions"
          :key="s.id"
          class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group"
          :class="s.id === currentSessionId ? 'bg-brand-primary/10 text-brand-light' : 'text-text-muted hover:bg-brand-bg hover:text-text'"
          @click="selectSession(s)"
        >
          <el-icon :size="14"><ChatLineSquare /></el-icon>
          <span class="text-xs truncate flex-1">{{ s.title }}</span>
          <el-button
            text
            :icon="Delete"
            :size="'small' as any"
            class="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted! hover:text-danger!"
            @click="(e: Event) => handleDeleteSession(s.id, e)"
          />
        </div>
      </div>
      <div class="px-3 py-3 border-t border-brand-border">
        <el-button class="w-full" :icon="Plus" @click="newChat">新建对话</el-button>
      </div>
    </aside>

    <!-- ========== Chat Area ========== -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-brand-border shrink-0">
        <div class="flex items-center gap-4">
          <div>
            <h1 class="text-base font-bold text-text">智能问答</h1>
            <p class="text-xs text-text-muted mt-0.5">基于 RAG 知识增强的 AI 对话助手</p>
          </div>
          <div class="flex items-center gap-1.5 text-xs text-text-muted">
            <el-icon :size="12"><Cloudy /></el-icon>
            <el-select
              v-model="selectedModelId"
              size="small"
              :loading="modelLoading"
              placeholder="选择模型"
              class="model-selector"
            >
              <el-option
                v-for="m in models"
                :key="m.id"
                :value="m.id"
                :label="m.name"
              >
                <span>{{ m.name }}</span>
                <span v-if="m.isDefault" class="text-warning ml-1">(默认)</span>
              </el-option>
            </el-select>
          </div>
        </div>
        <el-button
          text
          :icon="Delete"
          size="small"
          class="text-text-muted! hover:text-danger!"
          :disabled="messages.length === 0"
          @click="handleClear"
        >
          清空对话
        </el-button>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-text-muted">
          <div class="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center mb-4">
            <el-icon :size="32" color="var(--color-primary)"><ChatDotRound /></el-icon>
          </div>
          <p class="text-lg font-semibold text-text">开始新的对话</p>
          <p class="text-sm mt-1">输入你的问题，AI 将基于知识库为你解答</p>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="flex gap-3" :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
          <div class="shrink-0">
            <div v-if="msg.role === 'assistant'" class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-primary to-brand-light flex items-center justify-center text-white font-bold text-xs shadow-sm">
              AI
            </div>
            <el-avatar v-else :size="36" :icon="User" class="bg-brand-bg" />
          </div>
          <div
            class="max-w-[70%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed whitespace-pre-wrap"
            :class="msg.role === 'user'
              ? 'bg-brand-primary text-white rounded-br-md'
              : 'bg-brand-card border border-brand-border text-text rounded-bl-md'"
          >
            {{ msg.content }}
            <span v-if="msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1]" class="typing-cursor" />
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="px-4 pb-4 shrink-0">
        <div class="flex items-end gap-2 bg-brand-card rounded-2xl p-3 border border-brand-border shadow-sm">
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="2"
            placeholder="输入你的问题，Enter 发送..."
            resize="none"
            class="flex-1 min-w-0 chat-input"
            @keydown="handleKeyDown"
          />
          <el-button
            type="primary"
            :icon="Promotion"
            :disabled="!inputText.trim() || isStreaming"
            :loading="isStreaming"
            @click="handleSend"
            class="shrink-0 mb-0.5"
          >
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input :deep(.el-textarea) { width: 100%; }
.chat-input :deep(.el-textarea__inner) {
  width: 100%;
  min-height: 48px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 4px 0 !important;
  resize: none;
}
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 18px;
  background: var(--color-primary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}
.model-selector {
  width: 140px;
}
@keyframes blink {
  50% { opacity: 0; }
}
</style>