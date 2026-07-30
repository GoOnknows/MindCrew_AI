<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Plus, View, Cpu } from '@element-plus/icons-vue'
import { researchApi, type Task, type TaskDetail } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { formatDateTime, formatDateOnly } from '@/utils/time'
import { ElMessage } from 'element-plus'

const tasks = ref<Task[]>([])
const loading = ref(true)
const dialogVisible = ref(false)
const newTopic = ref('')
const researcherCount = ref(2)
const creating = ref(false)

const detailVisible = ref(false)
const selectedTask = ref<TaskDetail | null>(null)
const detailLoading = ref(false)

async function openDetail(id: string) {
  detailLoading.value = true
  detailVisible.value = true
  selectedTask.value = null
  try {
    const res = await researchApi.get(id)
    selectedTask.value = res
  } catch (e) {
    ElMessage.error(`加载详情失败：${getErrorMessage(e)}`)
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

const statusMap: Record<string, { label: string; type: string }> = {
  running: { label: '进行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  pending: { label: '待启动', type: 'info' },
}

async function loadTasks() {
  loading.value = true
  try {
    const res = await researchApi.list()
    tasks.value = res.list
  } catch (e) {
    ElMessage.warning(`加载调研任务失败：${getErrorMessage(e)}`)
  }
  loading.value = false
}

async function createTask() {
  if (!newTopic.value.trim()) return
  creating.value = true
  try {
    await researchApi.create({ topic: newTopic.value, researcherCount: researcherCount.value })
    dialogVisible.value = false
    newTopic.value = ''
    await loadTasks()
    // Poll for updates
    pollTasks()
  } catch (e) {
    ElMessage.error(`创建调研任务失败：${getErrorMessage(e)}`)
  } finally { creating.value = false }
}

async function deleteTask(id: string) {
  try {
    await researchApi.delete(id)
    await loadTasks()
  } catch (e) {
    ElMessage.error(`删除调研任务失败：${getErrorMessage(e)}`)
  }

}

// Poll running tasks for progress
let pollTimer: ReturnType<typeof setInterval> | null = null
function pollTasks() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    const runningTasks = tasks.value.filter(t => t.status === 'running' || t.status === 'pending')
    if (runningTasks.length === 0) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      return
    }
    await loadTasks()
  }, 3000)
}

onMounted(async () => {
  await loadTasks()
  if (tasks.value.some(t => t.status === 'running' || t.status === 'pending')) {
    pollTasks()
  }
})

/**
 * 组件卸载清理
 *
 * 考点：setInterval 内存泄漏
 *   - pollTimer 是 setInterval 的返回值，组件卸载时必须 clearInterval
 *   - 否则定时器会继续运行，每 3 秒调用 loadTasks()，更新已卸载组件的 ref
 *   - 虽然 ref 更新不会崩溃，但会产生无意义的 HTTP 请求
 *   - 更严重的是：如果 HTTP 请求的响应处理器中有 DOM 操作，会直接报错
 *
 * 考点：Element Plus el-dialog 卸载清理（同 KnowledgeView）
 */
onBeforeUnmount(() => {
  // 1. 清除轮询定时器，防止内存泄漏和无意义的 HTTP 请求
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  // 2. 关闭 Dialog，触发 Element Plus 的正常关闭流程
  dialogVisible.value = false
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center">
          <el-icon :size="14" color="var(--color-info)"><Cpu /></el-icon>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text">Agent 调研</h1>
          <p class="text-xs text-text-muted mt-0.5">Planner → Researcher → Writer → Critic 四 Agent 协同深度调研</p>
        </div>
      </div>
      <el-button type="primary" :icon="Plus" @click="dialogVisible = true">新建调研任务</el-button>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && tasks.length === 0" class="card flex flex-col items-center justify-center py-16 text-text-muted">
      <el-icon :size="32"><Plus /></el-icon>
      <p class="mt-3 text-base">暂无调研任务</p>
      <p class="text-sm mt-1">点击「新建调研任务」启动 Agent 协同调研</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center text-text-muted py-8">加载中...</div>

    <!-- Task List -->
    <div v-else class="card space-y-4">
      <div v-for="task in tasks" :key="task.id"
        class="p-4 rounded-lg bg-brand-bg border border-brand-border hover:border-brand-primary transition-colors cursor-pointer">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs text-text-muted font-mono">{{ task.id.slice(0, 8) }}</span>
              <el-tag :type="statusMap[task.status]?.type as any" size="small">{{ statusMap[task.status]?.label ?? task.status }}</el-tag>
              <span class="text-xs text-text-muted">{{ formatDateOnly(task.createdAt) }}</span>
            </div>
            <h3 class="text-text font-semibold truncate">{{ task.topic }}</h3>
          </div>
          <el-button text :icon="View" size="small" class="text-text-muted!" @click.stop="openDetail(task.id)">详情</el-button>
        </div>
        <div v-if="task.status === 'running'" class="mt-3">
          <div class="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>调研进度</span><span>{{ task.progress }}%</span>
          </div>
          <el-progress :percentage="task.progress" :stroke-width="6" :show-text="false" />
        </div>
        <div class="flex items-center gap-2 mt-3">
          <el-tag v-for="agent in task.agents" :key="agent" size="small" effect="dark" round>{{ agent }}</el-tag>
          <span class="text-xs text-text-muted ml-2">{{ task.researcherCount }} 路研究员 · {{ task.sourcesFound }} 条来源</span>
          <el-button text size="small" type="danger" class="ml-auto" @click.stop="deleteTask(task.id)">删除</el-button>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <el-dialog v-model="dialogVisible" title="新建调研任务" width="480px">
      <div class="space-y-4">
        <div>
          <label class="text-xs text-text-muted block mb-1">调研主题</label>
          <el-input v-model="newTopic" placeholder="输入调研主题..." size="large" />
        </div>
        <div>
          <label class="text-xs text-text-muted block mb-1">研究员数量</label>
          <el-input-number v-model="researcherCount" :min="1" :max="5" />
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createTask">启动调研</el-button>
      </template>
    </el-dialog>
    <!-- Task Detail Dialog -->
    <el-dialog v-model="detailVisible" title="调研详情" width="720px" top="5vh">
      <div v-if="detailLoading" class="text-center text-text-muted py-8">加载中...</div>
      <div v-else-if="selectedTask" class="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
        <div class="flex items-center gap-2">
          <el-tag :type="statusMap[selectedTask.status]?.type as any">
            {{ statusMap[selectedTask.status]?.label ?? selectedTask.status }}
          </el-tag>
          <span class="text-xs text-text-muted">{{ formatDateOnly(selectedTask.createdAt) }}</span>
          <span class="text-xs text-text-muted ml-auto">进度 {{ selectedTask.progress }}%</span>
        </div>

        <h2 class="text-lg font-bold text-text">{{ selectedTask.topic }}</h2>

        <div v-if="selectedTask.report" class="rounded-lg p-4 bg-brand-bg border border-brand-border">
          <h3 class="text-sm font-semibold text-text mb-2">调研报告</h3>
          <div class="text-sm text-text whitespace-pre-wrap leading-relaxed">{{ selectedTask.report }}</div>
        </div>

        <div v-if="selectedTask.agentLogs?.length > 0">
          <h3 class="text-sm font-semibold text-text mb-2">执行过程</h3>
          <el-timeline>
            <el-timeline-item
              v-for="log in selectedTask.agentLogs"
              :key="log.id"
              :timestamp="formatDateTime(log.createdAt)"
              placement="top"
              :color="log.action === 'output' ? 'var(--color-success)' : log.agent === 'Critic' ? 'var(--color-warning)' : 'var(--color-info)'"
            >
              <div class="text-xs text-text-muted mb-1">{{ log.agent }} · {{ log.action }}</div>
              <div class="text-sm whitespace-pre-wrap" :class="log.action === 'output' ? 'text-text' : 'text-text-muted'">{{ log.content }}</div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-dialog>
  </div>
</template>
