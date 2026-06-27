# Varchaz

**Mobile-first daily sales reporting and performance tracking PWA.**

Varchaz collects daily sales entries against a configurable product list, stores monthly plans and daily achievements, and shows selected-day, MTD, and YTD performance against plan at both individual and consolidated hierarchy levels.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Vanilla CSS with design tokens |
| Backend | Firebase (Auth, Firestore, Hosting) |
| Functions | Firebase Cloud Functions (Node 18) |
| PWA | vite-plugin-pwa (Workbox) |
| Export | jsPDF + SheetJS (xlsx) |
| Icons | Lucide React |

## Features

- **4 roles**: User, Supervisor, Viewer, Admin
- **Daily sales reporting** with product-wise entry
- **Monthly plan entry** with repeat-last-month and plan window (1st–10th)
- **MTD & YTD dashboards** — product-wise plan vs achievement (no proration)
- **Financial year**: April–March (configurable)
- **Supervisor consolidated views** with user drill-down
- **Approval workflow** for user registration
- **Inactive product detection** (MTD & YTD)
- **PDF & Excel export** on all performance tables
- **Dark/Light theme** with system preference detection
- **Offline support** via Firestore persistence + service worker
- **Installable PWA** (Add to Home Screen)

## Getting Started

### Prerequisites
- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with **Authentication** and **Firestore** enabled

### Setup

```bash
# 1. Clone and install
cd Varchaz
npm install

# 2. Update Firebase config
# Edit src/config/firebase.ts with your project's config values

# 3. Enable Firebase services in console:
#    - Authentication → Email/Password
#    - Firestore Database → Create in production mode

# 4. Deploy Firestore rules & indexes
firebase deploy --only firestore

# 5. Run locally
npm run dev

# 6. (Optional) Seed initial data
cd scripts && npx ts-node seed.ts
```

### Deploy

```bash
# Build for production
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting

# Deploy Cloud Functions
cd functions && npm install && npm run build
firebase deploy --only functions
```

## Project Structure

```
Varchaz/
├── public/                 # PWA icons & static assets
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── auth/           # ProtectedRoute
│   │   ├── dashboard/      # SummaryCard, PerformanceTable, DatePicker
│   │   ├── layout/         # AppShell (sidebar, topbar, bottom nav)
│   │   └── shared/         # Toast, Loading, EmptyState, ErrorBoundary
│   ├── config/             # Firebase configuration
│   ├── contexts/           # AuthContext, ThemeContext
│   ├── pages/
│   │   ├── admin/          # Admin dashboard & management pages
│   │   ├── public/         # Login, Register, ForgotPassword, About
│   │   ├── supervisor/     # Team dashboards, approvals, plan override
│   │   ├── user/           # User home, daily report, plans, MTD/YTD
│   │   └── viewer/         # Viewer home & supervisor drill-down
│   ├── services/           # Firebase CRUD services
│   ├── styles/             # CSS design system (8 files)
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Date, calculation, format, validation utils
├── functions/              # Firebase Cloud Functions
├── scripts/                # Seed data script
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Composite index definitions
├── firebase.json           # Firebase hosting configuration
└── vite.config.ts          # Vite + PWA configuration
```

## Calculation Logic

| View | Plan | Achievement |
|---|---|---|
| **FTD (Day)** | No plan comparison | Daily sales per product |
| **MTD** | Current month's full plan per product | Sum of daily sales from month start to today |
| **YTD** | Sum of full monthly plans per product (FY start → current month) | Sum of all daily sales (FY start → today) |

> All comparisons are **product-wise**. Grand Total is for display only.

## License

Private — All rights reserved.
