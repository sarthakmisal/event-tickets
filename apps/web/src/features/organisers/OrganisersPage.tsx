import { useState } from 'react';
import type { OrganiserDto } from '@et/shared';
import { bpsToPercent, createOrganiserSchema, percentToBps } from '@et/shared';
import { Icon } from '../../components/Icon';
import {
  Avatar,
  Button,
  Empty,
  Field,
  Input,
  LoadState,
  Modal,
  PageHead,
  Pill,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage, useQuery } from '../../lib/hooks';

function OrganiserForm({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', commission: '10' });
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const err = (k: string) => (error?.field === k ? error.message : undefined);

  async function save() {
    const parsed = createOrganiserSchema.safeParse({
      name: f.name,
      phone: f.phone,
      email: f.email,
      password: f.password,
      commissionBps: percentToBps(Number(f.commission)),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError({ field: issue?.path[0]?.toString(), message: issue?.message ?? 'Invalid input' });
      return;
    }
    setBusy(true);
    try {
      await api.organisers.create(parsed.data);
      onDone();
    } catch (e) {
      const field =
        e && typeof e === 'object' && 'field' in e
          ? String((e as { field?: string }).field ?? '')
          : '';
      setError({ field: field || undefined, message: errorMessage(e) });
      setBusy(false);
    }
  }

  return (
    <Modal title="Appoint organiser" onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Name" error={err('name')}>
          <Input value={f.name} onChange={set('name')} placeholder="Jivan Mhaske" />
        </Field>
        <div className="grid-2">
          <Field label="Phone (login)" error={err('phone')}>
            <Input type="tel" value={f.phone} onChange={set('phone')} placeholder="9876543210" />
          </Field>
          <Field label="Commission %" note="Taken from each ticket" error={err('commissionBps')}>
            <Input
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={f.commission}
              onChange={set('commission')}
            />
          </Field>
        </div>
        <Field label="Email" error={err('email')}>
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field
          label="Temporary password"
          note="They can change it after signing in"
          error={err('password')}
        >
          <Input
            type="password"
            value={f.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
        </Field>
        {error && !error.field && <span className="err">{error.message}</span>}
      </div>
      <div className="row">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>
          Appoint
        </Button>
      </div>
    </Modal>
  );
}

function CommissionForm({
  organiser,
  onDone,
  onClose,
}: {
  organiser: OrganiserDto;
  onDone: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(bpsToPercent(organiser.commissionBps)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    try {
      await api.organisers.update(organiser.id, { commissionBps: percentToBps(Number(value)) });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Commission — ${organiser.name}`} onClose={onClose}>
      <Field
        label="Commission %"
        note="Applies to events created from now on. Existing events keep their rate."
        error={error}
      >
        <Input
          type="number"
          min="0"
          max="50"
          step="0.5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <div className="row">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

export function OrganisersPage() {
  const toast = useToast();
  const list = useQuery(() => api.organisers.list(), []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrganiserDto | null>(null);

  async function toggle(o: OrganiserDto) {
    try {
      await api.organisers.update(o.id, { active: !o.active });
      toast(o.active ? `${o.name} disabled` : `${o.name} enabled`);
      list.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Platform"
        title="Organisers"
        sub="People you have appointed to run events. Each has a login and a commission rate."
      >
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" />
          Appoint organiser
        </Button>
      </PageHead>
      <div className="card">
        <LoadState loading={list.loading} error={list.error} onRetry={list.reload} />
        {list.data && (
          <div className="tbl stack-tbl">
            <table>
              <thead>
                <tr>
                  <th>Organiser</th>
                  <th>Commission</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((o) => (
                  <tr key={o.id}>
                    <td className="full">
                      <div className="person">
                        <Avatar name={o.name} />
                        <div>
                          <b>{o.name}</b>
                          <small>
                            {o.phone} · {o.email}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Commission" className="num">
                      {bpsToPercent(o.commissionBps)}%
                    </td>
                    <td data-label="Events" className="num">
                      {o.eventCount}
                    </td>
                    <td data-label="Status">
                      <Pill tone={o.active ? 'good' : 'bad'}>
                        {o.active ? 'Active' : 'Disabled'}
                      </Pill>
                    </td>
                    <td className="r full">
                      <div className="row-actions">
                        <Button size="sm" onClick={() => setEditing(o)}>
                          Commission
                        </Button>
                        <Button size="sm" onClick={() => void toggle(o)}>
                          {o.active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data.length === 0 && <Empty title="No organisers yet" />}
          </div>
        )}
      </div>
      {creating && (
        <OrganiserForm
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            toast('Organiser appointed');
            list.reload();
          }}
        />
      )}
      {editing && (
        <CommissionForm
          organiser={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast('Commission updated');
            list.reload();
          }}
        />
      )}
    </>
  );
}
