import { client } from './client'
import { unwrap } from './request'

// 认证接口传输：只负责请求与错误识别，续期协调与状态决策在 app/session 的协调器。
// 登录与刷新自身不进入递归续期流程，因此不经过受保护请求接缝。

// 契约字段为蛇形命名（access_token / token_type），传输层映射为驼峰供会话模块使用

interface AccessTokenPayload {
  access_token: string
  token_type: string
}

export interface LoginResult {
  username: string
  accessToken: string
}

export async function apiSignup(input: {
  username: string
  password: string
  confirm_password: string
}): Promise<{ username: string }> {
  return unwrap<{ username: string }>(
    client.POST('/api/v1/signup', { body: input }),
  )
}

export async function apiLogin(input: {
  username: string
  password: string
}): Promise<LoginResult> {
  const data = await unwrap<{ username: string } & AccessTokenPayload>(
    client.POST('/api/v1/login', { body: input }),
  )
  return { username: data.username, accessToken: data.access_token }
}

export async function apiRefresh(): Promise<{ accessToken: string }> {
  const data = await unwrap<AccessTokenPayload>(client.POST('/api/v1/refresh'))
  return { accessToken: data.access_token }
}

/** 成功为 204 无正文；删除失败返回 500 */
export async function apiLogout(): Promise<void> {
  return unwrap<void>(client.POST('/api/v1/logout'))
}
