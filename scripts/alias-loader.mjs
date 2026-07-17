import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = pathToFileURL(process.cwd() + '/').href

function withTsExt(url) {
  // Try appending .ts / .tsx / /index.ts for extensionless local specifiers.
  try {
    const p = fileURLToPath(url)
    if (/\.(ts|tsx|js|mjs|json)$/.test(p)) return url
    for (const cand of [`${p}.ts`, `${p}.tsx`, `${p}/index.ts`]) {
      if (existsSync(cand)) return pathToFileURL(cand).href
    }
  } catch {
    /* not a file URL */
  }
  return url
}

export async function resolve(specifier, context, next) {
  if (specifier === 'server-only' || specifier === 'client-only') {
    return { url: 'data:text/javascript,export {}', shortCircuit: true }
  }
  if (specifier.startsWith('@/')) {
    return next(withTsExt(root + specifier.slice(2)), context)
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const resolved = new URL(specifier, context.parentURL).href
    return next(withTsExt(resolved), context)
  }
  return next(specifier, context)
}
