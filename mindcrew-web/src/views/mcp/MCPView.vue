<script setup lang="ts">
import { ref, onMounted, watch, reactive, computed } from 'vue'
import { Connection, VideoPlay, Refresh } from '@element-plus/icons-vue'
import { mcpApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { ElMessage } from 'element-plus'

interface Tool {
  name: string; desc: string; status: boolean; calls: number; avgMs: number; paramsExample: string
}
const tools = ref<Tool[]>([])
const loading = ref(true)
const testResult = ref('')
const testTool = ref('')
const testing = ref(false)

const paramFields: Record<string, { key: string; label: string; placeholder: string; type: string; default?: any; options?: { label: string; value: string }[] }[]> = {
  web_search: [
    { key: 'query', label: '搜索内容', placeholder: '输入搜索关键词', type: 'text', default: '' },
    { key: 'maxResults', label: '返回数量', placeholder: '默认 3', type: 'number', default: 3 },
  ],
  doc_search: [
    { key: 'query', label: '搜索内容', placeholder: '输入搜索关键词', type: 'text', default: '' },
    { key: 'topK', label: '返回数量', placeholder: '默认 3', type: 'number', default: 3 },
  ],
  keyword_search: [
    { key: 'keyword', label: '关键词', placeholder: '输入关键词', type: 'text', default: '' },
    { key: 'limit', label: '返回数量', placeholder: '默认 10', type: 'number', default: 10 },
  ],
  query_user: [
    { key: 'userId', label: '用户 ID', placeholder: '输入用户 ID，如 001', type: 'text', default: '' },
  ],
  send_mail: [
    { key: 'to', label: '收件人', placeholder: 'recipient@example.com', type: 'text', default: '' },
    { key: 'subject', label: '主题', placeholder: '邮件主题', type: 'text', default: '' },
    { key: 'body', label: '内容', placeholder: '邮件正文', type: 'textarea', default: '' },
  ],
  recall_memory: [
    { key: 'userId', label: '用户 ID', placeholder: '输入用户 ID', type: 'text', default: '' },
    { key: 'sessionId', label: '会话 ID（可选）', placeholder: '留空则加载所有会话', type: 'text', default: '' },
  ],
  store_memory: [
    { key: 'userId', label: '用户 ID', placeholder: '输入用户 ID', type: 'text', default: '' },
    { key: 'content', label: '信息内容', placeholder: '要存储的信息，如"我喜欢用TypeScript"', type: 'textarea', default: '' },
    {
      key: 'type', label: '信息类型', placeholder: '选择类型', type: 'select', default: 'preference',
      options: [
        { label: '偏好 (preference)', value: 'preference' },
        { label: '事实 (fact)', value: 'fact' },
        { label: '决策 (decision)', value: 'decision' },
      ],
    },
    { key: 'confidence', label: '置信度', placeholder: '默认 0.8', type: 'number', default: 0.8 },
  ],
}

const form = reactive<Record<string, any>>({})

const currentFields = computed(() => paramFields[testTool.value] ?? [])

function toolIconClass(status: boolean) {
  return status ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
}

const resultHeaderClass = computed(() =>
  testResult.value.includes('"success": false') ? 'text-danger' : 'text-success'
)

const resultHeaderText = computed(() =>
  testResult.value.includes('"success": false') ? '❌ 测试失败' : '✅ 测试成功'
)

async function loadTools() {
  loading.value = true
  try {
    tools.value = await mcpApi.tools()
    if (!testTool.value && tools.value.length > 0) {
      testTool.value = tools.value[0].name
      resetForm()
    }
  } catch (e) {
    ElMessage.warning(`加载工具列表失败：${getErrorMessage(e)}`)
  }
  loading.value = false
}

function resetForm() {
  for (const key of Object.keys(form)) {
    form[key] = undefined
  }
  for (const field of currentFields.value) {
    form[field.key] = field.type === 'number' ? (field.default ?? undefined) : (field.default ?? '')
  }
}

watch(testTool, resetForm)

async function toggleTool(name: string, enabled: boolean) {
  try {
    await mcpApi.toggle(name, enabled)
    ElMessage.success(`工具「${name}」已${enabled ? '启用' : '禁用'}`)
  } catch (e) { ElMessage.error(`操作失败：${getErrorMessage(e)}`) }
}

async function runTest() {
  for (const field of currentFields.value) {
    const val = form[field.key]
    if (field.type === 'number') {
      if (val === undefined || val === null) {
        ElMessage.warning(`请填写「${field.label}」`)
        return
      }
    } else {
      if (!val) {
        ElMessage.warning(`请填写「${field.label}」`)
        return
      }
    }
  }

  testing.value = true
  testResult.value = ''
  try {
    const params: Record<string, any> = {}
    for (const field of currentFields.value) {
      if (form[field.key] !== undefined && form[field.key] !== null && form[field.key] !== '') {
        params[field.key] = form[field.key]
      }
    }
    const res: any = await mcpApi.test(testTool.value, params)
    testResult.value = JSON.stringify(res, null, 2)
  } catch (e: any) {
    testResult.value = JSON.stringify({ success: false, error: e.message }, null, 2)
  } finally { testing.value = false }
}

onMounted(() => { loadTools(); resetForm() })
</script>

<template>
  <div class="space-y-4 max-w-4xl">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center">
          <el-icon :size="14" color="var(--color-info)"><Connection /></el-icon>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text">MCP 控制台</h1>
          <p class="text-xs text-text-muted mt-0.5">Model Context Protocol — 标准工具发现、调用与监控</p>
        </div>
      </div>
      <el-tag type="success" size="small">{{ tools.filter(t => t.status).length }} 个工具启用</el-tag>
    </div>

    <!-- Tool List -->
    <div v-if="loading" class="text-center text-text-muted py-8">加载中...</div>
    <div v-else class="space-y-2">
      <div v-for="tool in tools" :key="tool.name" class="card flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm" :class="toolIconClass(tool.status)">
            <el-icon :size="16"><Connection /></el-icon>
          </div>
          <div>
            <div class="text-sm font-semibold text-text font-mono">{{ tool.name }}</div>
            <div class="text-xs text-text-muted mt-0.5">{{ tool.desc }}</div>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right">
            <div class="text-xs text-text-muted">调用次数</div>
            <div class="text-sm text-text font-mono">{{ tool.calls }}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-text-muted">平均耗时</div>
            <div class="text-sm text-text font-mono">{{ tool.avgMs }}ms</div>
          </div>
          <el-switch :model-value="tool.status" size="small" @change="(val: boolean) => toggleTool(tool.name, val)" />
        </div>
      </div>
    </div>

    <!-- Test Console -->
    <div class="card space-y-3">
      <h3 class="text-sm font-semibold text-text flex items-center gap-2">
        <el-icon :size="16"><VideoPlay /></el-icon>
        工具测试
      </h3>

      <!-- Tool Selector -->
      <el-select v-model="testTool" class="w-full" placeholder="选择要测试的工具" popper-class="mcp-popper" placement="bottom-start" :popper-options="{ strategy: 'fixed' }">
        <el-option v-for="t in tools" :key="t.name" :label="t.name" :value="t.name">
          <span class="font-mono">{{ t.name }}</span>
          <span class="text-text-muted text-xs ml-2">{{ t.desc }}</span>
        </el-option>
      </el-select>

      <!-- Dynamic Form -->
      <div v-if="testTool" class="grid gap-3">
        <div v-for="field in currentFields" :key="field.key">
          <label class="text-xs font-medium text-text-muted block mb-1.5">{{ field.label }}</label>
          <el-input
            v-if="field.type === 'text'"
            v-model="form[field.key]"
            :placeholder="field.placeholder"
            size="large"
            class="w-full"
          />
          <el-input-number
            v-else-if="field.type === 'number'"
            v-model="form[field.key]"
            :min="0"
            :max="9999"
            :step="field.key === 'confidence' ? 0.1 : 1"
            size="large"
            class="w-full"
            controls-position="right"
          />
          <el-select
            v-else-if="field.type === 'select'"
            v-model="form[field.key]"
            :placeholder="field.placeholder"
            size="large"
            class="w-full"
            popper-class="mcp-popper"
            placement="bottom-start"
            :popper-options="{ strategy: 'fixed' }"
          >
            <el-option v-for="opt in field.options" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-input
            v-else-if="field.type === 'textarea'"
            v-model="form[field.key]"
            type="textarea"
            :rows="3"
            :placeholder="field.placeholder"
            class="w-full"
          />
        </div>
      </div>

      <div class="flex gap-2">
        <el-button type="primary" :icon="VideoPlay" :loading="testing" @click="runTest">执行测试</el-button>
        <el-button text :icon="Refresh" @click="loadTools">刷新</el-button>
      </div>
      <div v-if="testResult" class="bg-brand-bg rounded-lg overflow-hidden border border-border">
        <div class="px-3 py-2 text-xs font-semibold border-b border-border" :class="resultHeaderClass">
          {{ resultHeaderText }}
        </div>
        <div class="p-3 font-mono text-xs text-text overflow-auto max-h-80">
          <pre>{{ testResult }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>