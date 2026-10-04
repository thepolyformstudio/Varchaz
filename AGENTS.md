# Workspace Rules & Instructions: Varchaz

## Email Reporting & Notification Rules

### 1. Strict Recipient Rule for Daily Email Reports
- **DO NOT SEND DAILY EMAIL REPORTS TO ADMIN**:
  - Never send daily email reports to admin accounts.
  - Daily reports must **ALWAYS** be sent **TO active users (`role === 'user'`)** with **CC to their supervisor (`role === 'supervisor'`)**.
  - Admin accounts (`role === 'admin'`) and Viewers (`role === 'viewer'`) must be strictly excluded from all daily email recipient lists (both TO and CC), including:
    1. Daily 4 Product Group MTD MIS reports (`generateAndSendProductGroupReports`).
    2. Weekly/Daily MTD Plan vs. Achievement consolidated & individual reports (`generateAndSendDailyReport`).
    3. Morning user performance nudges (`generateAndSendMorningUserNudges`).
