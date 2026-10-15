import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuthActions, useSession } from '@/app/session'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeRedirectTarget, validateLoginForm } from '@/lib/validation'

interface LoginLocationState {
  from?: string
  username?: string
  listFrom?: unknown
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'auth' && error.code === 'INVALID_CREDENTIALS') {
      return '用户名或密码错误'
    }
    if (error.kind === 'rate-limited') return '登录尝试过于频繁，请稍后再试'
    if (error.kind === 'network') return '网络故障，请稍后重试'
    if (error.kind === 'server') return '服务器暂时不可用，请稍后重试'
  }
  return '登录失败，请稍后重试'
}

export function LoginPage() {
  const session = useSession()
  const actions = useAuthActions()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LoginLocationState
  const from = safeRedirectTarget(state.from)
  // 避免登录页自指导致的重复导航
  const target = from && from !== '/login' && from !== '/register' ? from : '/'
  const listFrom = safeRedirectTarget(state.listFrom)
  const targetState = listFrom ? { from: listFrom } : undefined

  const [username, setUsername] = useState(state.username ?? '')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 已登录（含其他标签页同步登录）时不在登录页停留
  if (session.status === 'authenticated') {
    return <Navigate to={target} state={targetState} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return // 提交期间防重复点击
    const input = { username, password }
    const error = validateLoginForm(input)
    if (error) {
      setFieldErrors({ [error.field]: error.message })
      setFormError(null)
      document.getElementById(`login-${error.field}`)?.focus()
      return
    }
    setFieldErrors({})
    setFormError(null)
    setSubmitting(true)
    try {
      await actions.login(username, password)
      // 登录后返回安全的原站内目标；不自动提交此前业务意图
      navigate(target, { replace: true, state: targetState })
    } catch (cause) {
      setFormError(loginErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h1 className="page-title">登录</h1>
      <p className="mt-2 text-sm leading-6 text-muted">继续参与社区里的讨论。</p>
      <form className="mt-6 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-username" className="text-sm font-medium">
            用户名
          </label>
          <Input
            id="login-username"
            name="username"
            autoComplete="username"
            disabled={submitting}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              setFieldErrors((current) => ({ ...current, username: undefined }))
              setFormError(null)
            }}
            aria-invalid={fieldErrors.username ? true : undefined}
            aria-describedby={fieldErrors.username ? 'login-username-error' : undefined}
          />
          {fieldErrors.username ? (
            <p id="login-username-error" className="text-sm text-danger">
              {fieldErrors.username}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">
            密码
          </label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            disabled={submitting}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setFieldErrors((current) => ({ ...current, password: undefined }))
              setFormError(null)
            }}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
          />
          {fieldErrors.password ? (
            <p id="login-password-error" className="text-sm text-danger">
              {fieldErrors.password}
            </p>
          ) : null}
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? '登录中…' : '登录'}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        还没有账号？
        <Link
          to="/register"
          state={{ from: from ?? undefined, listFrom: listFrom ?? undefined }}
          className="ml-1 underline underline-offset-4"
        >
          前往注册
        </Link>
      </p>
    </section>
  )
}
