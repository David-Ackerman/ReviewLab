import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const storage = URL.parse(process.env.SUPABASE_URL ?? '');
  const storageOrigin = storage?.protocol === 'https:' ? ' ' + storage.origin : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'" + (dev ? " 'unsafe-eval'" : ''),
    "style-src 'self'" + (dev ? " 'unsafe-inline'" : " 'nonce-" + nonce + "'"),
    "img-src 'self'" + storageOrigin,
    "media-src 'self'" + storageOrigin,
    "connect-src 'self'" + storageOrigin + (dev ? ' ws:' : ''),
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');

  // Next reads the request policy to attach the nonce to its hydration scripts.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: ['/', '/projetos/:id', '/entrar', '/cadastro/:path*', '/perfil', '/notificacoes', '/verificar-email', '/recuperar-senha', '/redefinir-senha'],
};
