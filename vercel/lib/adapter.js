import worker from '../worker/index.js';

// Vercel injects x-vercel-forwarded-for. The rate limit remains per instance.
export async function handle(request) {
  const headers = new Headers(request.headers);
  headers.set('cf-connecting-ip', headers.get('x-vercel-forwarded-for') || 'unknown');
  return worker.fetch(new Request(request, { headers }), { QLOO_API_KEY: process.env.QLOO_API_KEY || '' });
}
