import { describe, expect, it } from 'vitest'
import {
  PASSWORD_RULE,
  safeRedirectTarget,
  validateLoginForm,
  validateRegisterForm,
} from './validation'

describe('validateRegisterForm', () => {
  it.each(['Alice#2026', 'Aa1!aaaa', 'Aa1~' + 'a'.repeat(16)])('合法密码 %s 通过', (password) => {
    expect(
      validateRegisterForm({ username: 'alice01', password, confirmPassword: password }),
    ).toBeNull()
  })

  it.each([
    ['ab', '用户名需为 3–64 位英文字母或数字'],
    ['a'.repeat(65), '用户名需为 3–64 位英文字母或数字'],
    ['含中文名', '用户名需为 3–64 位英文字母或数字'],
    ['with space', '用户名需为 3–64 位英文字母或数字'],
  ])('用户名 %s 被拒', (username, message) => {
    expect(
      validateRegisterForm({ username, password: 'Example123', confirmPassword: 'Example123' }),
    ).toEqual({ field: 'username', message })
  })

  it.each([
    ['过短', 'Aa1!aaa'],
    ['过长', 'Aa1!' + 'a'.repeat(17)],
    ['缺大写', 'alice#2026'],
    ['缺小写', 'ALICE#2026'],
    ['缺数字', 'Alice#abcd'],
    ['缺特殊符号', 'Alice20260'],
    ['含空格', 'Alice #2026'],
    ['含非 ASCII', 'Alice#2026密'],
  ])('密码%s被拒', (_case, password) => {
    expect(
      validateRegisterForm({ username: 'alice01', password, confirmPassword: password }),
    ).toEqual({ field: 'password', message: `密码需为 ${PASSWORD_RULE}` })
  })

  it('两次密码不一致被拒', () => {
    expect(
      validateRegisterForm({ username: 'alice01', password: 'Alice#2026', confirmPassword: 'Alice#2027' }),
    ).toEqual({ field: 'confirmPassword', message: '两次输入的密码不一致' })
  })
})

describe('validateLoginForm：只校验非空与长度，不套用注册规则', () => {
  it('短密码与特殊字符也允许提交给服务端判定', () => {
    expect(validateLoginForm({ username: 'ab', password: 'x' })).toBeNull()
    expect(validateLoginForm({ username: '含中文', password: 'p@ss word!' })).toBeNull()
    // 旧规则注册的纯字母数字长密码仍可登录
    expect(validateLoginForm({ username: 'alice', password: 'a'.repeat(64) })).toBeNull()
  })

  it.each([
    [{ username: '', password: 'x' }, { field: 'username', message: '请输入用户名' }],
    [{ username: 'a'.repeat(65), password: 'x' }, { field: 'username', message: '用户名不超过 64 个字符' }],
    [{ username: 'alice', password: '' }, { field: 'password', message: '请输入密码' }],
    [{ username: 'alice', password: 'p'.repeat(65) }, { field: 'password', message: '密码不超过 64 个字符' }],
  ] as const)('%o → %o', (input, expected) => {
    expect(validateLoginForm(input)).toEqual(expected)
  })
})

describe('safeRedirectTarget', () => {
  it.each(['/', '/posts/new', '/communities/1?sort=hot', '/login'])('接受站内路径 %s', (value) => {
    expect(safeRedirectTarget(value)).toBe(value)
  })

  it.each([
    '//evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/\\evil',
    '',
    42,
    null,
    undefined,
  ])('拒绝非站内目标 %s', (value) => {
    expect(safeRedirectTarget(value)).toBeNull()
  })
})
