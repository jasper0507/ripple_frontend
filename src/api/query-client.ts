import { QueryClient } from '@tanstack/react-query'

// TanStack Query 是唯一服务端缓存：只存在当前标签页内存，不持久化、不广播。
// 列表不因窗口聚焦、网络恢复或重新挂载自动重取；重试由请求层
// getWithRetry 按已确认规则精确控制（首次读取最多一次，追加与写入不重试），
// 因此全局关闭 Query 的默认重试。
// gcTime 需保留返回列表恢复所需的缓存，但不永久保留所有历史筛选。
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        gcTime: 30 * 60 * 1000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
