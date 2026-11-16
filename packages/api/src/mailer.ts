export type Mailer = ReturnType<typeof createMailer>;

// ok: o provedor aceitou o pedido. messageId nulo indica aceitação sem confirmação legível.
// retryAfter: milissegundos pedidos pelo provedor antes da próxima tentativa (HTTP 429).
export type SendResult = { ok: boolean; status: number; messageId: string | null; retryAfter: number | null };

function retryDelay(headers: Headers) {
  const retry = headers.get('retry-after') ?? '';
  if (/^\d+$/.test(retry)) return Number(retry) * 1000;
  const date = Date.parse(retry);
  if (Number.isFinite(date)) return date - Date.now();
  // A Brevo informa em segundos quando a janela do limite de envio reinicia.
  const reset = headers.get('x-sib-ratelimit-reset') ?? '';
  return /^\d+$/.test(reset) ? Number(reset) * 1000 : null;
}

export function createMailer(appOrigin: string | null) {
  const key = process.env.BREVO_API_KEY?.trim();
  const sender = process.env.BREVO_SENDER_EMAIL?.trim();
  if (!key || !sender || !appOrigin?.startsWith('https://')) {
    if (key || sender) console.warn('E-mails precisam de BREVO_API_KEY, BREVO_SENDER_EMAIL e uma origem HTTPS.');
    return null;
  }

  return {
    origin: appOrigin,
    async send(to: string, subject: string, text: string, type: string, idempotencyKey: string): Promise<SendResult> {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': key,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'ReviewLab',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          sender: { name: 'ReviewLab', email: sender },
          to: [{ email: to }],
          subject,
          textContent: text,
          tags: [type],
          // A Brevo não deduplica pedidos. O cabeçalho identifica a mensagem nos registros do provedor.
          headers: { 'X-ReviewLab-Key': idempotencyKey },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return { ok: false, status: response.status, messageId: null, retryAfter: response.status === 429 ? retryDelay(response.headers) : null };
      }
      const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
      const messageId = typeof result?.messageId === 'string' && result.messageId ? result.messageId : null;
      return { ok: true, status: response.status, messageId, retryAfter: null };
    },
  };
}
