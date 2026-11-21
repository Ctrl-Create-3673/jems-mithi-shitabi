# Mithi Shitabi 2026

Booking and records site for the Mithi Shitabi organised by the Class 10 girls of Jamali English Medium School, Dholka.
Thursday 3 December 2026 (24 Jamadal Ukhra 1448), 7:00 PM, Dholka Masjid Sehen.

- **Parents:** read the invite and menu, book thaals and cards, check their booking with booking ID + mobile.
- **Team (Staff role):** see the dashboard, add walk-in bookings, record cash or online payments, cancel or restore bookings, add expenses.
- **Team (Admin role):** everything above, plus settings (thaal limit, prices, open or close booking), deleting expenses and the activity log.

Event details (date, venue, menu, contacts) live in `js/config.js`. Until `API_URL` is set there, the site runs in **demo mode** with sample data in the browser (team login ITS `11111111` staff or `22222222` admin, password the same).

## Connect it to a Google Sheet (one time)

1. Create a new blank Google Sheet, e.g. **Mithi Shitabi 2026 Records**.
2. Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs` from this repo and save.
3. Run `setupSheets` (approve permissions). Add team logins in the **Team** tab: ITS, Name, Role (`Staff` or `Admin`), Password.
4. Run `selfCheck` and read the log.
5. Deploy → **New deployment** → Web app → Execute as **Me**, Who has access **Anyone** → Deploy. Copy the `/exec` URL.
6. Put the URL in `js/config.js` as `API_URL`, commit and push.

After later changes to `Code.gs`, use Deploy → **Manage deployments** → Edit → **New version** so the URL stays the same.

## The sheet

| Tab | What it holds |
| --- | --- |
| Bookings | One row per booking: ID, who, mobile, thaals, cards, amount due, status (Pending / Partly paid / Paid / Cancelled), amount paid, mode, reference, who received it |
| Expenses | Every purchase, with category, amount and who paid |
| Team | Who can log in: ITS, name shown in records, role (Staff / Admin), password |
| Settings | Thaal price, card price, thaal limit (0 = none), booking open (YES / NO) |
| Audit Log | Every login, booking, payment, edit and cancellation, with who did it |

Cancelled bookings stay in the sheet marked **Cancelled**; nothing is deleted.
