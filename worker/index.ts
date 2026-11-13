interface Env {
  CLOUD_RUN_ORIGIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incomingUrl = new URL(request.url)
    const origin = env.CLOUD_RUN_ORIGIN || 'https://canval-edbhtpvina-uc.a.run.app'
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, origin)

    const upstreamRequest = new Request(targetUrl.toString(), request)
    upstreamRequest.headers.set('X-Forwarded-Host', incomingUrl.host)
    upstreamRequest.headers.set('X-Forwarded-Proto', 'https')

    return fetch(upstreamRequest)
  },
}
