import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Field, Input } from '../../components/ui';
import { useAuth } from '../../app/auth';
import { errorMessage } from '../../lib/hooks';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'GATE_STAFF' ? '/gate' : '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const next = await login(id, password);
      navigate(next.role === 'GATE_STAFF' ? '/gate' : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={(e) => void submit(e)}>
        <div className="brand" style={{ padding: 0 }}>
          <span className="mark">
            <Icon name="logoMark" />
          </span>
          <div>
            <b style={{ color: 'var(--ink)' }}>Event Tickets</b>
            <small style={{ color: 'var(--muted)' }}>Sign in to your panel</small>
          </div>
        </div>
        <Field label="Phone or email">
          <Input
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            placeholder="9876543210"
            autoFocus
          />
        </Field>
        <Field label="Password" error={error}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Button variant="primary" busy={busy} type="submit" disabled={!id || !password}>
          Sign in
        </Button>
        <Link className="link" to="/e">
          Looking to buy tickets? Browse events →
        </Link>
      </form>
    </div>
  );
}
