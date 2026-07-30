/**
 * 时间格式化工具函数
 *
 * 背景：后端 Prisma 默认使用 UTC 存储时间，返回 ISO 8601 格式字符串（如 "2026-07-30T18:24:25.667Z"）
 *       前端需要将其转换为本地时间（如 Asia/Shanghai）才能正确显示
 *
 * 考点：JavaScript Date 对象
 *   - new Date(isoString) → 自动解析 ISO 字符串为本地时间
 *   - toLocaleString() / Intl.DateTimeFormat → 按浏览器/指定时区格式化输出
 *   - toISOString() → 反向操作，永远输出 UTC（禁止用它做本地时间显示）
 *
 * 考点：时区处理
 *   - UTC 时间戳 + 时区偏移 = 本地时间
 *   - 中国标准时间 (CST) = UTC+8
 *   - 使用 Intl.DateTimeFormat 指定 timeZone 可避免手动计算偏移导致的跨日/跨月错误
 */

/**
 * 将 ISO 时间字符串格式化为本地日期时间
 *
 * @param isoString - ISO 8601 格式时间字符串（如 "2026-07-30T18:24:25.667Z"）
 * @param options - 可选配置
 * @returns 格式化后的本地时间字符串，或原字符串（如果解析失败）
 *
 * @example
 *   formatDateTime("2026-07-30T18:24:25.667Z")  // → "2026/7/31 02:24:25"
 *   formatDateTime("2026-07-30T18:24:25.667Z", { withSeconds: false })  // → "2026/7/31 02:24"
 */
export function formatDateTime(
  isoString: string | null | undefined,
  options?: { withSeconds?: boolean; timeZone?: string }
): string {
  if (!isoString) return '-'

  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return isoString

    const withSeconds = options?.withSeconds ?? true
    const timeZone = options?.timeZone ?? 'Asia/Shanghai'

    const dateOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      timeZone,
      hour12: false,
    }

    return new Intl.DateTimeFormat('zh-CN', dateOptions).format(date)
  } catch {
    return isoString
  }
}

/**
 * 将 ISO 时间字符串格式化为本地日期（不含时间）
 *
 * @param isoString - ISO 8601 格式时间字符串
 * @param timeZone - 时区，默认 Asia/Shanghai
 * @returns 格式化后的本地日期字符串
 *
 * @example
 *   formatDateOnly("2026-07-30T18:24:25.667Z")  // → "2026/7/31"
 */
export function formatDateOnly(
  isoString: string | null | undefined,
  timeZone?: string
): string {
  if (!isoString) return '-'

  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return isoString

    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timeZone ?? 'Asia/Shanghai',
    }).format(date)
  } catch {
    return isoString
  }
}
