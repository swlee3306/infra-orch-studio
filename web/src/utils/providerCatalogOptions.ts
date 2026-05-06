import type { ProviderCatalog, ProviderResourceDetail } from '../api'

function unique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const value = item.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function idAwareOptions(details: ProviderResourceDetail[] | undefined, fallback: string[] | undefined): string[] {
  const detailItems = (details || []).map((item) => (item.id ? `id:${item.id}` : item.name))
  return unique(detailItems.concat(fallback || []))
}

function nameOptions(details: ProviderResourceDetail[] | undefined, fallback: string[] | undefined): string[] {
  const detailItems = (details || []).map((item) => item.name)
  return unique(detailItems.concat(fallback || []))
}

export function providerImageOptions(catalog: ProviderCatalog): string[] {
  return idAwareOptions(catalog.image_details, catalog.images)
}

export function providerFlavorOptions(catalog: ProviderCatalog): string[] {
  return idAwareOptions(catalog.flavor_details, catalog.flavors)
}

export function providerSecurityGroupOptions(catalog: ProviderCatalog): string[] {
  return nameOptions(catalog.security_group_details, catalog.security_groups)
}

export function providerKeyPairOptions(catalog: ProviderCatalog): string[] {
  return nameOptions(catalog.key_pair_details, catalog.key_pairs)
}
