/**
 * Formatting helpers for USDC, share amounts, prices, and addresses.
 *
 * Internal representation: bigints in micro-units (6 decimals).
 * Wire representation to CLOB: decimal strings.
 */

const MICRO = 1_000_000n

export function usdcToMicro(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000))
}

export function microToUsdc(micro: bigint): number {
  return Number(micro) / 1_000_000
}

export function formatUsdc(micro: bigint): string {
  const whole = micro / MICRO
  const frac = (micro < 0n ? -micro : micro) % MICRO
  const sign = micro < 0n ? '-' : ''
  const fracStr = frac.toString().padStart(6, '0').slice(0, 2)
  return `${sign}$${(micro < 0n ? -whole : whole).toString()}.${fracStr}`
}

export function sharesToMicro(shares: number): bigint {
  return BigInt(Math.round(shares * 1_000_000))
}

export function microToShares(micro: bigint): number {
  return Number(micro) / 1_000_000
}

export function formatShares(micro: bigint): string {
  return microToShares(micro).toFixed(2)
}

/**
 * Snap a decimal price to the nearest valid tick size.
 * Returns a string to preserve precision (e.g. "0.123" not 0.12300000001).
 */
export function snapPrice(price: number, tickSize: number): string {
  if (price < tickSize) return tickSize.toString()
  if (price > 1 - tickSize) return (1 - tickSize).toString()
  const decimals = tickSize >= 0.01 ? 2 : tickSize >= 0.001 ? 3 : 4
  const snapped = Math.round(price / tickSize) * tickSize
  return snapped.toFixed(decimals)
}

export function snapPriceDown(price: number, tickSize: number): string {
  const decimals = tickSize >= 0.01 ? 2 : tickSize >= 0.001 ? 3 : 4
  const snapped = Math.floor(price / tickSize) * tickSize
  const clamped = Math.max(tickSize, Math.min(snapped, 1 - tickSize))
  return clamped.toFixed(decimals)
}

export function snapPriceUp(price: number, tickSize: number): string {
  const decimals = tickSize >= 0.01 ? 2 : tickSize >= 0.001 ? 3 : 4
  const snapped = Math.ceil(price / tickSize) * tickSize
  const clamped = Math.max(tickSize, Math.min(snapped, 1 - tickSize))
  return clamped.toFixed(decimals)
}

/**
 * Mask an Ethereum address for display: 0x1234...abcd
 */
export function maskAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function shortHash(hash: string, chars = 6): string {
  if (hash.length < chars * 2 + 2) return hash
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`
}
