<script setup lang="ts">
import { ref, h, onMounted, onBeforeUnmount } from 'vue'
import { UploadFilled, Search, Delete, View, Collection, Refresh } from '@element-plus/icons-vue'
import { knowledgeApi } from '@/api'
import { getErrorMessage, isUserCancel } from '@/utils/error'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { UploadRawFile } from 'element-plus'

interface Document {
  id: string; name: string; size: string; type: string; status: string
  chunkCount: number; createdAt: string
}
interface PreviewData {
  name: string; type: string; status: string; chunkCount: number
  preview: string; chunks: { index: number; content: string }[]
}
const documents = ref<Document[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const uploading = ref(false)
const recovering = ref(false)
const previewDialogVisible = ref(false)
const previewData = ref<PreviewData | null>(null)
const previewLoading = ref(false)

/**
 * 控制 el-dialog 是否挂载到组件树中
 *
 * 考点：Vue 条件渲染 vs 始终挂载的区别
 *   - v-if="false"：组件完全不创建，无 watcher、无 computed、无 onScopeDispose
 *   - 始终挂载 + v-model="false"：组件创建但隐藏，所有副作用（useLockscreen、
 *     useDialog 的 watcher、transition 钩子）都已注册
 *
 * 为什么这很重要：
 *   el-dialog 内部使用 useLockscreen 注册了 onScopeDispose 清理，
 *   当 KnowledgeView 在 <transition mode="out-in"> 中卸载时，
 *   这些副作用的清理可能干扰 Vue transition 的 leave 流程，
 *   导致新页面无法正常挂载 → 表现为"黑屏"
 */
const dialogMounted = ref(false)

const statusMap: Record<string, { label: string; type: string }> = {
  indexed: { label: '已索引', type: 'success' },
  processing: { label: '处理中', type: 'warning' },
  uploaded: { label: '已上传', type: 'info' },
  failed: { label: '失败', type: 'danger' },
}
const typeIcons: Record<string, string> = { pdf: 'PDF', md: 'MD', docx: 'W', txt: 'T' }

/**
 * 组件卸载保护标记
 *
 * 考点：Vue 异步操作与组件生命周期
 *   - onMounted 中发起的异步请求（如 loadDocuments）可能在组件卸载后才 resolve
 *   - Promise resolve 后修改 ref 值会触发 Vue 响应式更新，此时组件已卸载
 *   - Vue 3 不会崩溃，但会在开发环境给出警告，且无效更新浪费性能
 *   - 解决方案：在 onBeforeUnmount 中设置标记，异步回调中检查标记
 */
const isMounted = ref(false)

onMounted(() => {
  isMounted.value = true
  loadDocuments()
})

async function loadDocuments() {
  loading.value = true
  try {
    const res = await knowledgeApi.list({ search: searchKeyword.value || undefined })
    if (!isMounted.value) return
    documents.value = res.list
  } catch (e) {
    if (!isMounted.value) return
    ElMessage.warning(`加载文档列表失败：${getErrorMessage(e)}`)
  } finally {
    if (isMounted.value) loading.value = false
  }
}

async function handleUpload(file: UploadRawFile) {
  uploading.value = true
  try {
    await knowledgeApi.upload(file)
    await loadDocuments()
  } catch (e) {
    ElMessage.error(`上传文档失败：${getErrorMessage(e)}`)
  } finally { uploading.value = false }
}

async function handleRecover() {
  recovering.value = true
  try {
    const res = await knowledgeApi.recover()
    if (res.count === 0 && res.total === 0) {
      ElMessage.info('没有残留文件需要恢复')
      return
    }
    // 显示详细结果
    const failed = res.results.filter(r => r.status === 'failed')
    const details = res.results.map(r => {
      const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌'
      return `${icon} ${r.file}${r.error ? ' — ' + r.error : ''}`
    }).join('\n')
    await ElMessageBox({
      title: '数据恢复完成',
      message: h('div', { style: 'white-space: pre-wrap; font-size: 13px; line-height: 1.8' }, details),
      type: failed.length > 0 ? 'warning' : 'success',
      confirmButtonText: '知道了',
    })
    await loadDocuments()
  } catch (e) {
    if (isUserCancel(e)) return
    ElMessage.error(`数据恢复失败：${getErrorMessage(e)}`)
  } finally {
    recovering.value = false
  }
}

async function handleDelete(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确认删除「${name}」？`, '删除确认', { type: 'warning' })
    await knowledgeApi.delete(id)
    ElMessage.success(`「${name}」已删除`)
    await loadDocuments()
  } catch (e: any) {
    if (isUserCancel(e)) return
    ElMessage.error(`删除文档失败：${getErrorMessage(e)}`)
  }

}

async function handlePreview(id: string) {
  previewLoading.value = true
  dialogMounted.value = true   // 首次打开预览时才挂载 Dialog 组件
  previewDialogVisible.value = true
  try {
    const res = await knowledgeApi.preview(id)
    previewData.value = (res as any) as PreviewData
  } catch (e) {
    ElMessage.error(`查看文档失败：${getErrorMessage(e)}`)
    previewDialogVisible.value = false
  }
  previewLoading.value = false
}

/**
 * 组件卸载清理
 *
 * 考点：Element Plus 组件卸载时的"脏状态"清理
 *
 * 为什么需要手动清理：
 *   1. el-dialog 使用 Teleport 渲染到 <body>，卸载时 Element Plus 的
 *      useLockscreen 可能未正确恢复 body 的 overflow 样式
 *   2. el-dialog 的 destroy-on-close 只在"关闭"时触发，组件直接卸载时不会走关闭流程
 *   3. el-upload 内部维护了隐藏的 <input type="file"> 和上传实例，
 *      如果卸载时上传未完成，可能导致内部状态残留
 *   4. ElMessageBox 打开时组件卸载，确认框的 Promise 可能永远不 resolve
 *
 * 表现为：离开知识库页面后，其他页面渲染失败（黑屏/错误边界捕获）
 */
onBeforeUnmount(() => {
  // 0. 标记组件已卸载，阻止异步回调修改状态
  isMounted.value = false

  // 1. 强制关闭 Dialog，触发 Element Plus 的正常关闭清理流程
  previewDialogVisible.value = false
  previewData.value = null
  dialogMounted.value = false

  // 2. 重置上传/恢复状态，防止卸载后异步操作修改响应式状态
  uploading.value = false
  recovering.value = false
})
</script>

<template>
  <div>
      <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center">
            <el-icon :size="14" color="var(--color-success)"><Collection /></el-icon>
          </div>
          <h1 class="text-xl font-bold text-text">知识库管理</h1>
        </div>
        <div class="flex items-center gap-2">
          <el-upload :auto-upload="true" :show-file-list="false" accept=".pdf,.docx,.md,.txt,.epub" :http-request="({ file }: { file: UploadRawFile }) => handleUpload(file)">
            <el-button type="primary" :icon="UploadFilled" :loading="uploading">上传文档</el-button>
          </el-upload>
          <el-button :icon="Refresh" :loading="recovering" @click="handleRecover">恢复数据</el-button>
        </div>
      </div>

      <!-- Search Bar -->
      <div class="flex items-center gap-3">
        <el-input v-model="searchKeyword" placeholder="搜索文档名称..." :prefix-icon="Search" class="max-w-xs" size="default" clearable @change="loadDocuments" />
        <span class="text-xs text-text-muted">支持 PDF、Word、Markdown、TXT、EPUB 格式</span>
        <span class="text-xs text-text-muted ml-auto">共 {{ documents.length }} 篇文档</span>
      </div>

      <!-- Document List -->
      <div class="card">
        <div v-if="loading" class="text-center text-text-muted py-8">加载中...</div>
        <el-table v-else :data="documents" style="width: 100%" row-class-name="bg-transparent!">
          <el-table-column label="文档名称" min-width="250">
            <template #default="{ row }">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded bg-brand-primary/20 flex items-center justify-center text-xs font-bold text-brand-light">{{ typeIcons[row.type] ?? '?' }}</div>
                <div>
                  <div class="text-text text-sm">{{ row.name }}</div>
                  <div class="text-xs text-text-muted">{{ row.size }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusMap[row.status]?.type as any" size="small">{{ statusMap[row.status]?.label ?? row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="分块数" width="80">
            <template #default="{ row }"><span class="text-text-muted text-sm">{{ row.chunkCount }}</span></template>
          </el-table-column>
          <el-table-column label="上传时间" width="120">
            <template #default="{ row }"><span class="text-text-muted text-sm">{{ row.createdAt?.slice(0, 10) }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button text :icon="View" size="small" class="text-text-muted!" @click="handlePreview(row.id)" />
              <el-button text :icon="Delete" size="small" class="text-danger!" @click="handleDelete(row.id, row.name)" />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- Preview Dialog — 仅在首次打开预览时才挂载，避免未使用的 Dialog 副作用干扰路由过渡 -->
    <el-dialog v-if="dialogMounted" v-model="previewDialogVisible" :title="previewData?.name ?? '文档预览'" width="700px" top="5vh" destroy-on-close>
      <div v-if="previewLoading" class="text-center py-8 text-text-muted">加载中...</div>
      <div v-else-if="previewData" class="space-y-4">
        <div class="flex gap-4 text-sm text-text-muted">
          <span>类型：{{ previewData.type?.toUpperCase() }}</span>
          <span>状态：{{ statusMap[previewData.status]?.label ?? previewData.status }}</span>
          <span>分块数：{{ previewData.chunkCount }}</span>
        </div>
        <el-divider />
        <div class="text-sm text-text leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto bg-bg-secondary p-4 rounded-lg">
          {{ previewData.preview || '暂无内容预览' }}
        </div>
        <div v-if="previewData.chunks?.length" class="space-y-2">
          <div class="text-sm font-bold text-text">分块列表</div>
          <div v-for="chunk in previewData.chunks" :key="chunk.index" class="text-xs text-text-muted bg-bg-secondary p-2 rounded">
            <span class="font-bold text-brand-primary">#{{ chunk.index }}</span> {{ chunk.content }}
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>
