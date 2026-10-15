import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/app/session'
import { apiSignup } from '@/api/auth'
import { ApiError } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PASSWORD_RULE, safeRedirectTarget, validateRegisterForm } from '@/lib/validation'

type RegisterField = 'username' | 'password' | 'confirmPassword'

function registerErrorMessage(error: unknown): { field?: RegisterField; message: string } {
  if (error instanceof ApiError) {
    if (error.kind === 'conflict' && error.code === 'USERNAME_EXISTS') {
      return { field: 'username', message: '用户名已存在' }
    }
    if (error.kind === 'params') return { message: '请求参数无效，请检查输入' }
    if (error.kind === 'rate-limited') return { message: '注册尝试过于频繁，请稍后再试' }
    if (error.kind === 'network') return { message: '网络故障，请稍后重试' }
    if (error.kind === 'server') return { message: '服务器暂时不可用，请稍后重试' }
  }
  return { message: '注册失败，请稍后重试' }
}

export function RegisterPage() {
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = safeRedirectTarget((location.state as { from?: string } | null)?.from)
  const target = from && from !== '/login' && from !== '/register' ? from : '/'
  const listFrom = safeRedirectTarget((location.state as { listFrom?: unknown } | null)?.listFrom)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session.status === 'authenticated') {
    return <Navigate to={target} state={listFrom ? { from: listFrom } : undefined} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return // 提交期间防重复点击
    const error = validateRegisterForm({ username, password, confirmPassword })
    if (error) {
      setFieldErrors({ [error.field]: error.message })
      setFormError(null)
      document.getElementById(error.field === 'confirmPassword' ? 'register-confirm' : `register-${error.field}`)?.focus()
      return
    }
    setFieldErrors({})
    setFormError(null)
    setSubmitting(true)
    try {
      await apiSignup({ username, password, confirm_password: confirmPassword })
      // 注册成功进入登录并带入用户名，保留注册往返目标
      navigate('/login', { state: { from: from ?? undefined, listFrom: listFrom ?? undefined, username } })
    } catch (cause) {
      const mapped = registerErrorMessage(cause)
      if (mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message })
        requestAnimationFrame(() => document.getElementById(mapped.field === 'confirmPassword' ? 'register-confirm' : `register-${mapped.field}`)?.focus())
      }
      else setFormError(mapped.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fields: Array<{
    id: string
    name: RegisterField
    label: string
    hint?: string
    type: string
    autoComplete: string
    value: string
    onChange: (value: string) => void
  }> = [
    {
      id: 'register-username',
      name: 'username',
      label: '用户名',
      hint: '3–64 位英文字母或数字',
      type: 'text',
      autoComplete: 'username',
      value: username,
      onChange: setUsername,
    },
    {
      id: 'register-password',
      name: 'password',
      label: '密码',
      hint: PASSWORD_RULE,
      type: 'password',
      autoComplete: 'new-password',
      value: password,
      onChange: setPassword,
    },
    {
      id: 'register-confirm',
      name: 'confirmPassword',
      label: '确认密码',
      type: 'password',
      autoComplete: 'new-password',
      value: confirmPassword,
      onChange: setConfirmPassword,
    },
  ]

  return (
    <section>
      <h1 className="page-title">注册</h1>
      <p className="mt-2 text-sm leading-6 text-muted">创建账号，发布帖子、投票和回复。</p>
      <form className="mt-6 flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        {fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1.5">
            <label htmlFor={field.id} className="text-sm font-medium">
              {field.label}
            </label>
            <Input
              id={field.id}
              name={field.name}
              type={field.type}
              autoComplete={field.autoComplete}
              disabled={submitting}
              value={field.value}
              onChange={(event) => {
                field.onChange(event.target.value)
                setFieldErrors((current) => ({
                  ...current,
                  [field.name]: undefined,
                  ...(field.name === 'password' ? { confirmPassword: undefined } : {}),
                }))
                setFormError(null)
              }}
              aria-invalid={fieldErrors[field.name] ? true : undefined}
              aria-describedby={[field.hint ? `${field.id}-hint` : '', fieldErrors[field.name] ? `${field.id}-error` : ''].filter(Boolean).join(' ') || undefined}
            />
            {field.hint ? <p id={`${field.id}-hint`} className="text-[13px] leading-5 text-muted">{field.hint}</p> : null}
            {fieldErrors[field.name] ? (
              <p id={`${field.id}-error`} className="text-sm text-danger">
                {fieldErrors[field.name]}
              </p>
            ) : null}
          </div>
        ))}
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? '注册中…' : '注册'}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        已有账号？
        <Link
          to="/login"
          state={{ from: from ?? undefined, listFrom: listFrom ?? undefined }}
          className="ml-1 underline underline-offset-4"
        >
          前往登录
        </Link>
      </p>
    </section>
  )
}
