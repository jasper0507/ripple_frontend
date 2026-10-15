const ROUTE_ID = /^[1-9]\d*$/

/** 路径里的资源编号：正整数十进制。0、前导零和非数字都无效。 */
export function parseRouteId(raw: string | undefined): number | null {
  if (raw === undefined || !ROUTE_ID.test(raw)) return null
  const id = Number(raw)
  if (!Number.isSafeInteger(id)) return null
  return id
}
