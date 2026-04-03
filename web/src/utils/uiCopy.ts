export function summarizeOperatorError(message?: string | null): string {
  if (!message) return 'An unexpected platform error occurred.'

  const normalized = message.toLowerCase()
  if (normalized.includes('no such file or directory') && normalized.includes('/templates/')) {
    return 'The selected template path is not available on the server. Sync the template catalog before retrying.'
  }
  if (normalized.includes('template') && normalized.includes('not found')) {
    return 'The referenced template could not be found. Check the template catalog and retry the plan.'
  }
  if (normalized.includes('list environment jobs failed')) {
    return 'The console could not load linked execution records for this environment.'
  }
  if (normalized.includes('list jobs failed')) {
    return 'The execution ledger could not be loaded.'
  }
  if (normalized.includes('failed to load templates') || normalized.includes('list templates failed')) {
    return 'The template catalog could not be loaded from the configured server paths.'
  }
  return message
}

export function errorLooksRaw(message?: string | null): boolean {
  if (!message) return false
  return message.includes('/') || message.includes('{') || message.includes('no such file or directory')
}
