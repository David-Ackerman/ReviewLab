export type Mailer = ReturnType<typeof createMailer>;

export function createMailer(appOrigin: string | null) {
  const key = process.env.RESEND_API_KEY?.trim();
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !sender || !appOrigin?.startsWith('https://')) {
    if (key || sender) console.warn('E-mails precisam de RESEND_API_KEY, RESEND_FROM_EMAIL e uma origem HTTPS.');
    return null;
  }

  return {
    origin: appOrigin,
    send(to: string, subject: string, text: string, type: string, idempotencyKey: string) {
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
          'User-Agent': 'ReviewLab',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          from: `ReviewLab <${sender}>`, to: [to], subject, text,
          tags: [{ name: 'type', value: type }],
        }),
      });
    },
  };
}
