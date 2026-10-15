// 注册/登录表单校验与安全返回目标。规则与后端契约一致：
// 注册用户名 3–64 位字母数字；密码 8–20 位不含空格的可打印 ASCII，
// 须同时含大写字母、小写字母、数字和特殊符号；两次一致。
// 登录只要求非空且各不超过 64 字符，不套用注册限制（旧规则注册的账号仍可登录）。

export const USERNAME_PATTERN = /^[A-Za-z0-9]{3,64}$/
export const PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9])[\x21-\x7E]{8,20}$/
export const PASSWORD_RULE = '8–20 位，同时包含大写字母、小写字母、数字和特殊符号，不含空格'

export interface AuthFormInput {
  username: string
  password: string
  confirmPassword?: string
}

export interface FieldError {
  field: 'username' | 'password' | 'confirmPassword'
  message: string
}

export function validateRegisterForm(input: AuthFormInput): FieldError | null {
  if (!USERNAME_PATTERN.test(input.username)) {
    return { field: 'username', message: '用户名需为 3–64 位英文字母或数字' }
  }
  if (!PASSWORD_PATTERN.test(input.password)) {
    return { field: 'password', message: `密码需为 ${PASSWORD_RULE}` }
  }
  if (input.password !== input.confirmPassword) {
    return { field: 'confirmPassword', message: '两次输入的密码不一致' }
  }
  return null
}

export function validateLoginForm(input: AuthFormInput): FieldError | null {
  if (input.username.length === 0) {
    return { field: 'username', message: '请输入用户名' }
  }
  if (input.username.length > 64) {
    return { field: 'username', message: '用户名不超过 64 个字符' }
  }
  if (input.password.length === 0) {
    return { field: 'password', message: '请输入密码' }
  }
  if (input.password.length > 64) {
    return { field: 'password', message: '密码不超过 64 个字符' }
  }
  return null
}

/**
 * 登录后安全返回原站内目标：仅接受以单个 / 开头的站内路径，
 * 拒绝 //、协议相对、绝对 URL 与控制字符，防止开放重定向。
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex -- 显式拒绝反斜杠与控制字符，防止开放重定向绕过
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null
  return value
}
