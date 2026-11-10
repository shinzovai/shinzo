# SHINZO Panel — A4 Sample Document Studio

A complete Next.js 15 admin/editor web application to manage a private, watermarked, **unofficial demonstration** overlay for an uploaded A4 JPG or PNG. It does not create or validate a governmental trademark registration.

## Features

- **Admin:** username is `shinzo` by default, password set securely by deployment owner.
- **Editor roles:** separate login credentials, quota for PDF exports, access expiry, enable/disable, password reset, and reset usage.
- **Admin template manager:** JPG/PNG upload (10 MB maximum), field positioning by clicking the A4 preview, size and font controls.
- **Editor workspace:** registration number, file number, registration date, PNG/JPG logo, A4 live preview, and server-generated A4 PDF.
- **Persistent local SQLite database:** users, server-side sessions, settings, and export logs (using Node.js 22's built-in SQLite).
- **PDF production on the server:** permissions and quota are checked server-side. PDFs contain a conspicuous watermark and a top/bottom disclaimer.
- **Secure by default:** password hashes, random HTTP-only session cookies, role-gated endpoints, authenticated template downloads, and basic login throttling.

## Quick start

Requires **Node.js 22.13+** (the app uses built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local
```

Open `.env.local`, set:

```ini
ADMIN_USERNAME=shinzo
ADMIN_PASSWORD=YOUR_OWN_SECRET_PASSWORD_AT_LEAST_12_CHARACTERS
DATA_DIR=./data
```

Then:

```bash
npm run dev
```

Visit **http://localhost:3000** and log in as `shinzo` with your own password.

## Basic workflow

1. **Admin** logs in and opens **Template manager**; the supplied JPG is already in place as the default.
2. Admin may replace the JPG later using the upload control (admin only).
3. Admin selects **Registration number**, **File number**, **Registration date**, and **Logo image** and clicks the page to place each slot. Controls adjust slot width, height, and font size. Click **Save layout positions**.
4. Admin opens **Access management**, creates editor logins, and sets the number of PDF exports and expiry date.
5. Editor logs in, changes the three text values, uploads a logo, views the A4 preview, and downloads a watermarked demonstration PDF.
6. Admin can disable or extend individual editor accounts.

## Important limitations

- The provided **107580.jpg** image has been bundled as `assets/canadian-reference.jpg` and is installed automatically on first server startup. Admin can replace it later; editors cannot.
- Editing a scan by overlay means the original image isn't changed. Text/logo are drawn over configurable white masks, and the underlying source stays intact.
- The app is for **clearly labelled samples only**. The large `SAMPLE - NOT VALID` watermark, header, and footer are hard-coded in both the page preview and the server-generated PDF and are not optional.
- The supplied JPG has been pre-aligned for registration number, file number, registration date, and the lower round logo. The user also requested a logo slot. Owner and class are not part of this editor's first-page field list.
- Example text labels in the editor are prefilled for visual alignment; they are not independently verified trademark data.
- The original user-supplied JPG is included only as a **reference background**. All generated altered-page PDFs and previews include an inescapable, prominent SAMPLE/NOT VALID marking. No governmental endorsement is implied.
- Built-in SQLite currently prints an experimental API notice in some Node 22 versions. If you deploy to a serverless platform, migrate the database to a persistent managed database; local SQLite requires a writable durable volume.
- For a commercial internet deployment, add HTTPS, robust rate limiting via Redis/proxy, 2FA, backups, and audit/security reviews. Do not expose development mode to the public internet.

## Key project files

- `app/page.tsx` — Login, admin panel, editor controls, and A4 visual preview.
- `app/globals.css` — Responsive design.
- `app/api/admin/*` — Role-protected editor and template management endpoints.
- `app/api/export/route.ts` — PDF generation and server-side quota enforcement.
- `lib/pdf.ts` — A4 layout, editable slots, and permanent demo watermark.
- `lib/db.ts` — SQLite database, user management, and sessions.

## Security notes

- Keep `.env.local` secret and never commit it to source control.
- Do not use weak default credentials. The system only seeds the admin when `ADMIN_PASSWORD` has 12+ characters and is not the example placeholder.
- The quota measures successful server-side download requests; it is not a DRM system and downloaded PDFs can be copied.
- To change the seeded admin password after the initial setup, update the admin hash in a controlled migration. Editing `.env.local` alone doesn't reset an existing account.

© SHINZO — Sample document studio. No government endorsement.

## Supplied image and calibrated overlay spots

Source file: `assets/canadian-reference.jpg` (original 1187 × 1536 pixels). It is placed within A4 without cropping or stretching (fit: contain), so small white margins above and below are expected.

Overlay coordinates in `lib/types.ts` have already been calibrated against that image:

| Field | X center (%) | Y center (%) | Width (%) | Height (%) |
|---|---:|---:|---:|---:|
| Registration number | 31.4 | 81.0 | 13.0 | 2.2 |
| File number | 28.7 | 84.25 | 9.0 | 2.2 |
| Registration date | 84.8 | 81.0 | 15.0 | 2.3 |
| Lower round logo | 50.0 | 64.9 | 26.0 | 19.7 |

If the Admin uploads a replacement JPG with different margins/cropping, fine-tune the positions in **Template manager** and save them. No separate upload is needed to use the supplied image. The source JPG is not altered.
