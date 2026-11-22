import { MESSAGE_STATUSES } from '@et/shared';
import { MessageStatusPill } from '../../components/status';
import { Button, Empty, LoadState, PageHead, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime, whatsappLink } from '../../lib/format';
import { errorMessage, useQuery } from '../../lib/hooks';
import { WhatsAppCard } from './WhatsAppCard';

export function MessagesPage() {
  const toast = useToast();
  const messages = useQuery(() => api.messages.list(), [], 5000);
  const counts = Object.fromEntries(
    MESSAGE_STATUSES.map((s) => [s, messages.data?.filter((m) => m.status === s).length ?? 0]),
  );

  async function resend(id: string) {
    try {
      await api.messages.resend(id);
      toast('Queued to send again');
      messages.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Customers"
        title="WhatsApp messages"
        sub="Ticket confirmations are queued after payment. If no number is connected, press “Open in WhatsApp” to send one yourself."
      />
      <WhatsAppCard />
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {MESSAGE_STATUSES.filter((s) => s !== 'SENDING').map((s) => (
          <button key={s} type="button" aria-pressed="false" style={{ cursor: 'default' }}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
            <span className="ct">{counts[s]}</span>
          </button>
        ))}
      </div>
      <div className="card">
        <LoadState loading={messages.loading} error={messages.error} onRetry={messages.reload} />
        {messages.data && (
          <div className="tbl stack-tbl">
            <table>
              <thead>
                <tr>
                  <th>To</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {messages.data.map((m) => (
                  <tr key={m.id}>
                    <td data-label="To" className="num">
                      +91 {m.toPhone}
                    </td>
                    <td className="full" style={{ maxWidth: 380 }}>
                      <span
                        style={{
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.body.split('\n')[0]}
                      </span>
                      {m.lastError && (
                        <span className="cell-sub" style={{ color: 'var(--bad)' }}>
                          {m.lastError} · attempt {m.attempts}
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <MessageStatusPill status={m.status} />
                    </td>
                    <td data-label="When">{fmtDateTime(m.sentAt ?? m.createdAt)}</td>
                    <td className="r">
                      <div className="row-actions">
                        <a
                          className="btn sm"
                          href={whatsappLink(m.toPhone, m.body)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in WhatsApp
                        </a>
                        {(m.status === 'FAILED' || m.status === 'SENT') && (
                          <Button size="sm" onClick={() => void resend(m.id)}>
                            Resend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {messages.data.length === 0 && (
              <Empty title="No messages yet">They appear when a booking is paid.</Empty>
            )}
          </div>
        )}
      </div>
    </>
  );
}
