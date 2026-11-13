import type { Context, Next } from 'hono'

interface CachedAsset {
  etag: string
  gzipped: Uint8Array
}

const assetCache = new Map<string, CachedAsset>()
const COMPRESSIBLE_RE = /\.(json|js|mjs|css|wasm|glb|svg|html)$/i

function computeEtag(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher('sha1')
  hasher.update(bytes)
  return `"${hasher.digest('hex').slice(0, 20)}"`
}

export async function perfMiddleware(c: Context, next: Next): Promise<Response | void> {
  const t0 = performance.now()
  await next()
  const durMs = (performance.now() - t0).toFixed(2)
  c.res.headers.set('Server-Timing', `app;dur=${durMs}`)

  const pathname = new URL(c.req.url).pathname
  if (
    c.req.method === 'GET' &&
    c.res.status === 200 &&
    COMPRESSIBLE_RE.test(pathname) &&
    !c.res.headers.get('Content-Encoding')
  ) {
    const wantsGzip = (c.req.header('Accept-Encoding') ?? '').includes('gzip')
    const cached = assetCache.get(pathname)
    if (cached) {
      if (c.req.header('If-None-Match') === cached.etag) {
        return new Response(null, {
          status: 304,
          headers: { ETag: cached.etag, 'Server-Timing': `app;dur=${durMs};desc="cache-304"` },
        })
      }
      if (wantsGzip) {
        const headers = new Headers(c.res.headers)
        headers.set('ETag', cached.etag)
        headers.set('Content-Encoding', 'gzip')
        headers.set('Vary', 'Accept-Encoding')
        headers.set('Content-Length', String(cached.gzipped.byteLength))
        c.res = new Response(cached.gzipped as unknown as BodyInit, { status: 200, headers })
        return
      }
    }

    const buf = new Uint8Array(await c.res.clone().arrayBuffer())
    if (buf.byteLength > 1024) {
      const etag = computeEtag(buf)
      const gzipped = Bun.gzipSync(buf)
      assetCache.set(pathname, { etag, gzipped })
      if (c.req.header('If-None-Match') === etag) {
        return new Response(null, {
          status: 304,
          headers: { ETag: etag, 'Server-Timing': `app;dur=${durMs};desc="etag-304"` },
        })
      }
      const headers = new Headers(c.res.headers)
      headers.set('ETag', etag)
      headers.set('Vary', 'Accept-Encoding')
      if (wantsGzip) {
        headers.set('Content-Encoding', 'gzip')
        headers.set('Content-Length', String(gzipped.byteLength))
        c.res = new Response(gzipped as unknown as BodyInit, { status: 200, headers })
      } else {
        c.res = new Response(buf as unknown as BodyInit, { status: 200, headers })
      }
    }
  }
}
