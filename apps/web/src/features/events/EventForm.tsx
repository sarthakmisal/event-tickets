import { useState } from 'react';
import type { CreateEventInput, EventDto } from '@et/shared';
import { createEventSchema, rupeesToPaise } from '@et/shared';
import { Button, Field, Input, Modal, TextArea } from '../../components/ui';
import { fromLocalInput, toLocalInput } from '../../lib/format';

interface Props {
  event?: EventDto;
  onSubmit: (input: CreateEventInput) => Promise<void>;
  onClose: () => void;
}

/** Create or edit an event. Validation uses the same zod schema as the server. */
export function EventForm({ event, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startsAt, setStartsAt] = useState(event ? toLocalInput(event.startsAt) : '');
  const [endsAt, setEndsAt] = useState(event?.endsAt ? toLocalInput(event.endsAt) : '');
  const [price, setPrice] = useState(event ? String(event.pricePaise / 100) : '');
  const [capacity, setCapacity] = useState(event ? String(event.capacity) : '');
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = createEventSchema.safeParse({
      title,
      venue,
      description,
      startsAt: startsAt ? fromLocalInput(startsAt) : '',
      endsAt: endsAt ? fromLocalInput(endsAt) : null,
      pricePaise: rupeesToPaise(Number(price || 0)),
      capacity: Number(capacity),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError({ field: issue?.path[0]?.toString(), message: issue?.message ?? 'Invalid input' });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : 'Could not save' });
      setBusy(false);
    }
  }
  const err = (f: string) => (error?.field === f ? error.message : undefined);

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Title" error={err('title')}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Navratri Garba Night"
          />
        </Field>
        <Field label="Venue" error={err('venue')}>
          <Input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Shaniwar Wada, Pune"
          />
        </Field>
        <div className="grid-2">
          <Field label="Starts (IST)" error={err('startsAt')}>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Ends (IST)" optional error={err('endsAt')}>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Ticket price (₹)" note="0 = free event" error={err('pricePaise')}>
            <Input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="499"
            />
          </Field>
          <Field label="Capacity" error={err('capacity')}>
            <Input
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="200"
            />
          </Field>
        </div>
        <Field label="Description" optional>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ minHeight: 80 }}
          />
        </Field>
        {error && !error.field && <span className="err">{error.message}</span>}
      </div>
      <div className="row">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>
          {event ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
    </Modal>
  );
}
