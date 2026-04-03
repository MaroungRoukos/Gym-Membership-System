# Gym Membership Management System

Centralized member and subscription data with a **Django REST API** (admin-only JWT) and a **Next.js** administrator dashboard.

## Features

- **Administrator-only API** (`is_staff` Django users obtain JWT; non-staff users are rejected at login).
- **Members**: create, read, update, delete; search by **name** or **ID number**.
- **Plans**: monthly, quarterly, yearly — `end_date` is computed from `start_date` + plan when you omit a custom end date.
- **Status**: each record exposes `membership_status` (`active` / `expired`); list filtering with `?status=active` or `?status=expired`.

## Backend (Django)

```text
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser  # mark “Staff status” so JWT login works
python manage.py runserver
```

API base: `http://127.0.0.1:8000`

- `POST /api/auth/login/` — body: `{"username","password"}` → `access`, `refresh`
- `POST /api/auth/refresh/` — body: `{"refresh"}`
- `GET /api/members/?search=…&status=active|expired`
- `POST /api/members/`, `GET/PATCH/DELETE /api/members/<id>/`

Optional environment variables: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` (comma-separated; default includes `http://localhost:3000`).

## Frontend (Next.js)

Requires [Node.js](https://nodejs.org/) (LTS). If `npx` is not on your PATH, install Node or fix PATH, then:

```text
cd frontend
copy .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Sign in with the **staff** superuser you created.

Set `NEXT_PUBLIC_API_URL` in `.env.local` if the API is not on `http://127.0.0.1:8000`.

## Security notes

- Change `DJANGO_SECRET_KEY` and use HTTPS in production.
- Prefer storing tokens in httpOnly cookies for production instead of `localStorage`.
- Restrict `CORS_ALLOWED_ORIGINS` to your real admin origin.
