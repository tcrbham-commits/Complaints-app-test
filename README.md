# Complaints App

A simple, phone-friendly web app that lets sales reps log a customer complaint with photos in under a minute. Each complaint is emailed to an Outlook mailbox with the photos attached and the details laid out in the same order as the Sage CRM case screen, ready for someone to file in Sage CRM.

## What reps see

- One short form: their name and email (remembered on the device), customer, account/order number, problem type, priority, a one-line summary and the full description.
- **Take photo** opens the phone camera directly. **Gallery** picks existing images. Up to 5 photos.
- Photos are resized in the browser (max 1600px JPEG), so uploads are quick on mobile data and emails stay small.
- After sending they get a reference number, e.g. `CMP-20261023-3F9A1C`.
- It can be added to the home screen and opens like an app.

## What arrives in Outlook

**Subject:** `[Complaint] High - Acme Ltd - Damaged goods (CMP-20261023-3F9A1C)`

**Body**, top section in Sage CRM case-screen order so it can be entered top to bottom:

```
CASE DETAILS (Sage CRM)
Company: Acme Ltd
Account number: ACME01
Person: Jo Buyer
Phone: 0121 000 0000
Customer ref (order / invoice no.): INV-123
Product: Widget 3000
Problem type: Damaged goods
Priority: High
Description: 3 pallets arrived crushed

Problem note:
Three of the five pallets were crushed on arrival...

SUBMITTED BY
Reference: CMP-20261023-3F9A1C
Submitted: 2026-10-23 14:05 UTC
Sales rep: Sam Rep
Rep email: sam@yourcompany.com
Photos attached: 2
```

- **Description** is the rep's one-line summary. If they leave it blank, it's the first 80 characters of the problem note, because Sage's case Description is a short field.
- Empty fields are left out.
- Photos are named `<reference>-1.jpg`, `<reference>-2.jpg`, and so on.
- **Reply-To** is the rep, so replies go straight to them.

### Filing it in Sage CRM

1. In Outlook, an optional rule can move emails with `[Complaint]` in the subject into their own folder, giving you a queue.
2. Open the email and create the case on the company in Sage CRM, copying the case details in order. With Sage CRM's Outlook integration installed, file the email (and its photos) against the company or case.
3. Put the app's reference (`CMP-…`) in the case so the two can be matched up.

## Setup

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # then fill in CRM_EMAIL, FROM_EMAIL and the SMTP settings
npm start              # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `CRM_EMAIL` | **Required.** The Outlook mailbox complaints are sent to (a shared mailbox is best) |
| `FROM_EMAIL` | **Required.** Sender address; your SMTP account must be allowed to send as it |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Outgoing mail server (Microsoft 365, Gmail app password, SendGrid, etc.) |
| `CC_EMAILS` | Optional extra recipients, comma-separated |
| `APP_ACCESS_CODE` | Optional shared team code. Reps enter it once per device. Recommended if the app is on the public internet |
| `PROBLEM_TYPES`, `PRIORITIES` | Dropdown values, comma-separated. Copy them from your Sage CRM case screen. Defaults: a starter list of problem types, and Sage's standard `Low,Normal,High` |
| `DEFAULT_PRIORITY` | Pre-selected priority (default: the middle one) |
| `SUBJECT_PREFIX` | Default `[Complaint]`. Useful for Outlook rules |
| `MAX_FILES`, `MAX_FILE_SIZE_MB` | Photo limits (defaults: 5 photos, 8 MB each) |

### Sending through Microsoft 365

Use `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, and an account that is allowed to send, for example `complaints-app@yourcompany.com`. Microsoft 365 often has **SMTP AUTH** switched off. An admin can switch it on for just that mailbox in the Microsoft 365 admin centre (Users → the user → Mail → Manage email apps → Authenticated SMTP).

## Deploying

The app is a single Node process with no database. Deploy it to any Node host (Azure App Service, Render, Railway, Fly.io, an internal server), set the environment variables above, and serve it over **HTTPS** (phones need HTTPS for the camera and home-screen install). Then share the URL with the team.

## Tests

```bash
npm test
```
