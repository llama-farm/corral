"""
corral-validate: Minimal session validation for Corral/Better Auth.

Reads the shared Better Auth database directly. Zero dependencies beyond
stdlib (sqlite3) or psycopg2 for PostgreSQL.

## Auto-spawn auth server
    By default, CorralValidator will auto-spawn `node server/auth.js` as a
    managed subprocess so that login/signup endpoints are available. Session
    validation itself reads the DB directly and works without the auth server.
    Pass `auth_server=False` to skip (e.g. production/Docker where Node runs
    separately). Configure port via CORRAL_AUTH_PORT env var (default 3456)
    and server path via CORRAL_AUTH_SERVER env var.

## FastAPI
    from corral_validate import corral_auth_dependency
    auth = corral_auth_dependency("/data/auth.db")

    @app.get("/me")
    def me(user=Depends(auth)):
        return {"email": user.email}

## Flask
    from corral_validate import corral_auth_middleware
    corral_auth_middleware(app, "/data/auth.db")

    @app.route("/me")
    def me():
        return {"email": g.corral_user.email}

## Django (settings.py)
    MIDDLEWARE = ["corral_validate.CorralMiddleware", ...]
    CORRAL_DB_PATH = "/data/auth.db"
"""

from __future__ import annotations

import atexit
import logging
import os
import signal
import sqlite3
import subprocess
import threading
import time as _time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.request import urlopen
from urllib.error import URLError

__all__ = [
    "User", "CorralValidator", "corral_auth_dependency",
    "corral_auth_middleware", "CorralMiddleware",
]

PLAN_LEVELS = {"free": 0, "pro": 1, "team": 2, "enterprise": 3}
COOKIE_NAME = "better-auth.session_token"

SESSION_SQL = """
    SELECT s."userId", s."expiresAt"
    FROM "session" s WHERE s."token" = ?
"""
USER_SQL = """
    SELECT u."id", u."email", u."name", u."plan", u."role",
           u."emailVerified", u."createdAt"
    FROM "user" u WHERE u."id" = ?
"""

logger = logging.getLogger("corral_validate")


@dataclass
class User:
    id: str
    email: str
    name: Optional[str]
    plan: str
    role: str
    emailVerified: bool
    createdAt: str


class CorralValidator:
    """Validate Better Auth sessions against the shared database.

    Args:
        db_path_or_url: SQLite file path or PostgreSQL DSN.
        db_type: "sqlite" (default) or "postgres".
        auth_server: If True (default), auto-spawn the Node auth server
            as a managed subprocess. Set False in production/Docker where
            Node runs separately via supervisord etc.
    """

    def __init__(self, db_path_or_url: str, db_type: str = "sqlite", auth_server: bool = True):
        self.db_path = db_path_or_url
        self.db_type = db_type
        self._auth_proc: Optional[subprocess.Popen] = None
        self._auth_lock = threading.Lock()
        self._shutting_down = False

        if auth_server:
            self._start_auth_server()

    def _find_auth_server(self) -> Optional[str]:
        """Locate server/auth.js by env var or walking up from db_path."""
        env_path = os.environ.get("CORRAL_AUTH_SERVER")
        if env_path:
            return env_path if os.path.isfile(env_path) else None

        # Walk up from db_path looking for server/auth.js
        current = Path(self.db_path).resolve().parent
        for _ in range(10):
            candidate = current / "server" / "auth.js"
            if candidate.is_file():
                return str(candidate)
            parent = current.parent
            if parent == current:
                break
            current = parent
        return None

    def _start_auth_server(self) -> None:
        """Spawn the Node auth server as a managed subprocess."""
        auth_port = os.environ.get("CORRAL_AUTH_PORT", "3456")
        server_path = self._find_auth_server()

        if not server_path:
            logger.warning(
                "[corral-auth] server/auth.js not found — auth operations "
                "(login/signup) won't work, but session validation still works"
            )
            return

        # Check if node is available
        try:
            subprocess.run(["node", "--version"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            logger.warning(
                "[corral-auth] Node.js not installed — skipping auth server spawn"
            )
            return

        env = {**os.environ, "AUTH_PORT": auth_port}

        try:
            self._auth_proc = subprocess.Popen(
                ["node", server_path],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except OSError as e:
            logger.warning("[corral-auth] Failed to spawn auth server: %s", e)
            return

        # Pipe stdout/stderr to logging in background threads
        def _pipe_log(stream, level):
            try:
                for line in stream:
                    text = line.decode("utf-8", errors="replace").rstrip()
                    if text:
                        logger.log(level, "[corral-auth] %s", text)
            except Exception:
                pass

        threading.Thread(
            target=_pipe_log, args=(self._auth_proc.stdout, logging.INFO),
            daemon=True, name="corral-auth-stdout",
        ).start()
        threading.Thread(
            target=_pipe_log, args=(self._auth_proc.stderr, logging.WARNING),
            daemon=True, name="corral-auth-stderr",
        ).start()

        # Health check
        url = f"http://localhost:{auth_port}/api/auth/ok"
        deadline = _time.monotonic() + 5.0
        healthy = False
        while _time.monotonic() < deadline:
            try:
                resp = urlopen(url, timeout=1)
                if resp.status == 200:
                    healthy = True
                    break
            except (URLError, OSError):
                pass
            _time.sleep(0.1)

        if healthy:
            logger.info("[corral-auth] Auth server ready on port %s (pid %d)", auth_port, self._auth_proc.pid)
        else:
            logger.warning("[corral-auth] Auth server health check failed after 5s — it may still be starting")

        # Register cleanup
        atexit.register(self._stop_auth_server)
        # Handle signals (only in main thread)
        try:
            original_sigterm = signal.getsignal(signal.SIGTERM)
            original_sigint = signal.getsignal(signal.SIGINT)

            def _handle_signal(signum, frame):
                self._stop_auth_server()
                # Call original handler
                orig = original_sigterm if signum == signal.SIGTERM else original_sigint
                if callable(orig) and orig not in (signal.SIG_DFL, signal.SIG_IGN):
                    orig(signum, frame)
                elif orig == signal.SIG_DFL:
                    signal.signal(signum, signal.SIG_DFL)
                    os.kill(os.getpid(), signum)

            signal.signal(signal.SIGTERM, _handle_signal)
            signal.signal(signal.SIGINT, _handle_signal)
        except ValueError:
            # Not in main thread — signals can't be set, atexit is enough
            pass

    def _stop_auth_server(self) -> None:
        """Gracefully shut down the auth server subprocess."""
        with self._auth_lock:
            if self._shutting_down or self._auth_proc is None:
                return
            self._shutting_down = True
            proc = self._auth_proc
            self._auth_proc = None

        if proc.poll() is not None:
            return

        logger.info("[corral-auth] Stopping auth server (pid %d)", proc.pid)
        try:
            proc.terminate()  # SIGTERM
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()  # SIGKILL
                proc.wait(timeout=2)
        except OSError:
            pass

    def _connect(self):
        if self.db_type == "postgres":
            try:
                import psycopg2
            except ImportError:
                raise RuntimeError("psycopg2 required for PostgreSQL support")
            return psycopg2.connect(self.db_path)
        return sqlite3.connect(self.db_path)

    def _query(self, sql: str, params: tuple):
        # PostgreSQL uses %s placeholders
        if self.db_type == "postgres":
            sql = sql.replace("?", "%s")
        conn = self._connect()
        try:
            cur = conn.cursor()
            cur.execute(sql, params)
            return cur.fetchone()
        finally:
            conn.close()

    def validate_session(self, token: str) -> Optional[User]:
        """Look up session by token, check expiry, return User or None."""
        row = self._query(SESSION_SQL, (token,))
        if not row:
            return None
        user_id, expires_at = row
        # Handle both string and datetime expiry
        if isinstance(expires_at, str):
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        else:
            exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return None
        return self.get_user_by_id(user_id)

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Fetch a user by ID."""
        row = self._query(USER_SQL, (user_id,))
        if not row:
            return None
        return User(
            id=row[0], email=row[1], name=row[2],
            plan=row[3] or "free", role=row[4] or "user",
            emailVerified=bool(row[5]), createdAt=str(row[6]),
        )

    @staticmethod
    def require_plan(user: User, plan: str) -> bool:
        """Check if user's plan meets the minimum required plan."""
        return PLAN_LEVELS.get(user.plan, 0) >= PLAN_LEVELS.get(plan, 0)


def _extract_token(request) -> Optional[str]:
    """Extract token from cookie or Authorization header (generic)."""
    # Try cookie
    token = None
    cookies = getattr(request, "cookies", None) or {}
    if isinstance(cookies, dict):
        token = cookies.get(COOKIE_NAME)
    # Try Authorization header
    if not token:
        auth = None
        headers = getattr(request, "headers", {})
        if hasattr(headers, "get"):
            auth = headers.get("authorization") or headers.get("Authorization")
        if auth and auth.startswith("Bearer "):
            token = auth[7:]
    return token


# --- FastAPI ---

def corral_auth_dependency(db_path: str, db_type: str = "sqlite", auth_server: bool = True):
    """Return a FastAPI dependency that validates the session.

    Usage:
        auth = corral_auth_dependency("/data/auth.db")
        @app.get("/me")
        def me(user=Depends(auth)):
            return {"email": user.email}
    """
    validator = CorralValidator(db_path, db_type, auth_server=auth_server)

    async def dependency(request):
        from fastapi import HTTPException
        token = _extract_token(request)
        if not token:
            raise HTTPException(401, "No session token")
        user = validator.validate_session(token)
        if not user:
            raise HTTPException(401, "Invalid or expired session")
        return user

    return dependency


# --- Flask ---

def corral_auth_middleware(app, db_path: str, db_type: str = "sqlite", auth_server: bool = True):
    """Register a Flask before_request hook that sets g.corral_user.

    Usage:
        corral_auth_middleware(app, "/data/auth.db")
        # then in any route: g.corral_user
    """
    validator = CorralValidator(db_path, db_type, auth_server=auth_server)

    @app.before_request
    def _validate():
        from flask import request, g, abort
        token = _extract_token(request)
        if not token:
            g.corral_user = None
            return
        g.corral_user = validator.validate_session(token)


# --- Django ---

class CorralMiddleware:
    """Django middleware: sets request.corral_user.

    settings.py:
        MIDDLEWARE = ["corral_validate.CorralMiddleware", ...]
        CORRAL_DB_PATH = "/data/auth.db"
        CORRAL_DB_TYPE = "sqlite"  # optional
        CORRAL_AUTH_SERVER = False  # optional, default True
    """

    def __init__(self, get_response):
        self.get_response = get_response
        from django.conf import settings
        self.validator = CorralValidator(
            getattr(settings, "CORRAL_DB_PATH", "auth.db"),
            getattr(settings, "CORRAL_DB_TYPE", "sqlite"),
            auth_server=getattr(settings, "CORRAL_AUTH_SERVER", True),
        )

    def __call__(self, request):
        token = _extract_token(request)
        request.corral_user = self.validator.validate_session(token) if token else None
        return self.get_response(request)
