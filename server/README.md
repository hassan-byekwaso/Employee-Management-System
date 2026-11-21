# Employee Management API

## Run locally

From `server/`, copy `.env.example` to `.env`. Set a MongoDB URI, a random `JWT_ACCESS_SECRET` of at least 32 characters, and the allowed frontend origin(s) in `CLIENT_ORIGIN`. Then run:

```powershell
npm install
npm run seed
npm start
```

The API validates configuration and connects to MongoDB before listening. The seed command is safe to rerun and updates the same demo records. Override individual demo passwords with `SEED_ADMIN_PASSWORD`, `SEED_HR_PASSWORD`, `SEED_MANAGER_PASSWORD`, and `SEED_EMPLOYEE_PASSWORD`.

Seeded demo accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@orbitpeople.com` | `Admin123!` |
| HR Manager | `hr@orbitpeople.com` | `Admin123!` |
| Employee | `employee@orbitpeople.com` | `Admin123!` |
| Team Manager | `alex.morgan@example.com` | `Manager123!` |

These are development-only credentials; change or override them before using any shared or production environment.

## API

All routes are prefixed with `/api`. Protected routes require an authorization header carrying the bearer access token. Login and refresh issue short-lived access tokens and rotate an opaque refresh token in an HTTP-only cookie; requests that need cookies must use credentials. `CLIENT_ORIGIN` is a comma-separated CORS allowlist and trailing slashes are normalized.

- Authentication: `POST /api/auth/register` (employee self-registration), `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Dashboard: `GET /api/dashboard`.
- CRUD collections: `/api/employees`, `/api/departments`, `/api/attendance`, `/api/leave` (also `/api/leaves`), `/api/payroll`, `/api/performance`, `/api/goals`, `/api/notifications`.
- Leave actions: `PATCH /api/leave/:id/approve`, `/reject`, and `/cancel`; balance: `GET /api/leave/balance?year=YYYY`. Configure `ANNUAL_LEAVE_DAYS` to change the default 20-day entitlement.
- Attendance actions: `POST /api/attendance/check-in` and `/check-out`; monthly records use `GET /api/attendance?month=YYYY-MM`.
- Payroll actions: `POST /api/payroll/generate` with a `{ "month": "YYYY-MM" }` body, then `PATCH /api/payroll/:id/process` and `/pay`. Printable salary statements are available at `GET /api/payroll/:id/slip`.
- Notifications: `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`, and Admin/HR announcements at `POST /api/notifications/announcement`.
- CSV downloads: `GET /api/reports/employees/csv`, `/api/reports/attendance/csv`, and `/api/reports/payroll/csv`. Date filters accept `from` and `to`.

Database roles are `admin`, `hr`, `manager`, and `employee`. Admin/HR have organization-wide access; employees are scoped to their own records; managers are scoped to themselves, direct reports, and their teams' departments. Sensitive write actions are role restricted. List endpoints return `{ success, data, pagination }`, except notifications, which also include an unread count.

Run `npm test` for backend utility and HTTP tests, and `npm run check` for entrypoint syntax checks. Database integration requires a reachable MongoDB URI.
