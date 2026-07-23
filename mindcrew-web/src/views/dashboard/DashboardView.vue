<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { dashboardApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { DataAnalysis } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { EChartsOption } from 'echarts'

const timeRange = ref('7d')
const stats = ref({ todayQA: 0, totalDocuments: 0, totalChunks: 0, researchTasks: 0, runningResearches: 0, tokenUsed: 0 })
const trends = ref({ dates: [] as string[], qaData: [] as number[], userData: [] as number[] })
const toolUsage = ref<{ value: number; name: string }[]>([])
const hotQuestions = ref<{ name: string; count: number }[]>([])
const latency = ref({ dates: [] as string[], values: [] as number[] })

const colorList = ['#d97757', '#6a9bcc', '#788c5d', '#e89873', '#b0aea5']

async function loadData() {
  try {
    const [s, t, tu, hq, ml] = await Promise.all([
      dashboardApi.stats(),
      dashboardApi.qaTrends(timeRange.value),
      dashboardApi.toolUsage(),
      dashboardApi.hotQuestions(),
      dashboardApi.modelLatency(timeRange.value),
    ])
    stats.value = s
    trends.value = t
    toolUsage.value = tu
    hotQuestions.value = hq
    latency.value = ml
  } catch (e) {
    ElMessage.warning(`数据大屏加载失败：${getErrorMessage(e)}`)
  }
}

function onRangeChange(val: string) {
  timeRange.value = val
  loadData()
}

// Charts
const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['问答量', '用户数'], textStyle: { color: '#b0aea5' }, top: 0 },
  grid: { left: 0, right: 0, top: 32, bottom: 0, containLabel: true },
  xAxis: { type: 'category', data: trends.value.dates, axisLine: { lineStyle: { color: '#2a2a28' } }, axisLabel: { color: '#b0aea5' } },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#2a2a28' } }, axisLabel: { color: '#b0aea5' } },
  series: [
    { name: '问答量', type: 'line', smooth: true, data: trends.value.qaData, itemStyle: { color: '#d97757' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(217,119,87,0.3)' }, { offset: 1, color: 'rgba(217,119,87,0)' }] } }, symbol: 'none' },
    { name: '用户数', type: 'line', smooth: true, data: trends.value.userData, itemStyle: { color: '#6a9bcc' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(106,155,204,0.25)' }, { offset: 1, color: 'rgba(106,155,204,0)' }] } }, symbol: 'none' },
  ],
}))

const pieOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: '#b0aea5', fontSize: 12 } },
  series: [{
    type: 'pie', radius: ['55%', '78%'], center: ['38%', '50%'], avoidLabelOverlap: false,
    itemStyle: { borderColor: '#141413', borderWidth: 3 }, label: { show: false },
    data: toolUsage.value.map((t, i) => ({ ...t, itemStyle: { color: colorList[i % colorList.length] } })),
  }],
}))

const barOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 0, right: 0, top: 8, bottom: 0, containLabel: true },
  xAxis: { type: 'value', splitLine: { lineStyle: { color: '#2a2a28' } }, axisLabel: { color: '#b0aea5' } },
  yAxis: { type: 'category', data: hotQuestions.value.map(h => h.name), axisLabel: { color: '#b0aea5' }, axisLine: { lineStyle: { color: '#2a2a28' } } },
  series: [{ type: 'bar', data: hotQuestions.value.map(h => h.count), itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#d97757' }, { offset: 1, color: '#e89873' }] }, borderRadius: [0, 4, 4, 0] }, barWidth: 16 }],
}))

const latencyOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 0, right: 0, top: 8, bottom: 0, containLabel: true },
  xAxis: { type: 'category', data: latency.value.dates, axisLine: { lineStyle: { color: '#2a2a28' } }, axisLabel: { color: '#b0aea5' } },
  yAxis: { type: 'value', name: 'ms', splitLine: { lineStyle: { color: '#2a2a28' } }, axisLabel: { color: '#b0aea5' } },
  series: [{ type: 'bar', data: latency.value.values, itemStyle: { color: '#788c5d', borderRadius: [4, 4, 0, 0] }, barWidth: 20 }],
}))

onMounted(() => loadData())
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-warning/10 flex items-center justify-center">
          <el-icon :size="14" color="var(--color-warning)"><DataAnalysis /></el-icon>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text">数据大屏</h1>
          <p class="text-xs text-text-muted mt-0.5">系统运行数据可视化概览</p>
        </div>
      </div>
      <el-radio-group :model-value="timeRange" size="small" @change="onRangeChange">
        <el-radio-button value="24h">24小时</el-radio-button>
        <el-radio-button value="7d">7天</el-radio-button>
        <el-radio-button value="30d">30天</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="card"><span class="text-xs text-text-muted">今日问答</span><span class="text-2xl font-bold text-text mt-1">{{ stats.todayQA }}</span><span class="text-xs text-text-muted mt-1">实时</span></div>
      <div class="card"><span class="text-xs text-text-muted">知识库文档</span><span class="text-2xl font-bold text-text mt-1">{{ stats.totalDocuments }}</span><span class="text-xs text-text-muted mt-1">{{ stats.totalChunks }} 索引片段</span></div>
      <div class="card"><span class="text-xs text-text-muted">调研任务</span><span class="text-2xl font-bold text-text mt-1">{{ stats.researchTasks }}</span><span class="text-xs text-warning mt-1">{{ stats.runningResearches }} 个进行中</span></div>
      <div class="card"><span class="text-xs text-text-muted">Token 消耗</span><span class="text-2xl font-bold text-text mt-1">{{ (stats.tokenUsed / 1000).toFixed(1) }}K</span><span class="text-xs text-text-muted mt-1">今日</span></div>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="card"><h3 class="text-sm font-semibold text-text mb-3">问答趋势</h3><v-chart :option="trendOption" autoresize class="h-56" /></div>
      <div class="card"><h3 class="text-sm font-semibold text-text mb-3">工具调用占比</h3><v-chart :option="pieOption" autoresize class="h-56" /></div>
      <div class="card"><h3 class="text-sm font-semibold text-text mb-3">热门问题排行</h3><v-chart :option="barOption" autoresize class="h-56" /></div>
      <div class="card"><h3 class="text-sm font-semibold text-text mb-3">模型调用耗时 (ms)</h3><v-chart :option="latencyOption" autoresize class="h-56" /></div>
    </div>
  </div>
</template>
