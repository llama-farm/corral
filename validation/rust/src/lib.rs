//! # corral-validate
//!
//! Minimal session validation for Corral/Better Auth.
//! Reads the shared SQLite database directly via `rusqlite`.
//!
//! ## Auto-spawn auth server
//! By default, set `with_auth_server(true)` on the builder to auto-spawn
//! `node server/auth.js` as a managed child process. Session validation
//! reads the DB directly and works without it. Configure port via
//! `CORRAL_AUTH_PORT` (default 3456) and path via `CORRAL_AUTH_SERVER`.
//!
//! ## Basic usage
//! ```no_run
//! let v = corral_validate::CorralValidator::new("/data/auth.db").unwrap();
//! if let Some(user) = v.validate_session("tok_abc").unwrap() {
//!     println!("Hello, {}", user.email);
//! }
//! ```
//!
//! ## With auth server
//! ```no_run
//! let v = corral_validate::CorralValidator::builder("/data/auth.db")
//!     .with_auth_server(true)
//!     .build()
//!     .unwrap();
//! // Auth server is stopped when `v` is dropped.
//! ```
//!
//! ## Axum extractor
//! The `CorralUser` type implements `FromRequestParts` when the
//! `axum` feature is enabled. Add a `CorralValidator` to your app state:
//! ```ignore
//! async fn handler(user: CorralUser) -> String { user.0.email.clone() }
//! ```

use rusqlite::{Connection, params};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const COOKIE_NAME: &str = "better-auth.session_token";

fn plan_levels() -> HashMap<&'static str, u8> {
    [("free", 0), ("pro", 1), ("team", 2), ("enterprise", 3)]
        .into_iter()
        .collect()
}

/// An authenticated user.
#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub plan: String,
    pub role: String,
    pub email_verified: bool,
    pub created_at: String,
}

/// Builder for configuring a `CorralValidator`.
pub struct CorralValidatorBuilder {
    db_path: String,
    auth_server: bool,
}

impl CorralValidatorBuilder {
    /// Enable or disable auto-spawning the Node auth server.
    pub fn with_auth_server(mut self, enabled: bool) -> Self {
        self.auth_server = enabled;
        self
    }

    /// Build the validator, optionally spawning the auth server.
    pub fn build(self) -> rusqlite::Result<CorralValidator> {
        let _ = Connection::open(&self.db_path)?;
        let mut v = CorralValidator {
            db_path: self.db_path,
            auth_child: Arc::new(Mutex::new(None)),
        };
        if self.auth_server {
            v.start_auth_server();
        }
        Ok(v)
    }
}

/// Session validator backed by a SQLite database.
pub struct CorralValidator {
    db_path: String,
    auth_child: Arc<Mutex<Option<Child>>>,
}

impl CorralValidator {
    /// Create a validator without auth server (backwards compatible).
    pub fn new(db_path: &str) -> rusqlite::Result<Self> {
        let _ = Connection::open(db_path)?;
        Ok(Self {
            db_path: db_path.to_string(),
            auth_child: Arc::new(Mutex::new(None)),
        })
    }

    /// Create a builder for more configuration options.
    pub fn builder(db_path: &str) -> CorralValidatorBuilder {
        CorralValidatorBuilder {
            db_path: db_path.to_string(),
            auth_server: false,
        }
    }

    /// Spawn the Node auth server as a managed child process.
    pub fn start_auth_server(&mut self) {
        let port = std::env::var("CORRAL_AUTH_PORT").unwrap_or_else(|_| "3456".into());

        let server_path = match self.find_auth_server() {
            Some(p) => p,
            None => {
                eprintln!("[corral-auth] server/auth.js not found — auth operations won't work, session validation still works");
                return;
            }
        };

        // Check node is available
        if Command::new("node").arg("--version").output().is_err() {
            eprintln!("[corral-auth] Node.js not installed — skipping auth server spawn");
            return;
        }

        let child = Command::new("node")
            .arg(&server_path)
            .env("AUTH_PORT", &port)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[corral-auth] Failed to spawn auth server: {e}");
                return;
            }
        };

        let pid = child.id();

        // Pipe stdout/stderr to eprintln in background threads
        if let Some(stdout) = child.stdout.take() {
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().flatten() {
                    if !line.is_empty() {
                        eprintln!("[corral-auth] {line}");
                    }
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    if !line.is_empty() {
                        eprintln!("[corral-auth] {line}");
                    }
                }
            });
        }

        *self.auth_child.lock().unwrap() = Some(child);

        // Health check
        let url = format!("http://localhost:{port}/api/auth/ok");
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut healthy = false;
        while Instant::now() < deadline {
            if let Ok(resp) = ureq::get(&url).timeout(Duration::from_secs(1)).call() {
                if resp.status() == 200 {
                    healthy = true;
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        if healthy {
            eprintln!("[corral-auth] Auth server ready on port {port} (pid {pid})");
        } else {
            eprintln!("[corral-auth] Auth server health check failed after 5s — it may still be starting");
        }
    }

    fn find_auth_server(&self) -> Option<String> {
        if let Ok(p) = std::env::var("CORRAL_AUTH_SERVER") {
            return if std::path::Path::new(&p).is_file() { Some(p) } else { None };
        }
        let mut dir = std::path::Path::new(&self.db_path)
            .canonicalize().ok()?
            .parent()?.to_path_buf();
        for _ in 0..10 {
            let candidate = dir.join("server").join("auth.js");
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
            if !dir.pop() { break; }
        }
        None
    }

    /// Stop the auth server subprocess.
    pub fn stop_auth_server(&self) {
        let mut guard = self.auth_child.lock().unwrap();
        if let Some(ref mut child) = *guard {
            eprintln!("[corral-auth] Stopping auth server (pid {})", child.id());
            // Try SIGTERM first (Unix)
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                unsafe { libc::kill(child.id() as i32, libc::SIGTERM); }
                let start = Instant::now();
                loop {
                    match child.try_wait() {
                        Ok(Some(_)) => break,
                        _ if start.elapsed() > Duration::from_secs(3) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        _ => std::thread::sleep(Duration::from_millis(50)),
                    }
                }
            }
            #[cfg(not(unix))]
            {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        *guard = None;
    }

    fn conn(&self) -> rusqlite::Result<Connection> {
        Connection::open(&self.db_path)
    }

    /// Validate a session token. Returns the user if valid and not expired.
    pub fn validate_session(&self, token: &str) -> rusqlite::Result<Option<User>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            r#"SELECT "userId", "expiresAt" FROM "session" WHERE "token" = ?1"#
        )?;
        let result = stmt.query_row(params![token], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        });
        let (user_id, expires_at) = match result {
            Ok(v) => v,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
            Err(e) => return Err(e),
        };

        // Parse expiry — accept RFC3339 or "YYYY-MM-DD HH:MM:SS"
        let expired = chrono::DateTime::parse_from_rfc3339(&expires_at)
            .map(|dt| dt < chrono::Utc::now())
            .unwrap_or_else(|_| {
                chrono::NaiveDateTime::parse_from_str(&expires_at, "%Y-%m-%d %H:%M:%S")
                    .map(|dt| dt.and_utc() < chrono::Utc::now())
                    .unwrap_or(true)
            });
        if expired {
            return Ok(None);
        }
        self.get_user_by_id(&conn, &user_id)
    }

    fn get_user_by_id(&self, conn: &Connection, user_id: &str) -> rusqlite::Result<Option<User>> {
        let mut stmt = conn.prepare(
            r#"SELECT "id","email","name","plan","role","emailVerified","createdAt"
               FROM "user" WHERE "id" = ?1"#
        )?;
        let result = stmt.query_row(params![user_id], |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                plan: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "free".into()),
                role: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "user".into()),
                email_verified: row.get::<_, bool>(5).unwrap_or(false),
                created_at: row.get(6)?,
            })
        });
        match result {
            Ok(u) => Ok(Some(u)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Check if a user's plan meets the minimum required plan.
    pub fn require_plan(user: &User, plan: &str) -> bool {
        let levels = plan_levels();
        levels.get(user.plan.as_str()).unwrap_or(&0)
            >= levels.get(plan).unwrap_or(&0)
    }
}

impl Drop for CorralValidator {
    fn drop(&mut self) {
        self.stop_auth_server();
    }
}

/// Extract session token from HTTP headers (cookie or Authorization: Bearer).
pub fn extract_token(headers: &[(String, String)]) -> Option<String> {
    // Check cookie header
    for (k, v) in headers {
        if k.eq_ignore_ascii_case("cookie") {
            for part in v.split(';') {
                let part = part.trim();
                if let Some(val) = part.strip_prefix("better-auth.session_token=") {
                    return Some(val.to_string());
                }
            }
        }
        if k.eq_ignore_ascii_case("authorization") {
            if let Some(token) = v.strip_prefix("Bearer ") {
                return Some(token.to_string());
            }
        }
    }
    None
}

// --- Axum extractor (behind axum feature) ---
#[cfg(feature = "axum")]
pub struct CorralUser(pub User);

#[cfg(feature = "axum")]
#[async_trait::async_trait]
impl<S> axum::extract::FromRequestParts<S> for CorralUser
where
    S: Send + Sync,
    CorralValidator: axum::extract::FromRef<S>,
{
    type Rejection = axum::http::StatusCode;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        use axum::extract::FromRef;

        let validator = CorralValidator::from_ref(state);
        let token = parts.headers.get("cookie")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(';').find_map(|p| {
                p.trim().strip_prefix("better-auth.session_token=").map(String::from)
            }))
            .or_else(|| {
                parts.headers.get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.strip_prefix("Bearer "))
                    .map(String::from)
            })
            .ok_or(axum::http::StatusCode::UNAUTHORIZED)?;

        validator.validate_session(&token)
            .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?
            .map(CorralUser)
            .ok_or(axum::http::StatusCode::UNAUTHORIZED)
    }
}
