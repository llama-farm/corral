// Package corral provides minimal Better Auth session validation
// by reading the shared database directly.
//
// # Auto-spawn auth server
//
// By default the auth server is NOT auto-spawned; pass WithAuthServer(true)
// to NewValidator to have it spawn `node server/auth.js` as a managed
// subprocess. Session validation reads the DB directly and works without it.
// Configure port via CORRAL_AUTH_PORT (default 3456) and server path via
// CORRAL_AUTH_SERVER env var.
//
// Usage:
//
//	v := corral.NewValidator("/data/auth.db", corral.WithAuthServer(true))
//	defer v.Close()
//	user, err := v.ValidateSession(token)
//	if err != nil || user == nil { /* unauthorized */ }
//
// HTTP middleware:
//
//	mux.Handle("/api/", v.Middleware(apiHandler))
package corral

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "modernc.org/sqlite"
)

const CookieName = "better-auth.session_token"

var planLevels = map[string]int{
	"free": 0, "pro": 1, "team": 2, "enterprise": 3,
}

// User represents an authenticated user.
type User struct {
	ID            string
	Email         string
	Name          string
	Plan          string
	Role          string
	EmailVerified bool
	CreatedAt     string
}

type contextKey struct{}

// UserFromContext extracts the User set by Middleware.
func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(contextKey{}).(*User)
	return u
}

// Option configures a Validator.
type Option func(*Validator)

// WithAuthServer enables auto-spawning the Node auth server subprocess.
func WithAuthServer(enabled bool) Option {
	return func(v *Validator) {
		v.authServerEnabled = enabled
	}
}

// Validator reads the Better Auth database to validate sessions.
// It implements io.Closer to clean up the auth server subprocess.
type Validator struct {
	dbPath             string
	authServerEnabled  bool
	authCmd            *exec.Cmd
	authMu             sync.Mutex
	authStopped        bool
}

// NewValidator creates a validator for the given SQLite database path.
func NewValidator(dbPath string, opts ...Option) *Validator {
	v := &Validator{dbPath: dbPath}
	for _, o := range opts {
		o(v)
	}
	if v.authServerEnabled {
		v.StartAuthServer()
	}
	return v
}

// StartAuthServer spawns the Node auth server as a managed subprocess.
// It blocks until the health check passes or 5s timeout.
func (v *Validator) StartAuthServer() {
	v.authMu.Lock()
	defer v.authMu.Unlock()

	port := os.Getenv("CORRAL_AUTH_PORT")
	if port == "" {
		port = "3456"
	}

	serverPath := v.findAuthServer()
	if serverPath == "" {
		log.Println("[corral-auth] server/auth.js not found — auth operations won't work, session validation still works")
		return
	}

	// Check node is available
	if _, err := exec.LookPath("node"); err != nil {
		log.Println("[corral-auth] Node.js not installed — skipping auth server spawn")
		return
	}

	cmd := exec.Command("node", serverPath)
	cmd.Env = append(os.Environ(), "AUTH_PORT="+port)
	cmd.Stdout = &prefixWriter{prefix: "[corral-auth] ", logFn: log.Printf}
	cmd.Stderr = &prefixWriter{prefix: "[corral-auth] ", logFn: log.Printf}
	// Use process group so we can kill the tree
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	if err := cmd.Start(); err != nil {
		log.Printf("[corral-auth] Failed to spawn auth server: %v", err)
		return
	}
	v.authCmd = cmd

	// Health check
	url := fmt.Sprintf("http://localhost:%s/api/auth/ok", port)
	client := &http.Client{Timeout: time.Second}
	deadline := time.Now().Add(5 * time.Second)
	healthy := false
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				healthy = true
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	if healthy {
		log.Printf("[corral-auth] Auth server ready on port %s (pid %d)", port, cmd.Process.Pid)
	} else {
		log.Println("[corral-auth] Auth server health check failed after 5s — it may still be starting")
	}
}

func (v *Validator) findAuthServer() string {
	if p := os.Getenv("CORRAL_AUTH_SERVER"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
		return ""
	}
	dir, _ := filepath.Abs(v.dbPath)
	dir = filepath.Dir(dir)
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "server", "auth.js")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// Close stops the auth server subprocess gracefully (SIGTERM, then SIGKILL after 3s).
func (v *Validator) Close() error {
	v.authMu.Lock()
	defer v.authMu.Unlock()

	if v.authStopped || v.authCmd == nil || v.authCmd.Process == nil {
		return nil
	}
	v.authStopped = true
	cmd := v.authCmd

	log.Printf("[corral-auth] Stopping auth server (pid %d)", cmd.Process.Pid)

	// SIGTERM to process group
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		<-done
	}
	return nil
}

// prefixWriter is a simple io.Writer that logs lines with a prefix.
type prefixWriter struct {
	prefix string
	logFn  func(string, ...any)
	buf    []byte
}

func (w *prefixWriter) Write(p []byte) (int, error) {
	w.buf = append(w.buf, p...)
	for {
		idx := -1
		for i, b := range w.buf {
			if b == '\n' {
				idx = i
				break
			}
		}
		if idx < 0 {
			break
		}
		line := strings.TrimRight(string(w.buf[:idx]), "\r")
		w.buf = w.buf[idx+1:]
		if line != "" {
			w.logFn("%s%s", w.prefix, line)
		}
	}
	return len(p), nil
}

func (v *Validator) open() (*sql.DB, error) {
	return sql.Open("sqlite", v.dbPath)
}

// ValidateSession looks up a session token, checks expiry, returns the User.
func (v *Validator) ValidateSession(token string) (*User, error) {
	db, err := v.open()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	var userID string
	var expiresAt string
	err = db.QueryRow(
		`SELECT "userId", "expiresAt" FROM "session" WHERE "token" = ?`, token,
	).Scan(&userID, &expiresAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	exp, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		// Try alternate format
		exp, err = time.Parse("2006-01-02 15:04:05", expiresAt)
		if err != nil {
			return nil, err
		}
		exp = exp.UTC()
	}
	if exp.Before(time.Now().UTC()) {
		return nil, nil
	}

	return v.GetUserByID(db, userID)
}

// GetUserByID fetches a user by ID from the given db connection.
func (v *Validator) GetUserByID(db *sql.DB, userID string) (*User, error) {
	u := &User{}
	var name, plan, role sql.NullString
	var verified sql.NullBool
	err := db.QueryRow(
		`SELECT "id","email","name","plan","role","emailVerified","createdAt" FROM "user" WHERE "id" = ?`, userID,
	).Scan(&u.ID, &u.Email, &name, &plan, &role, &verified, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.Name = name.String
	u.Plan = plan.String
	if u.Plan == "" {
		u.Plan = "free"
	}
	u.Role = role.String
	if u.Role == "" {
		u.Role = "user"
	}
	u.EmailVerified = verified.Bool
	return u, nil
}

// RequirePlan checks if the user's plan meets the minimum.
func RequirePlan(user *User, plan string) bool {
	return planLevels[user.Plan] >= planLevels[plan]
}

func extractToken(r *http.Request) string {
	if c, err := r.Cookie(CookieName); err == nil && c.Value != "" {
		return c.Value
	}
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return auth[7:]
	}
	return ""
}

// Middleware validates the session and sets the User in context.
// Returns 401 if no valid session. Use UserFromContext to retrieve.
func (v *Validator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		user, err := v.ValidateSession(token)
		if err != nil || user == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), contextKey{}, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
