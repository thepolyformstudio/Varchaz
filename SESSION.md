# Project: Varchaz — Session Memory

## Stack & Architecture
- **Frontend**: React + Vite + TypeScript (Deployed on Firebase Hosting: `https://varchaz-app.web.app`)
- **Cloud Functions**: Firebase Functions Node.js/TypeScript (`functions/src/index.ts`)
- **Email Microservice**: Python FastAPI (`email-service/main.py` deployed on Vercel/Render)
- **Database**: Firebase Firestore (`firestore.rules` updated for `automailerEmail`)

## Daily Auto Mailer Configuration & Rules
1. **Sender Email Identity**:
   - **`Varchaz Reports <varchazreport@gmail.com>`**
   - Configured via Gmail SMTP (`smtp.gmail.com:587`) using App Password.

2. **Schedule & Timing**:
   - Automated Daily Trigger: Every day at **8:00 PM IST (20:00 Asia/Kolkata)** via Pub/Sub Cloud Function `scheduledDailyReport`.
   - On-Demand Manual Trigger: Admin/Supervisor trigger via `sendDailyReportNow`.

3. **Supervisor Automailer Target Email Management**:
   - **Field**: `automailerEmail?: string` on `users/{userId}` Firestore document.
   - **UI**: Managed in `TeamManagementPage.tsx` (`/supervisor/team`).
   - **Permissions**: Visible & editable exclusively by Supervisors and Admins.
   - **Security Rules**: `firestore.rules` updated to include `automailerEmail` in `onlyUpdatedFields`.

4. **Dual Auto Mailer Email Formats**:
   - **Type A (Consolidated Team Report)**:
     - **Email Body**: App-styled HTML table for **Consolidated MTD Plan vs. Achievement**.
     - **Attachment**: `.xlsx` workbook with 2 sheets (Sheet 1: Consolidated MTD, Sheet 2: Consolidated YTD).
     - **Recipients**: TO Supervisor + All Team Members (using Supervisor-configured `automailerEmail`s; restricted to `user` and `supervisor` roles only).
   - **Type B (Individual User Report)**:
     - **Email Body**: App-styled HTML table for **User MTD Plan vs. Achievement**.
     - **Attachment**: `.xlsx` workbook with 2 sheets (Sheet 1: User MTD, Sheet 2: User YTD).
     - **Recipients**: TO Particular User (`automailerEmail`), CC Supervisor (`automailerEmail`); restricted to `user` and `supervisor` roles only (Viewer & Admin IDs excluded).
