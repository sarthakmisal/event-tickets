import { useState } from 'react';
import { createStaffSchema } from '@et/shared';
import {
  Avatar,
  Button,
  Empty,
  Field,
  Input,
  LoadState,
  PageHead,
  Pill,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage, useQuery } from '../../lib/hooks';

export function TeamPage() {
  const toast = useToast();
  const staff = useQuery(() => api.staff.list(), []);
  const [f, setF] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const err = (k: string) => (error?.field === k ? error.message : undefined);

  async function add() {
    const parsed = createStaffSchema.safeParse({ ...f, email: null });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError({ field: issue?.path[0]?.toString(), message: issue?.message ?? 'Invalid input' });
      return;
    }
    setBusy(true);
    try {
      await api.staff.create(parsed.data);
      toast('Gate staff added');
      setF({ name: '', phone: '', password: '' });
      setError(null);
      staff.reload();
    } catch (e) {
      setError({ field: 'phone', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    try {
      await api.staff.setActive(id, !active);
      staff.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Entry"
        title="Gate staff"
        sub="People who scan tickets at the door. They only see the scanner."
      />
      <div className="team-grid">
        <div className="card">
          <LoadState loading={staff.loading} error={staff.error} onRetry={staff.reload} />
          {staff.data && (
            <div className="tbl stack-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {staff.data.map((s) => (
                    <tr key={s.id}>
                      <td className="full">
                        <div className="person">
                          <Avatar name={s.name} />
                          <div>
                            <b>{s.name}</b>
                            <small>
                              {s.phone}
                              {s.organiserName ? ` · ${s.organiserName}` : ' · all events'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Status">
                        <Pill tone={s.active ? 'good' : 'bad'}>
                          {s.active ? 'Active' : 'Disabled'}
                        </Pill>
                      </td>
                      <td className="r">
                        <div className="row-actions">
                          <Button size="sm" onClick={() => void toggle(s.id, s.active)}>
                            {s.active ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {staff.data.length === 0 && (
                <Empty title="No gate staff yet">Add someone to start scanning tickets.</Empty>
              )}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Add gate staff</h2>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <Field label="Name" error={err('name')}>
              <Input value={f.name} onChange={set('name')} />
            </Field>
            <Field label="Phone (login)" error={err('phone')}>
              <Input type="tel" value={f.phone} onChange={set('phone')} />
            </Field>
            <Field label="Password" error={err('password')}>
              <Input
                type="password"
                value={f.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
            </Field>
            <Button variant="primary" busy={busy} onClick={() => void add()}>
              Add staff
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
