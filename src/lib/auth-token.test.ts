import { describe, expect, it } from 'vitest'
import { isAccessTokenFresh, readAccessTokenClaims } from './auth-token'

function makeToken(payload: unknown): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('readAccessTokenClaims', () => {
  it('解析 sub 与 exp', () => {
    const token = makeToken({ iss: 'bluebell', sub: 'user-uuid-1', iat: 100, exp: 1900 })
    expect(readAccessTokenClaims(token)).toEqual({
      userUuid: 'user-uuid-1',
      expiresAtMs: 1_900_000,
    })
  })

  it.each([
    ['缺段', 'abc.def'],
    ['payload 非 JSON', `x.${btoa('not-json')}.y`],
    ['缺 sub', makeToken({ exp: 1900 })],
    ['sub 为空', makeToken({ sub: '', exp: 1900 })],
    ['缺 exp', makeToken({ sub: 'u' })],
  ])('协议错误：%s', (_label, token) => {
    expect(() => readAccessTokenClaims(token)).toThrowError(
      expect.objectContaining({ kind: 'protocol' }),
    )
  })
})

describe('isAccessTokenFresh', () => {
  it('到期前 30 秒以上视为有效', () => {
    expect(isAccessTokenFresh(1_900_000, 1_000_000)).toBe(true)
  })

  it('距到期不足 30 秒视为需要续期', () => {
    expect(isAccessTokenFresh(1_900_000, 1_880_000)).toBe(false)
  })
})
