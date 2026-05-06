export function isSafeProviderName(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value)
}
