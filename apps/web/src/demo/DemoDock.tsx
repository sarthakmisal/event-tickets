import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { demo } from '../lib/api';
import { DEMO_PASSWORD } from '../lib/api/memory/memoryApi';
import { useToast } from '../components/ui';
import { useQuery } from '../lib/hooks';

/**
 * Floating control panel, shown only in the database-free demo build. Lets you switch roles and
 * poke the business rules that normally depend on time or an external service.
 */
export function DemoDock() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(() => window.innerWidth > 720);
  const failing = useQuery(() => Promise.resolve(demo?.isWhatsAppFailing() ?? false), []);
  if (!demo) return null;

  async function as(loginId: string, role: string) {
    if (user) await logout();
    await login(loginId, DEMO_PASSWORD);
    navigate(role === 'GATE_STAFF' ? '/gate' : '/');
  }

  return (
    <aside className={`dock ${open ? '' : 'closed'}`} aria-label="Demo controls">
      <button type="button" className="dock-toggle" onClick={() => setOpen(!open)}>
        {open ? 'Hide demo controls' : 'Demo controls'}
      </button>
      {open && (
        <div className="dock-body">
          <small>In-memory demo · no database · resets on refresh</small>
          <div className="dock-row">
            {demo.personas.map((p) => (
              <button
                key={p.login}
                type="button"
                className={user?.phone === p.login ? 'on' : ''}
                onClick={() => void as(p.login, p.role)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const id = demo?.publicEventId();
                void (user ? logout() : Promise.resolve()).then(() =>
                  navigate(id ? `/e/${id}` : '/e'),
                );
              }}
            >
              Customer
            </button>
          </div>
          <div className="dock-row">
            <button
              type="button"
              onClick={() => {
                demo?.advanceMinutes(16);
                toast('Clock moved +16 min — unpaid seat holds expire');
              }}
            >
              +16 min
            </button>
            <button
              type="button"
              className={failing.data ? 'on' : ''}
              onClick={() => {
                demo?.setWhatsAppFailing(!demo.isWhatsAppFailing());
                toast(
                  demo?.isWhatsAppFailing()
                    ? 'WhatsApp now failing (simulated)'
                    : 'WhatsApp working again',
                );
              }}
            >
              WhatsApp {failing.data ? 'failing' : 'ok'}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
