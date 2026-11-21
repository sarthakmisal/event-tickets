# Who clicks what

Every action in the panel, by role. All of these were clicked through in a real browser against the real API.

Roles: **Owner** (platform), **Organiser** (runs events), **Gate staff** (scans), **Customer** (no login).

## Customer (no login)

| Where            | Button                  | What happens                                                             |
| ---------------- | ----------------------- | ------------------------------------------------------------------------ |
| `/e` events list | Event card              | Opens the event page                                                     |
| Event page       | `+` / `−`               | Changes ticket count (cannot exceed seats left or 10)                    |
| Event page       | **Continue · ₹…**       | Holds the seats for 15 minutes and opens payment                         |
| Payment          | **Pay ₹…**              | Razorpay window (test mode: a stand-in checkout)                         |
| Payment (test)   | Pay ₹… / Cancel payment | Confirms payment, or closes without paying                               |
| Payment          | **Back**                | Returns to the form. The hold is not released, it expires after 15 min   |
| After payment    | Ticket link             | Opens that person's QR ticket. Bookmark it: this is the only way back in |
| Top right        | Organiser login         | Goes to the sign-in page                                                 |

## Owner

| Where      | Button                                                         | What happens                                                                      |
| ---------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sidebar    | Dashboard, Organisers, Events, Gate scan, Gate staff, WhatsApp | Opens that page                                                                   |
| Sidebar    | Theme / Sign out                                               | Light-dark switch / ends the session                                              |
| Organisers | **Appoint organiser**                                          | Creates an organiser and their login (name, phone, commission %, email, password) |
| Organisers | **Commission**                                                 | Changes the % for future events (existing events keep their rate)                 |
| Organisers | **Disable / Enable**                                           | Blocks or restores that organiser's login                                         |
| Events     | (no New event button)                                          | Owners view events; organisers create them                                        |
| WhatsApp   | Open in WhatsApp / Resend                                      | See Organiser                                                                     |

## Organiser

| Where      | Button                                                        | What happens                                                                         |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Events     | **New event**                                                 | Creates a **draft** (title, venue, start, price, capacity). Not visible to customers |
| Event page | **Edit**                                                      | Changes details. Capacity cannot go below seats already taken                        |
| Event page | **Publish**                                                   | Makes the booking link live                                                          |
| Event page | **Unpublish**                                                 | Back to draft. Only available while no ticket is sold                                |
| Event page | **Cancel event** then **Cancel event** (confirm) / Keep event | Cancels all bookings and voids all tickets. Cannot be undone                         |
| Event page | **Copy** / **Open page**                                      | Copies the booking link / opens the customer page                                    |
| Gate staff | **Add staff**                                                 | Creates a scanner login for your events                                              |
| Gate staff | **Disable / Enable**                                          | Blocks or restores that scanner's login                                              |
| WhatsApp   | **Open in WhatsApp**                                          | Opens WhatsApp with the confirmation pre-filled; press Send (free, manual)           |
| WhatsApp   | **Resend**                                                    | Puts the message back in the queue                                                   |

## Gate staff

| Where     | Button                              | What happens                                             |
| --------- | ----------------------------------- | -------------------------------------------------------- |
| Gate scan | Event dropdown                      | Chooses which live event you are scanning for            |
| Gate scan | **Entry / Exit**                    | Mode for the next scan                                   |
| Gate scan | **Check in / Check out** (or Enter) | Checks the typed or pasted ticket code or QR link        |
| Gate scan | **Scan with camera**                | Uses the phone camera (only on browsers that support it) |

Scan results: Entry allowed · Exit recorded · Already inside (scan at exit first) · Never entered (scan at entry first) · Already exited (scan at entry to re-enter) · Ticket not found · Ticket is for a different event · Ticket is cancelled · Event is not open for entry. Re-entry is allowed: exit, then entry again.
