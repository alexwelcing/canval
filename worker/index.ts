interface AiBinding {
  run(
    model: string,
    inputs: {
      messages: { role: string; content: string }[];
      max_tokens?: number;
      temperature?: number;
    },
  ): Promise<{ response?: string; choices?: { message?: { content?: string } }[] }>;
}

interface Env {
  AI: AiBinding;
  ASSETS: { fetch(req: Request): Promise<Response> };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function extractCleanOpcode(raw: string): string {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const firstLine =
    withoutThink
      .split('\n')
      .map((l) => l.replace(/^(?:OUT:|OPCODE:|CMD:)\s*/i, '').trim())
      .find((l) => l.length > 0) ?? 'NOOP';
  return firstLine.slice(0, 80);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/state-computer') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (request.method === 'GET') {
        return Response.json(
          {
            ok: true,
            kernel: 'canval-qwen-state-computer',
            models: ['@cf/qwen/qwen2.5-coder-32b-instruct', '@cf/qwen/qwen3-30b-a3b-fp8'],
          },
          { headers: CORS_HEADERS },
        );
      }

      if (request.method === 'POST') {
        try {
          const body = (await request.json()) as {
            messages?: { role: string; content: string }[];
          };
          const messages = Array.isArray(body?.messages) ? body.messages.slice(-16) : [];
          if (messages.length === 0) {
            return Response.json({ ok: true, opcode: 'NOOP' }, { headers: CORS_HEADERS });
          }

          let rawText = '';
          let usedModel = '@cf/qwen/qwen2.5-coder-32b-instruct';

          try {
            const out = await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct', {
              messages,
              max_tokens: 20,
              temperature: 0,
            });
            rawText =
              out?.response ??
              out?.choices?.[0]?.message?.content ??
              '';
          } catch {
            usedModel = '@cf/qwen/qwen3-30b-a3b-fp8';
            const out2 = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
              messages,
              max_tokens: 48,
              temperature: 0,
            });
            rawText =
              out2?.response ??
              out2?.choices?.[0]?.message?.content ??
              '';
          }

          const opcode = extractCleanOpcode(rawText);
          return Response.json(
            { ok: true, model: usedModel, opcode },
            { headers: CORS_HEADERS },
          );
        } catch (err) {
          return Response.json(
            {
              ok: false,
              opcode: 'NOOP',
              error: err instanceof Error ? err.message : 'State computer error',
            },
            { status: 200, headers: CORS_HEADERS },
          );
        }
      }
    }

    return env.ASSETS.fetch(request);
  },
};
