# Project: Varchaz

## Stack
- Frontend: React + Vite + TypeScript
- Backend / Functions: Firebase Cloud Functions (Node.js / TypeScript)
- Email Microservice: Python FastAPI (`email-service/`)
- Database: Firebase Firestore
- Hosting: Firebase Hosting (Frontend) & Vercel/Render (Email API)

## Key Updates & Features Implemented
- **Sender Address**: `Varchaz Reports <varchazreport@gmail.com>`.
- **Supervisor Automailer Control**: Supervisors can view and edit the target Automailer Email ID for themselves and for team members in [TeamManagementPage.tsx](file:///e:/Antigravity/Varchaz/src/pages/supervisor/TeamManagementPage.tsx).
- **Dual-Type Auto Mailer Workflows**:
  1. **Type A (Consolidated Report)**: Formatted **MTD Plan vs Ach** HTML table in email body + 2-sheet Excel file (Consolidated MTD & YTD) sent to **TO: Supervisor + All Team Members**.
  2. **Type B (Individual User Report)**: Formatted **User MTD Plan vs Ach** HTML table in email body + 2-sheet Excel file (User MTD & YTD) sent to **TO: Particular User, CC: Supervisor**.
- **Microservice CC Support**: Updated [main.py](file:///e:/Antigravity/Varchaz/email-service/main.py) to support `cc` recipients and `varchazreport@gmail.com` sender identity.
- **In-Body HTML Table Formatting**: Renders formatted MTD tables in email body with `#1e293b` navy headers, zebra striping, color badges, and bold totals row.
