import { useEffect, useRef, useState, type FormEvent } from 'react';

const apiBase = import.meta.env.VITE_GAME_API_BASE_URL?.trim().replace(/\/$/, '');

type Account = { emailLogin: boolean; email: string | null };
type Step = 'closed' | 'email' | 'code';

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${apiBase}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const REQUEST_ERRORS: Record<number, string> = {
  422: 'Проверьте адрес почты.',
  429: 'Слишком много попыток. Попробуйте позже.',
  502: 'Не удалось отправить письмо. Попробуйте позже.'
};
const VERIFY_ERRORS: Record<number, string> = {
  401: 'Код не подошёл или устарел. Запросите новый.',
  422: 'Введите шесть цифр из письма.',
  429: 'Слишком много попыток. Попробуйте позже.'
};

/** Sign-in by an e-mailed one-time code. Renders nothing unless the server has e-mail login switched on. */
export function EmailLogin() {
  const [account, setAccount] = useState<Account | null>(null);
  const [step, setStep] = useState<Step>('closed');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!apiBase) return;
    let alive = true;
    fetch(`${apiBase}/auth/me`, { credentials: 'include' })
      .then(r => (r.ok ? (r.json() as Promise<Account>) : null))
      .then(a => { if (alive) setAccount(a); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (step !== 'closed') input.current?.focus();
  }, [step]);

  if (!apiBase || !account?.emailLogin) return null;

  if (account.email) {
    return <span className="account-email" title="Профиль привязан к почте">{account.email}</span>;
  }

  const close = () => { setStep('closed'); setCode(''); setMessage(null); };

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await post('/auth/email/request', { email });
      if (response.ok) {
        setStep('code');
        setMessage('Если адрес верный, письмо с кодом уже в пути.');
      } else {
        setMessage(REQUEST_ERRORS[response.status] ?? 'Не удалось запросить код.');
      }
    } catch {
      setMessage('Нет связи с сервером.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await post('/auth/email/verify', { email, code });
      if (response.ok) {
        const { email: verified } = (await response.json()) as { email: string };
        setAccount({ emailLogin: true, email: verified });
        close();
      } else {
        setMessage(VERIFY_ERRORS[response.status] ?? 'Не удалось проверить код.');
      }
    } catch {
      setMessage('Нет связи с сервером.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'closed') {
    return <button type="button" onClick={() => setStep('email')}>Войти по почте</button>;
  }

  return (
    <form className="email-login" onSubmit={step === 'email' ? requestCode : verifyCode} aria-label="Вход по почте">
      {step === 'email' ? (
        <input
          ref={input}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Ваша почта"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      ) : (
        <input
          ref={input}
          inputMode="numeric"
          name="code"
          autoComplete="one-time-code"
          placeholder="Код из письма"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
      )}
      <button type="submit" disabled={busy}>{step === 'email' ? 'Получить код' : 'Войти'}</button>
      <button type="button" onClick={close}>Отмена</button>
      {message && <span className="email-login-message" role="status">{message}</span>}
    </form>
  );
}
