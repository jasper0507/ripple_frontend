import createClient from 'openapi-fetch'
import type { paths } from './types'

// 同源请求：开发由 Vite 代理 /api 到后端，部署由 Nginx 以相同路径反代。
// 不重复追加 API 前缀；凭证（刷新 Cookie）由浏览器随同源请求自动携带。
// 非浏览器环境（如 Vitest）下相对地址无法解析，回退到绝对地址。
export const client = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? 'http://localhost:8080' : '',
  credentials: 'same-origin',
  // 每次调用时取当前全局 fetch，便于测试替换，也避免模块加载顺序影响
  fetch: (...args) => globalThis.fetch(...args),
})
