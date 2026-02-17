# Corral Docker Deployment

## The "Nobody Sees Node" Principle

Corral runs a tiny Node.js auth server (~40 lines of Express) alongside your backend. **Only your backend port is exposed.** The Node auth server lives on internal port 3456 — invisible to the outside world. Your backend talks to it via `AUTH_URL=http://localhost:3456`.

```
Internet → :8000 (your backend) → localhost:3456 (Corral auth, internal only)
```

## Deployment Patterns

### 1. Single Container (Dockerfile + supervisord)

Best for: VPS, any Docker host, simplest production setup.

```bash
docker build -t myapp .
docker run -p 8000:8000 -v corral_data:/app/data --env-file .env myapp
```

Supervisord runs both processes in one container. Tini handles PID 1 signals. Both processes log to stdout for `docker logs`.

### 2. PaaS (Procfile)

Best for: Railway, Fly.io, Heroku.

- **Fly.io**: Uses `fly.toml` + `Dockerfile`. Run `fly launch`, then `fly volumes create corral_data`.
- **Railway**: Uses `railway.json` + `Dockerfile`. Push and go.
- **Heroku**: Uses `Procfile`. Both processes run in one dyno.

### 3. Docker Compose (Local Dev)

Best for: Development with hot reload.

```bash
docker compose up
```

Source code is mounted as volumes so changes are picked up live. SQLite data persists in a named volume.

### 4. Nginx Reverse Proxy (Optional)

For production deployments wanting a single HTTPS entry point:

- `/api/auth/*` → Node auth server (port 3456)
- Everything else → Your backend (port 8000)

Use this when you want to expose auth endpoints directly (e.g., for client-side auth flows) while keeping a single domain.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AUTH_PORT` | `3456` | Port for the Corral auth server (internal) |
| `AUTH_URL` | `http://localhost:3456` | URL your backend uses to reach auth |
| `PORT` | `8000` | Port your backend listens on |
| `CORRAL_DB_PATH` | `/app/data/corral.db` | SQLite database path |
| `CORRAL_SECRET` | — | Auth signing secret (required) |

## Template Variables

Files use `<PLACEHOLDER>` syntax, replaced by `corral init`:

- `{{BACKEND_LANG}}` — python, go, rust, ruby
- `{{BACKEND_SRC}}` — source directory (e.g., `app/`, `src/`)
- `{{PYTHON_MODULE}}` — Python module path (e.g., `app.main`)
- `{{GO_MAIN}}` — Go main package path
- `{{RUST_BIN}}` — Rust binary name
- `{{RUBY_CMD}}` — Ruby start command
- `{{APP_NAME}}` — Application name
- `{{SERVER_NAME}}` — Domain name for nginx
