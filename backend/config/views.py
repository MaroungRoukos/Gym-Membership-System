from django.http import HttpResponse


def root(request):
    """Home page for the API — browsers opening / are not left with a 404."""
    html = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gym Membership API</title>
  <style>
    :root {
      --bg: #0f1419;
      --card: #1a2332;
      --border: #2d3a4d;
      --text: #e7ecf1;
      --muted: #94a3b8;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      min-height: 100vh;
      line-height: 1.5;
    }
    .wrap { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.5rem; letter-spacing: -0.02em; }
    .sub { color: var(--muted); font-size: 0.95rem; margin: 0 0 1.75rem; }
    .grid { display: grid; gap: 1rem; }
    @media (min-width: 520px) { .grid { grid-template-columns: 1fr 1fr; } }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 1.35rem;
    }
    .card h2 {
      font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--muted); margin: 0 0 0.75rem;
    }
    a.btn {
      display: inline-block;
      background: var(--accent);
      color: #fff !important;
      text-decoration: none;
      font-weight: 500;
      font-size: 0.9rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      margin-top: 0.35rem;
    }
    a.btn:hover { background: var(--accent-hover); }
    a.link { color: var(--accent); text-decoration: none; font-weight: 500; }
    a.link:hover { text-decoration: underline; }
    code {
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 0.12rem 0.4rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .list { margin: 0; padding: 0; list-style: none; }
    .list li { padding: 0.4rem 0; border-top: 1px solid var(--border); font-size: 0.9rem; }
    .list li:first-child { border-top: 0; padding-top: 0; }
    footer { margin-top: 2rem; font-size: 0.8rem; color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Gym membership API</h1>
    <p class="sub">Backend is running. Use the admin site, the API with a JWT, or the Next.js dashboard.</p>

    <div class="grid">
      <div class="card">
        <h2>For browsers</h2>
        <p style="margin:0 0 0.75rem; font-size:0.9rem; color:var(--muted);">
          Staff account required — manage members and payments in the database.
        </p>
        <a class="btn" href="/admin/">Open Django admin</a>
      </div>
      <div class="card">
        <h2>Instructor dashboard</h2>
        <p style="margin:0 0 0.75rem; font-size:0.9rem; color:var(--muted);">
          Full UI: login, members, payments, search.
        </p>
        <a class="btn" href="http://localhost:3000/">Open app (localhost:3000)</a>
        <p style="margin:0.75rem 0 0; font-size:0.8rem; color:var(--muted);">
          Start it with: <code>cd frontend</code> then <code>npm run dev</code>
        </p>
      </div>
    </div>

    <div class="card" style="margin-top: 1rem;">
      <h2>API (JSON, Bearer token)</h2>
      <p style="margin:0 0 0.75rem; font-size:0.9rem; color:var(--muted);">
        Base URL: <code>__API_BASE__</code>
        — get a JWT with <code>POST /api/auth/login/</code> first.
      </p>
      <ul class="list">
        <li>
          <strong>Members</strong> <a class="link" href="/api/members/">/api/members/</a>
        </li>
        <li>
          <strong>Dashboard stats</strong> <a class="link" href="/api/dashboard/">/api/dashboard/</a>
        </li>
        <li>
          <strong>Payments</strong> <a class="link" href="/api/payments/">/api/payments/</a>
        </li>
      </ul>
    </div>

    <footer>
      This page is only a landing screen; the instructor workflow runs on the Next.js app.
    </footer>
  </div>
</body>
</html>
"""
    api_base = request.build_absolute_uri("/api/")
    return HttpResponse(html.replace("__API_BASE__", api_base))
