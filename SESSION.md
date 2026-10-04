# Project: Varchaz — Session Memory

## Stack & Architecture
- **Frontend**: React + Vite + TypeScript (Deployed on Firebase Hosting: `https://varchaz-app.web.app`)
- **Cloud Functions**: Firebase Functions Node.js/TypeScript (`functions/src/index.ts`)
- **Email Microservice**: Python FastAPI (`email-service/main.py` deployed on Vercel/Render)
- **Database**: Firebase Firestore (`firestore.rules` updated for `automailerEmail`)

## Daily Auto Mailer Configuration & Rules
> [!NOTE]
> **Active System: 4 Daily Product Group MTD MIS Emails.**
> Sends 4 separate daily MTD MIS emails every day at **9:00 PM IST (21:00 Asia/Kolkata / 15:30 UTC)** to all active users on their `automailerEmail`.
> - **Product Groups**:
>   1. **Liabilities**: CA, CA MAMC, SA, SA MAMC, IP Value, RFD Value, UFD Nos., UFD Value, Aane Do FD Val.
>   2. **Assets**: Retail Assets + Wholesale Assets combined (Home Loan, LAP, Auto Loan, Personal Loan, Business Loan, Gold Loan, MEG, EEG/BBG, etc.).
>   3. **TPP**: LI, GI/HI, MF, SIP.
>   4. **Others**: Credit Card, Demat/HSL, Payzapp, Smart Wealth, SSS.
> - **Layout & Styling**:
>   - Professional executive MIS table with subtle `#e2e8f0` borders (no harsh black border lines).
>   - Left column displays all active team members/reps (`role === 'user'`; supervisors excluded).
>   - Cells show MTD achieved value if > 0, or clean `Inactive` text strictly isolated inside that cell (no `colspan`, no cell overflow).
>   - Footer Total row sums active achievement values across all reps for each product column.
>   - Dispatched daily via GitHub Actions (`daily-report.yml` on cron `30 15 * * *`) and Cloud Functions (`scheduledDailyProductGroupReports` on cron `0 21 * * *`).

1. **Sender Email Identity**:
   - **`Varchaz Reports <varchazreport@gmail.com>`**
   - Configured via Gmail SMTP (`smtp.gmail.com:587`) using App Password.

2. **Schedule, Timing & Exclusion Day Rules**:
   - **Daily 4 Product Group MIS Emails**: Dispatched daily at **9:00 PM IST (21:00 Asia/Kolkata / 15:30 UTC)**.
   - **Non-Working Day Exclusions (Strictly Paused)**:
     1. All **Sundays**.
     2. **2nd Saturday** of every month.
     3. **4th Saturday** of every month.
   - **Working Days (Dispatched)**: Monday through Friday, plus **1st, 3rd, and 5th Saturdays**.
   - **Recipients**: TO All approved team members (`role === 'user'`) &bull; CC All supervisors (`role === 'supervisor'`) and admins.
   - **On-Demand Manual Trigger**: Admin/Supervisor trigger via `sendProductGroupReportsNow` callable or CLI `node scripts/sendDailyReportCron.cjs --daily-groups`.

3. **Supervisor Automailer Target Email Management**:
   - **Field**: `automailerEmail?: string` on `users/{userId}` Firestore document.
   - **UI**: Managed in `TeamManagementPage.tsx` (`/supervisor/team`).
   - **Permissions**: Visible & editable exclusively by Supervisors and Admins.
   - **Security Rules**: `firestore.rules` updated to include `automailerEmail` in `onlyUpdatedFields`.

4. **Auto Mailer Email Formats**:
   - **Type A (Consolidated Team Report)**:
     - **Email Body**: App-styled HTML table for **Consolidated MTD Plan vs. Achievement**.
     - **Attachment**: `.xlsx` workbook with 2 sheets (Sheet 1: Consolidated MTD, Sheet 2: Consolidated YTD).
     - **Recipients**: TO Supervisor + All Team Members (using Supervisor-configured `automailerEmail`s; restricted to `user` and `supervisor` roles only).
   - **Type B (Individual User Report)**:
     - **Email Body**: App-styled HTML table for **User MTD Plan vs. Achievement**.
     - **Attachment**: `.xlsx` workbook with 2 sheets (Sheet 1: User MTD, Sheet 2: User YTD).
     - **Recipients**: TO Particular User (`automailerEmail`), CC Supervisor (`automailerEmail`); restricted to `user` and `supervisor` roles only (Viewer & Admin IDs excluded).
   - **Type C (Morning User Performance Nudge)**:
     - **Email Body**: Formatted performance nudge with active progress chips, zero-sale product alert chips, and supervisor 4-point reflection questions.
     - **Recipients**: TO Particular User (`role === 'user'`, using `automailerEmail`), **CC Supervisor** (`supervisor.automailerEmail`).

5. **User Dashboard Scheduling (Time-Gated Display)**:
   - **8:00 AM to 5:00 PM IST**: Displays Product Activation & Inactive Product check banners along with supervisor reflection prompts.
   - **After 5:00 PM IST**: The "Business update for the day pending" banner completely replaces the product activation banners (if daily report has not yet been submitted).

6. **Dual Role Architecture (User + Viewer Rights)**:
   - **Mechanism**: A user with primary role `user` can be granted viewer privileges by assigning supervisor IDs into their `assignedSupervisors: string[]` profile array.
   - **Behavior**:
     - Retains full `user` capabilities: daily sales reporting (`/report`), monthly plans (`/plan`), personal MTD/YTD, and morning performance nudges.
     - Automatically gains access to the Viewer Dashboard (`/viewer`), supervisor drill-downs (`/viewer/supervisor/:supervisorId`), and reporting trackers for their assigned supervisor teams.
     - Sidebar dynamically displays the **"Viewer Access"** section with a link to `/viewer`.
     - Route security (`ProtectedRoute.tsx`) and Firestore rules (`isViewer()` check on `assignedSupervisors.size() > 0`) recognize the dual permissions.
     - Managed in Admin UI via **User Management** (`/admin/users`) and **Viewer Management** (`/admin/viewers`).

7. **Daily Commitment & Weekly Consistency Tracking Feature**:
   - **Objective**: Morning motivational commitment popup prompting reps to commit daily planned targets (FTD), tracked against EOD reporting, with weekly consistency scoring and supervisor recognition.
   - **Morning Commitment Modal (`DailyCommitmentModal.tsx`)**:
     - Displays products ordered strictly with **Inactive MTD products first** (`achievement == 0`), followed by products ordered by **MTD achievement % ascending (smallest to largest)**.
     - Enforces selecting a minimum of **5 products** with positive planned values (`committedValue > 0`).
     - Once submitted, commitment is **strictly locked** (read-only) for the day.
     - In View Mode, only displays the **selected/committed products** (uncommitted products are omitted).
   - **Automatic EOD Synchronization**:
     - Every `saveDailySales` call triggers `syncCommitmentWithSales(userId, date, products)`.
     - Automatically calculates item-level achievement, total achieved value, fulfillment %, and `isFulfilled` status.
   - **Fulfillment Calculation & 100% Capping**:
     - Daily fulfillment % can exceed 100% (e.g. 150%).
     - For **Weekly Consistency Scores** (average daily fulfillment over the week), daily fulfillment is **strictly capped at 100%** per user rule to reward steady daily discipline.
   - **Non-Working Days**:
     - Hidden and paused on Sundays, 2nd Saturdays, and 4th Saturdays in IST.
   - **Supervisor Dashboard (`SupervisorHomePage.tsx`)**:
     - Displays today's team commitments with Consolidated and User-Level views (omitting empty products).
     - Shows fulfilled reps with a **1-Click WhatsApp Appreciation Trigger** pre-filled with thank-you message.
   - **Interactive Weekly Pages**:
     - User page: `/commitments` (`UserCommitmentsPage.tsx`)
     - Supervisor page: `/supervisor/commitments` (`SupervisorCommitmentsPage.tsx`) with Excel export.
   - **Weekly Auto-Mailer**:
     - The last working day report includes a dedicated **Weekly Commitments & Consistency** HTML table in email bodies and a dedicated **Weekly Commitments** sheet in both consolidated and user Excel attachments.
