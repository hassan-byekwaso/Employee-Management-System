# Orbit People — Employee Management System

A full-stack employee management application with role-based access for Admin, HR Manager, and Employee users. The Vite/React client is in `client/`; the Express/Mongoose API is in `server/`.

## Features

- Short-lived JWT access tokens with rotating refresh tokens in HTTP-only cookies.
- Kenya-localized salary and payroll amounts displayed in Kenyan Shillings (KES).
- Payroll runs calculate and itemize Kenyan NSSF, SHIF, Affordable Housing Levy, and PAYE deductions.
- Server-side role enforcement and role-aware client routes.
- Employee and department records, attendance check-in/out and reports, leave workflows and balances, payroll runs and payslips, performance reviews and goals.
- Dashboard KPIs, department headcount, recent activity, daily missing-attendance reminders, in-app notifications, and downloadable CSV reports.
- Responsive layouts for desktop and mobile.

## Demo accounts

The development seed creates the following accounts. Do not use these credentials in a production environment.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@orbitpeople.com` | `Admin123!` |
| HR Manager | `hr@orbitpeople.com` | `Admin123!` |
| Employee | `employee@orbitpeople.com` | `Admin123!` |
| Team Manager | `alex.morgan@example.com` | `Manager123!` |

## Local setup

Prerequisites: Node.js 20 or newer and a reachable MongoDB instance (local MongoDB or MongoDB Atlas).

1. Configure the API:

   ```powershell
   cd server
   Copy-Item .env.example .env
   ```

   Set `MONGODB_URI`, a strong random `JWT_ACCESS_SECRET` (at least 32 characters), and `CLIENT_ORIGIN=http://localhost:5173`. Refresh tokens are opaque, randomly generated values stored hashed in MongoDB, so no refresh signing secret is needed.

2. Install, seed, and run the API:

   ```powershell
   npm install
   npm run seed
   npm run dev
   ```

   The API listens on `http://localhost:5000` by default. It validates required configuration and connects to MongoDB before accepting requests.

3. Configure and run the client in a second terminal:

   ```powershell
   cd client
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

   Open `http://localhost:5173` and sign in with a demo account above. Set `VITE_API_URL` to the API's `/api` URL if it differs from `http://localhost:5000/api`.

To create or refresh sample records, run `npm run seed` in `server/`. Seeding is idempotent and intended for development/demo environments.

## API overview

All API routes are prefixed with `/api`. Protected routes require an authorization header carrying the bearer access token; refresh sessions use the HTTP-only refresh cookie.

| Area | Routes |
|---|---|
| Authentication | `POST /auth/register` (employee self-registration; requires department ID and designation), `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Dashboard | `GET /dashboard` |
| Employees | `GET /employees`, `POST /employees`, `GET /employees/:id`, `PUT /employees/:id`, `DELETE /employees/:id` |
| Departments | `GET /departments`, `POST /departments`, `GET /departments/:id`, `PUT /departments/:id`, `DELETE /departments/:id` |
| Attendance | `GET /attendance`, `POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/:id`, `PUT /attendance/:id`, `DELETE /attendance/:id` |
| Leave | `GET /leave`, `POST /leave`, `GET /leave/balance`, `PATCH /leave/:id/approve`, `PATCH /leave/:id/reject`, `PATCH /leave/:id/cancel` |
| Payroll | `GET /payroll`, `POST /payroll`, `POST /payroll/generate`, `PATCH /payroll/:id/process`, `PATCH /payroll/:id/pay`, `GET /payroll/:id/slip` |
| Performance and goals | `GET/POST /performance`, `PUT/DELETE /performance/:id`, `GET/POST /goals`, `PUT/DELETE /goals/:id` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `POST /notifications/announcement` (Admin/HR) |
| Reports | `GET /reports/employees/csv`, `GET /reports/attendance/csv`, `GET /reports/payroll/csv` |

The API also applies role-specific record visibility and permissions; hiding a client-side control does not grant authorization.

## Deployment

### 1. MongoDB Atlas

1. Create an Atlas project and cluster.
2. Create a database user with a strong password and grant it access to the application database.
3. Configure Network Access to allow the Render service to connect (use Render's outbound IPs where available; avoid unrestricted access when possible).
4. Copy the Atlas connection string and replace the username, password, and database name. Add it as `MONGODB_URI` in Render; do not commit it to source control.

### 2. Render API

1. Create a Render **Web Service** from this repository.
2. Set the **Root Directory** to `server`, **Build Command** to `npm install`, and **Start Command** to `npm start`.
3. Add environment variables:
   - `NODE_ENV=production`
   - `MONGODB_URI` — the Atlas connection string
   - `JWT_ACCESS_SECRET` — a cryptographically random secret of at least 32 characters
   - `CLIENT_ORIGIN` — the deployed Vercel origin (or a comma-separated list of allowed origins)
   - `COOKIE_SECURE=true`
   - `PORT` — normally provided by Render
4. Wait for the service health check/deployment to succeed. The API must complete database connection before listening.
5. Do not run the demo seed in production unless you deliberately want the sample users and records.

### 3. Vercel client

1. Import the repository as a Vercel project.
2. Set the **Root Directory** to `client`, select the Vite framework preset, and use `npm run build` with `dist` as the output directory.
3. Set `VITE_API_URL` to the deployed Render API URL ending in `/api` (for example, `https://your-service.onrender.com/api`).
4. Deploy. `client/vercel.json` rewrites client-side routes to `index.html`.
5. Add the exact Vercel origin to Render's `CLIENT_ORIGIN`. Redeploy the API after changing the value.

For cross-origin production refresh cookies, serve both sites over HTTPS and set `COOKIE_SECURE=true`. The server uses credentialed CORS and `SameSite=None` in production. Keep JWT secrets private, rotate demo credentials before any shared demo, and never expose server environment variables to the client.

## Verification

```powershell
cd server
npm test
npm run check
cd ..\client
npm run build
```

The API tests do not require production credentials. Database integration/seed verification requires a reachable MongoDB URI.
