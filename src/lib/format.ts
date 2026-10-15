export function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(date)
}

/** 列表按浏览器本地日历显示；详情继续使用完整时间。 */
export function formatRelativeTimestamp(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const elapsed = now.getTime() - date.getTime()
  const sameDay = (other: Date) =>
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate()

  if (elapsed >= 0 && sameDay(now)) {
    const minutes = Math.floor(elapsed / 60_000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    return `${Math.floor(minutes / 60)} 小时前`
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (elapsed >= 0 && sameDay(yesterday)) return '昨天'

  const day = `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  return date.getFullYear() === now.getFullYear() ? day : `${date.getFullYear()} 年 ${day}`
}
