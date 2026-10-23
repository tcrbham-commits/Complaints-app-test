# Complaints App

A simple, phone-friendly web app that lets sales reps log a customer complaint with photos in under a minute. Each complaint is emailed to your CRM's inbound address (for example Salesforce Email-to-Case, HubSpot shared inbox, Dynamics queue or Zoho Desk), with the photos attached and the details in a consistent format.

## What reps see

- One short form: their name and email (remembered on the device), customer, account/order number, category, priority, description.
- **Take photo** opens the phone camera directly. **Gallery** picks existing images. Up to 5 photos.
- Photos are resized in the browser (max 1600px JPEG), so uploads are quick on mobile data and emails stay small.
- After sending they get a reference number, e.g. `CMP-20261023-3F9A1C`.
- It can be added to the home screen and opens like an app.

## What the CRM receives

**Subject:** `[Complaint] High - Acme Ltd - Damaged goods (CMP-20261023-3F9A1C)`

**Body** (plain text and HTML), as `Label: value` lines that a CRM email parser can map to fields:

```
Reference: CMP-20261023-3F9A1C
Submitted: 2026-10-23 14:05 UTC
Sales rep: Sam Rep
Rep email: sam@yourcompany.com
Customer: Acme Ltd
Order / invoice number: INV-123
Category: Damaged goods
Priority: High
Attachments: 2

Description:
Pallet arrived crushed...
```

Attachments are named `<reference>-1.jpg`, `<reference>-2.jpg`, and so on. **Reply-To** is set to the rep, so replies from the CRM go back to them.

## Setup

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # then fill in CRM_EMAIL, FROM_EMAIL and the SMTP settings
npm start              # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `CRM_EMAIL` | **Required.** The CRM inbox that complaints are sent to |
| `FROM_EMAIL` | **Required.** Sender address; your SMTP account must be allowed to send as it |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Outgoing mail server (Microsoft 365, Gmail app password, SendGrid, etc.) |
| `CC_EMAILS` | Optional extra recipients, comma-separated |
| `APP_ACCESS_CODE` | Optional shared team code. Reps enter it once per device. Recommended if the app is on the public internet |
| `SUBJECT_PREFIX` | Default `[Complaint]`. Useful for CRM routing rules |
| `MAX_FILES`, `MAX_FILE_SIZE_MB` | Photo limits (defaults: 5 photos, 8 MB each) |

To change complaint categories, edit `CATEGORIES` in `src/email.js`.

## Deploying

The app is a single Node process with no database. Deploy it to any Node host (Azure App Service, Render, Railway, Fly.io, an internal server), set the environment variables above, and serve it over **HTTPS** (phones need HTTPS for the camera and home-screen install). Then share the URL with the team.

## Tests

```bash
npm test
```
