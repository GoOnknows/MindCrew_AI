<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { modelApi, configApi, type ModelConfig } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, Cloudy, Plus, Delete, Edit, StarFilled, DataAnalysis } from '@element-plus/icons-vue'

const models = ref<ModelConfig[]>([])
const loading = ref(true)
const showDialog = ref(false)
const editingModel = ref<Partial<ModelConfig> & { id?: string }>({})
const isEditing = ref(false)
const saving = ref(false)

// RAG config
const ragConfig = ref({ topK: 5, chunkSize: 500, chunkOverlap: 50, embeddingModel: 'text-embedding-v4', rerankThreshold: 0.35, rrfConstant: 60 })
const ragLoading = ref(true)
const ragSaving = ref(false)

const defaultForm = {
  name: '',
  modelName: '',
  baseUrl: '',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
}

onMounted(async () => {
  await Promise.all([loadModels(), loadRagConfig()])
  loading.value = false
  ragLoading.value = false
})

async function loadModels() {
  try {
    models.value = await modelApi.list()
  } catch (e) {
    ElMessage.warning(`加载模型列表失败：${getErrorMessage(e)}`)
  }
}

async function loadRagConfig() {
  try {
    const config = await configApi.get()
    if (config.rag) ragConfig.value = { ...ragConfig.value, ...config.rag }
  } catch (e) {
    ElMessage.warning(`加载 RAG 配置失败：${getErrorMessage(e)}`)
  }
}

function openAddDialog() {
  isEditing.value = false
  editingModel.value = { ...defaultForm }
  showDialog.value = true
}

function openEditDialog(model: ModelConfig) {
  isEditing.value = true
  editingModel.value = { ...model }
  showDialog.value = true
}

async function handleSaveModel() {
  const form = editingModel.value
  if (!form.name || !form.modelName || !form.baseUrl || !form.apiKey) {
    ElMessage.warning('请填写所有必填字段')
    return
  }
  saving.value = true
  try {
    if (isEditing.value && form.id) {
      const updated = await modelApi.update(form.id, {
        name: form.name,
        modelName: form.modelName,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
      })
      const idx = models.value.findIndex((m) => m.id === form.id)
      if (idx !== -1) models.value[idx] = updated
      ElMessage.success('模型已更新')
    } else {
      const created = await modelApi.create({
        name: form.name,
        modelName: form.modelName,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
      })
      models.value.push(created)
      ElMessage.success('模型已添加')
    }
    showDialog.value = false
  } catch (e) {
    ElMessage.error(`保存失败：${getErrorMessage(e)}`)
  } finally {
    saving.value = false
  }
}

async function handleDeleteModel(model: ModelConfig) {
  try {
    await ElMessageBox.confirm(
      `确定要删除模型"${model.name}"吗？此操作不可撤销。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await modelApi.delete(model.id)
    models.value = models.value.filter((m) => m.id !== model.id)
    ElMessage.success('模型已删除')
  } catch (e) {
    if (!getErrorMessage(e).includes('cancel')) {
      ElMessage.error(`删除失败：${getErrorMessage(e)}`)
    }
  }
}

async function handleSetDefault(model: ModelConfig) {
  try {
    await modelApi.update(model.id, { isDefault: true })
    models.value = models.value.map((m) => ({
      ...m,
      isDefault: m.id === model.id,
    }))
    ElMessage.success(`已设置"${model.name}"为默认模型`)
  } catch (e) {
    ElMessage.error(`设置默认模型失败：${getErrorMessage(e)}`)
  }
}

async function handleSaveRag() {
  ragSaving.value = true
  try {
    await configApi.update({
      ragTopK: ragConfig.value.topK,
      ragChunkSize: ragConfig.value.chunkSize,
      ragChunkOverlap: ragConfig.value.chunkOverlap,
      ragEmbeddingModel: ragConfig.value.embeddingModel,
      ragRerankThreshold: ragConfig.value.rerankThreshold,
      ragRrfConstant: ragConfig.value.rrfConstant,
    })
    ElMessage.success('RAG 配置已保存并生效')
  } catch (e) {
    ElMessage.error(`保存失败：${getErrorMessage(e)}`)
  } finally {
    ragSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-5 max-w-4xl">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-brand-primary/10 flex items-center justify-center">
          <el-icon :size="14" color="var(--color-primary)"><Setting /></el-icon>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text">AI 配置</h1>
          <p class="text-xs text-text-muted mt-0.5">管理 AI 模型与 RAG 检索参数</p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-text-muted text-sm py-4">加载配置中...</div>

    <template v-else>
      <!-- ===== 模型列表 ===== -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-info/10 flex items-center justify-center">
              <el-icon :size="14" color="var(--color-info)"><Cloudy /></el-icon>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-text">模型管理</h3>
              <p class="text-xs text-text-muted">添加和管理 AI 模型，支持 OpenAI 兼容接口</p>
            </div>
          </div>
          <el-button type="primary" :icon="Plus" @click="openAddDialog">添加模型</el-button>
        </div>

        <!-- Model Cards -->
        <div class="space-y-3">
          <div
            v-for="model in models"
            :key="model.id"
            class="flex items-start gap-4 p-4 rounded-xl border border-brand-border bg-brand-bg/30 hover:border-brand-primary/40 transition-colors"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-semibold text-text truncate">{{ model.name }}</span>
                <el-tag v-if="model.isDefault" size="small" type="warning" effect="dark" class="shrink-0">
                  <el-icon :size="10" class="mr-0.5"><StarFilled /></el-icon>默认
                </el-tag>
              </div>
              <div class="space-y-1.5 text-xs">
                <div class="flex items-center gap-6 flex-wrap">
                  <div>
                    <span class="text-text-muted">模型：</span>
                    <span class="text-text font-mono">{{ model.modelName }}</span>
                  </div>
                  <div>
                    <span class="text-text-muted">温度：</span>
                    <span class="text-text">{{ model.temperature }}</span>
                  </div>
                  <div>
                    <span class="text-text-muted">最大 Token：</span>
                    <span class="text-text">{{ model.maxTokens }}</span>
                  </div>
                </div>
                <div class="truncate">
                  <span class="text-text-muted">接口地址：</span>
                  <span class="text-text font-mono text-[11px]">{{ model.baseUrl }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <el-button
                v-if="!model.isDefault"
                text
                size="small"
                @click="handleSetDefault(model)"
                class="text-text-muted! hover:text-warning!"
              >
                设为默认
              </el-button>
              <el-button
                text
                :icon="Edit"
                size="small"
                @click="openEditDialog(model)"
                class="text-text-muted! hover:text-brand-primary!"
              />
              <el-button
                v-if="!model.isDefault"
                text
                :icon="Delete"
                size="small"
                @click="handleDeleteModel(model)"
                class="text-text-muted! hover:text-danger!"
              />
            </div>
          </div>

          <div v-if="models.length === 0" class="text-center py-8 text-text-muted text-sm">
            暂无模型配置，点击"添加模型"开始
          </div>
        </div>
      </div>

      <!-- ===== RAG ===== -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
              <el-icon :size="14" color="var(--color-success)"><DataAnalysis /></el-icon>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-text">RAG 检索参数</h3>
              <p class="text-xs text-text-muted">知识库检索增强的召回策略与排序参数</p>
            </div>
          </div>
          <el-button type="primary" :loading="ragSaving" @click="handleSaveRag" class="px-6" size="small">
            保存
          </el-button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="form-field">
            <label class="text-xs font-medium text-text-muted block mb-1.5">Top-K</label>
            <el-input-number v-model="ragConfig.topK" :min="1" :max="20" class="w-full" />
          </div>
          <div class="form-field">
            <label class="text-xs font-medium text-text-muted block mb-1.5">分块大小</label>
            <el-input-number v-model="ragConfig.chunkSize" :min="100" :max="2000" :step="50" class="w-full" />
          </div>
          <div class="form-field">
            <label class="text-xs font-medium text-text-muted block mb-1.5">重叠量</label>
            <el-input-number v-model="ragConfig.chunkOverlap" :min="0" :max="500" :step="10" class="w-full" />
          </div>
          <div class="form-field">
            <label class="text-xs font-medium text-text-muted block mb-1.5">Embedding 模型</label>
            <el-select v-model="ragConfig.embeddingModel" class="w-full">
              <el-option label="text-embedding-v4" value="text-embedding-v4" />
              <el-option label="text-embedding-v3" value="text-embedding-v3" />
            </el-select>
          </div>
          <div class="form-field">
            <label class="text-xs font-medium text-text-muted block mb-1.5">精排阈值</label>
            <el-input-number v-model="ragConfig.rerankThreshold" :min="0" :max="1" :step="0.05" :precision="2" class="w-full" />
          </div>
          <div class="form-field">
            <label class="text-xs font-medium text-text-muted block mb-1.5">RRF 常数</label>
            <el-input-number v-model="ragConfig.rrfConstant" :min="1" :max="120" class="w-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- ===== Add/Edit Dialog ===== -->
    <el-dialog
      v-model="showDialog"
      :title="isEditing ? '编辑模型' : '添加模型'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" class="model-form">
        <el-form-item label="显示名称" required>
          <el-input v-model="editingModel.name" placeholder="如：通义千问、DeepSeek" />
        </el-form-item>
        <el-form-item label="模型名称" required>
          <el-input v-model="editingModel.modelName" placeholder="如：qwen-turbo、deepseek-chat" />
        </el-form-item>
        <el-form-item label="API 接口地址" required>
          <el-input v-model="editingModel.baseUrl" placeholder="如：https://dashscope.aliyuncs.com/compatible-mode/v1" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="editingModel.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <div class="grid grid-cols-2 gap-4">
          <el-form-item label="温度 (Temperature)">
            <el-input-number v-model="editingModel.temperature" :min="0" :max="2" :step="0.1" :precision="1" class="w-full" />
          </el-form-item>
          <el-form-item label="最大 Token">
            <el-input-number v-model="editingModel.maxTokens" :min="256" :max="32768" :step="256" class="w-full" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveModel">
          {{ isEditing ? '保存' : '添加' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-field :deep(.el-input-number),
.form-field :deep(.el-select) {
  width: 100%;
}
.form-field :deep(.el-input-number .el-input__wrapper),
.form-field :deep(.el-select__wrapper) {
  min-height: 32px;
}
.model-form :deep(.el-form-item) {
  margin-bottom: 16px;
}
.model-form :deep(.el-form-item__label) {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  padding-bottom: 4px;
}
</style>