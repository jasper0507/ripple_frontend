import { describe, expect, it } from 'vitest'
import { formatRelativeTimestamp, formatTimestamp } from './format'

// 本地日历输入，测试不依赖执行机器的时区。
const now = new Date(2026, 9, 5, 12, 0, 0)
const at = (day: number, hour = 12, minute = 0, second = 0) =>
  new Date(2026, 9, day, hour, minute, second).toISOString()

describe('列表时间', () => {
  it.each([
    [at(5), '刚刚'],
    [at(5, 11, 59, 1), '刚刚'],
    [at(5, 11, 59), '1 分钟前'],
    [at(5, 11, 58), '2 分钟前'],
    [at(5, 11, 23), '37 分钟前'],
    [at(5, 11, 1), '59 分钟前'],
    [at(5, 11), '1 小时前'],
    [at(5, 9), '3 小时前'],
    [at(5, 0), '12 小时前'],
    [at(4, 23, 59), '昨天'],
    [at(4, 0), '昨天'],
    [at(3), '10 月 3 日'],
    [new Date(2025, 9, 3).toISOString(), '2025 年 10 月 3 日'],
  ])('将 %s 显示为 %s', (value, expected) => {
    expect(formatRelativeTimestamp(value, now)).toBe(expected)
  })

  it('按日历跨过午夜，而不是等待满24小时', () => {
    expect(formatRelativeTimestamp(at(4, 23, 59), new Date(2026, 9, 5, 0, 1))).toBe('昨天')
  })

  it('元旦的昨天可以在上一年', () => {
    expect(formatRelativeTimestamp(
      new Date(2025, 11, 31, 23, 59).toISOString(),
      new Date(2026, 0, 1, 0, 1),
    )).toBe('昨天')
  })

  it('未来时间显示日期，避免负数或冒充刚刚', () => {
    expect(formatRelativeTimestamp(at(5, 12, 1), now)).toBe('10 月 5 日')
    expect(formatRelativeTimestamp(at(6), now)).toBe('10 月 6 日')
  })

  it('非法时间保留原值', () => {
    expect(formatRelativeTimestamp('invalid', now)).toBe('invalid')
    expect(formatTimestamp('invalid')).toBe('invalid')
  })

  it('详情时间保留年月日与时分', () => {
    const result = formatTimestamp(at(5, 12, 37))
    expect(result).toContain('2026')
    expect(result).toContain('12:37')
  })
})
