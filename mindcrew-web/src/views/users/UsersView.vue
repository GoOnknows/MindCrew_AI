<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Search, Plus, UserFilled, Edit, Delete, Lock } from '@element-plus/icons-vue'
import { usersApi } from '@/api'
import { getErrorMessage, isUserCancel } from '@/utils/error'
import { ElMessageBox, ElMessage } from 'element-plus'

interface User {
  id: string; username: string; email: string; role: string; dept: string; status: string
}
const users = ref<User[]>([])
const loading = ref(true)
const searchKey = ref('')
const activeRole = ref('全部')
const rolesList = ref<{ name: string; key: string; permissions: string }[]>([])
const roles = ['全部', '管理员', '管理者', '编辑者', '查看者', '拥有者']
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref({ id: '', username: '', email: '', password: '', role: 'viewer', dept: '技术部', status: 'active' })
const saving = ref(false)

const statusMap: Record<string, { label: string; type: string }> = {
  active: { label: '启用', type: 'success' },
  inactive: { label: '禁用', type: 'info' },
}

const roleColorMap: Record<string, string> = {
  admin: 'var(--color-primary)',
  manager: 'var(--color-info)',
  editor: 'var(--color-warning)',
  viewer: 'var(--color-text-muted)',
  owner: 'var(--color-danger)',
}

async function loadUsers() {
  loading.value = true
  try {
    const role = activeRole.value === '全部' ? undefined : activeRole.value
    const res = await usersApi.list({ search: searchKey.value || undefined, role })
    users.value = res.list
    if (rolesList.value.length === 0) {
      rolesList.value = await usersApi.roles()
    }
  } catch (e) {
    ElMessage.warning(`加载用户列表失败：${getErrorMessage(e)}`)
  }
  loading.value = false
}

function openCreate() {
  isEdit.value = false
  form.value = { id: '', username: '', email: '', password: '', role: 'viewer', dept: '技术部', status: 'active' }
  dialogVisible.value = true
}

function openEdit(user: User) {
  isEdit.value = true
  form.value = { id: user.id, username: user.username, email: user.email, password: '', role: user.role, dept: user.dept, status: user.status }
  dialogVisible.value = true
}

async function handleSave() {
  saving.value = true
  try {
    if (isEdit.value) {
      await usersApi.update(form.value.id, { username: form.value.username, email: form.value.email, role: form.value.role, dept: form.value.dept, status: form.value.status })
      ElMessage.success('用户已更新')
    } else {
      await usersApi.create(form.value)
      ElMessage.success('用户已创建')
    }
    dialogVisible.value = false
    await loadUsers()
  } catch (e) { ElMessage.error(`操作失败：${getErrorMessage(e)}`) }
  finally { saving.value = false }
}

async function handleDelete(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确认删除用户「${name}」？`, '删除确认', { type: 'warning' })
    await usersApi.delete(id)
    await loadUsers()
    ElMessage.success('用户已删除')
  } catch (e: any) {
    if (isUserCancel(e)) return
    ElMessage.error(`删除用户失败：${getErrorMessage(e)}`)
  }
}

async function handleTogglePermission(user: User) {
  const newRole = user.role === 'admin' ? 'viewer' : 'admin'
  try {
    await usersApi.updatePermissions(user.id, newRole)
    await loadUsers()
    ElMessage.success(`用户权限已更新为「${newRole === 'admin' ? '管理员' : '查看者'}」`)
  } catch (e) { ElMessage.error(`操作失败：${getErrorMessage(e)}`) }
}

onMounted(() => loadUsers())

/**
 * 组件卸载清理
 *
 * 考点：Element Plus el-dialog 卸载清理
 *   - 同 KnowledgeView：关闭 Dialog 触发 Element Plus 的正常关闭流程
 *   - 恢复 body overflow、清理 modal 栈、移除 Teleport 内容
 */
onBeforeUnmount(() => {
  dialogVisible.value = false
})
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-danger/10 flex items-center justify-center">
          <el-icon :size="14" color="var(--color-danger)"><UserFilled /></el-icon>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text">用户管理</h1>
          <p class="text-xs text-text-muted mt-0.5">管理系统用户、角色与数据权限</p>
        </div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">添加用户</el-button>
    </div>

    <!-- Filters -->
    <div class="card">
      <div class="flex items-center gap-4 flex-wrap">
        <el-input
          v-model="searchKey"
          placeholder="搜索用户名或邮箱..."
          :prefix-icon="Search"
          class="max-w-64"
          size="default"
          clearable
          @change="loadUsers"
        />
        <div class="h-6 w-px bg-brand-border hidden sm:block" />
        <el-radio-group v-model="activeRole" size="small" @change="loadUsers">
          <el-radio-button v-for="r in roles" :key="r" :value="r">{{ r }}</el-radio-button>
        </el-radio-group>
        <span class="text-xs text-text-muted ml-auto">共 {{ users.length }} 位用户</span>
      </div>
    </div>

    <!-- User Table -->
    <div class="card overflow-hidden">
      <div v-if="loading" class="text-center text-text-muted py-12">加载中...</div>
      <el-table v-else :data="users" style="width: 100%">
        <el-table-column label="用户" min-width="200">
          <template #default="{ row }">
            <div class="flex items-center gap-3">
              <el-avatar :size="36" :icon="UserFilled" class="bg-brand-bg shrink-0" />
              <div>
                <div class="text-sm font-medium text-text">{{ row.username }}</div>
                <div class="text-xs text-text-muted">{{ row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag
              size="small"
              effect="dark"
              :color="roleColorMap[row.role] ?? 'var(--color-text-muted)'"
              round
            >
              {{ row.role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="dept" label="部门" width="100" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="statusMap[row.status]?.type as any" size="small" effect="plain">
              {{ statusMap[row.status]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="flex items-center gap-1">
              <el-button text :icon="Edit" size="small" class="text-text-muted! hover:text-text!" @click="openEdit(row)" />
              <el-button text :icon="Lock" size="small" class="text-text-muted! hover:text-warning!" @click="handleTogglePermission(row)" />
              <el-button text :icon="Delete" size="small" class="text-text-muted! hover:text-danger!" @click="handleDelete(row.id, row.username)" />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Role Cards -->
    <div>
      <h3 class="text-sm font-semibold text-text mb-3">角色与权限</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div v-for="r in rolesList" :key="r.key" class="card">
          <div class="flex items-center gap-2.5 mb-2.5">
            <div
              class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              :style="{ backgroundColor: roleColorMap[r.key] ?? 'var(--color-text-muted)' }"
            >
              {{ r.name.charAt(0) }}
            </div>
            <h4 class="text-sm font-semibold text-text">{{ r.name }}</h4>
          </div>
          <p class="text-xs text-text-muted leading-relaxed">{{ r.permissions }}</p>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑用户' : '添加用户'" width="440px">
      <div class="space-y-4">
        <el-input v-model="form.username" placeholder="用户名" size="large" />
        <el-input v-model="form.email" placeholder="邮箱" size="large" />
        <el-input v-if="!isEdit" v-model="form.password" type="password" placeholder="密码" show-password size="large" />
        <el-select v-model="form.role" class="w-full" placeholder="选择角色" size="large">
          <el-option v-for="r in rolesList" :key="r.key" :label="r.name" :value="r.key" />
        </el-select>
        <el-input v-model="form.dept" placeholder="部门" size="large" />
        <el-select v-model="form.status" class="w-full" placeholder="状态" size="large">
          <el-option label="启用" value="active" />
          <el-option label="禁用" value="inactive" />
        </el-select>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>