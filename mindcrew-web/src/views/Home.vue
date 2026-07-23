<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Cpu, Collection, DataAnalysis, Setting, UserFilled, Connection } from '@element-plus/icons-vue'
import { dashboardApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { ElMessage } from 'element-plus'
import type { EChartsOption } from 'echarts'

const router = useRouter()
const loading = ref(true)
const stats = ref({ todayQA: 0, qaChange: 0, totalDocuments: 0, totalChunks: 0, researchTasks: 0, runningResearches: 0, tokenUsed: 0 })
const activities = ref<{ icon: string; text: string; time: string }[]>([])

const features = [
  { title: '智能问答', desc: 'RAG 知识增强 AI 对话，流式输出、多轮记忆', icon: ChatDotRound, path: '/chat', color: '#d97757' },
  { title: 'Agent 调研', desc: '四 Agent 协同，深度调研生成报告', icon: Cpu, path: '/research', color: '#6a9bcc' },
  { title: '知识库', desc: '多格式文档上传、智能分块、混合召回', icon: Collection, path: '/knowledge', color: '#788c5d' },
  { title: '数据大屏', desc: '问答趋势、工具调用、协作图可视化', icon: DataAnalysis, path: '/dashboard', color: '#e89873' },
  { title: 'AI 配置', desc: '大模型、RAG 策略、Embedding 参数调优', icon: Setting, path: '/ai-config', color: '#b0aea5' },
  { title: '用户管理', desc: '角色权限、数据隔离、ACL 访问控制', icon: UserFilled, path: '/users', color: '#c46a4f' },
  { title: 'MCP 控制台', desc: 'Model Context Protocol 工具管理与调试', icon: Connection, path: '/mcp', color: '#6a9bcc' },
]

const sparkOption = (color: string, data: number[]): EChartsOption => ({
  grid: { left: 0, right: 0, top: 2, bottom: 0 },
  xAxis: { type: 'category', show: false, data: ['','','','','','',''] },
  yAxis: { type: 'value', show: false, min: (v: { min: number }) => v.min - 1 },
  series: [{
    type: 'line', data, smooth: true,
    lineStyle: { color, width: 2 },
    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '05' }] } },
    symbol: 'none',
  }],
})

onMounted(async () => {
  try {
    const [s, a] = await Promise.all([dashboardApi.stats(), dashboardApi.activities()])
    stats.value = s
    activities.value = a
  } catch (e) {
    ElMessage.warning(`首页数据加载失败：${getErrorMessage(e)}`)
  }
  loading.value = false
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-7 h-7 rounded-lg bg-brand-primary/10 flex items-center justify-center">
        <el-icon :size="14" color="var(--color-primary)"><HomeFilled /></el-icon>
      </div>
      <div>
        <h1 class="text-xl font-bold text-text">欢迎使用 MindCrew AI</h1>
        <p class="text-xs text-text-muted mt-1">企业级 Agent 知识库系统 — RAG 检索增强 · 多 Agent 协同 · 知识库管理 · 数据分析</p>
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="card flex items-center justify-between">
        <div>
          <div class="text-xs text-text-muted">今日问答</div>
          <div class="text-xl font-bold text-text mt-0.5">{{ stats.todayQA }}</div>
          <div class="text-xs" :class="stats.qaChange >= 0 ? 'text-success' : 'text-danger'">↑ {{ stats.qaChange }}%</div>
        </div>
        <v-chart :option="sparkOption('#d97757', [3,5,4,7,6,8,7])" class="w-20 h-10" autoresize />
      </div>
      <div class="card flex items-center justify-between">
        <div>
          <div class="text-xs text-text-muted">知识库文档</div>
          <div class="text-xl font-bold text-text mt-0.5">{{ stats.totalDocuments }}</div>
          <div class="text-xs text-text-muted mt-0.5">{{ stats.totalChunks }} 片段</div>
        </div>
        <v-chart :option="sparkOption('#6a9bcc', [2,3,5,4,6,5,7])" class="w-20 h-10" autoresize />
      </div>
      <div class="card flex items-center justify-between">
        <div>
          <div class="text-xs text-text-muted">调研任务</div>
          <div class="text-xl font-bold text-text mt-0.5">{{ stats.researchTasks }}</div>
          <div class="text-xs text-warning mt-0.5">{{ stats.runningResearches }} 进行中</div>
        </div>
        <v-chart :option="sparkOption('#e89873', [4,3,5,4,6,5,6])" class="w-20 h-10" autoresize />
      </div>
      <div class="card flex items-center justify-between">
        <div>
          <div class="text-xs text-text-muted">Token 消耗</div>
          <div class="text-xl font-bold text-text mt-0.5">{{ (stats.tokenUsed / 1000).toFixed(1) }}K</div>
          <div class="text-xs text-text-muted mt-0.5">今日</div>
        </div>
        <v-chart :option="sparkOption('#788c5d', [2,4,3,5,4,6,5])" class="w-20 h-10" autoresize />
      </div>
    </div>

    <!-- Feature Nav -->
    <div>
      <h2 class="text-sm font-semibold text-text mb-3">功能导航</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <button v-for="feat in features" :key="feat.path" class="card text-left cursor-pointer hover:border-brand-primary transition-all duration-200 group" @click="router.push(feat.path)">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center mb-2" :style="{ backgroundColor: feat.color + '20', color: feat.color }">
            <el-icon :size="18"><component :is="feat.icon" /></el-icon>
          </div>
          <h3 class="text-sm font-semibold text-text group-hover:text-brand-light transition-colors">{{ feat.title }}</h3>
          <p class="text-xs text-text-muted mt-1 leading-relaxed">{{ feat.desc }}</p>
        </button>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="card">
      <h3 class="text-sm font-semibold text-text mb-3">最近活动</h3>
      <div v-if="loading" class="text-center text-text-muted py-4 text-sm">加载中...</div>
      <div v-else-if="activities.length === 0" class="text-center text-text-muted py-4 text-sm">暂无活动</div>
      <div v-else class="space-y-3">
        <div v-for="(item, i) in activities" :key="i" class="flex items-center gap-3 text-sm">
          <span class="text-base">{{ item.icon }}</span>
          <span class="text-text flex-1">{{ item.text }}</span>
          <span class="text-xs text-text-muted shrink-0">{{ item.time }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
