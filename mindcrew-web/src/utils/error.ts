/**
 * 从 axios 错误 / 通用 Error 中提取可读的错误消息
 *
 * 考点：axios 错误对象结构
 *   - error.response?.data?.message  → NestJS 抛出的 HttpException 消息
 *   - error.response?.data?.error    → 部分 API 的 error 字段
 *   - error.code === 'ERR_NETWORK'   → 网络不通（如后端未启动 / 数据库挂了）
 *   - error.code === 'ECONNABORTED'  → 请求超时
 *   - error.message                  → 兜底
 */
export function getErrorMessage(e: unknown): string {
  if (!e) return '未知错误'

  // Element Plus MessageBox 取消时 reject 字符串 'cancel'
  if (typeof e === 'string') return e

  if (e instanceof Error) {
    const axiosErr = e as any

    // 优先展示服务端返回的业务错误消息
    if (axiosErr.response?.data?.message) {
      return axiosErr.response.data.message
    }
    if (axiosErr.response?.data?.error) {
      return axiosErr.response.data.error
    }

    // 网络层错误：后端未启动、数据库挂了等
    if (axiosErr.code === 'ERR_NETWORK') {
      return '网络连接失败，请确认后端服务是否已启动'
    }

    // 请求超时
    if (axiosErr.code === 'ECONNABORTED') {
      return '请求超时，请稍后重试'
    }

    return axiosErr.message || '未知错误'
  }

  return String(e)
}

/**
 * 判断是否为 Element Plus MessageBox / Dialog 的用户取消操作
 *
 * 考点：ElMessageBox.confirm 返回 Promise，用户点"取消"时 reject('cancel')
 */
export function isUserCancel(e: unknown): boolean {
  if (e === 'cancel') return true
  if (typeof e === 'string' && e.toLowerCase().includes('cancel')) return true
  if (e instanceof Error && e.message === 'cancel') return true
  return false
}