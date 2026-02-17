# frozen_string_literal: true

# corral-validate: Minimal session validation for Corral/Better Auth.
#
# == Auto-spawn auth server
#   By default, pass `auth_server: true` to auto-spawn `node server/auth.js`
#   as a managed subprocess. Session validation reads the DB directly and
#   works without it. Configure port via CORRAL_AUTH_PORT (default 3456)
#   and server path via CORRAL_AUTH_SERVER env var.
#
# == Basic usage
#   v = Corral::Validator.new(db_path: "/data/auth.db", auth_server: true)
#   user = v.validate_session("tok_abc")
#   puts user.email if user
#
# == Rack middleware
#   use Corral::RackMiddleware, db_path: "/data/auth.db"
#   # env["corral.user"] will be set if authenticated
#
# == Rails concern
#   class ApplicationController < ActionController::Base
#     include Corral::AuthConcern
#     self.corral_db_path = "/data/auth.db"
#   end

require "sqlite3"
require "time"
require "net/http"
require "uri"

module Corral
  COOKIE_NAME = "better-auth.session_token"
  PLAN_LEVELS = { "free" => 0, "pro" => 1, "team" => 2, "enterprise" => 3 }.freeze

  User = Struct.new(:id, :email, :name, :plan, :role, :email_verified, :created_at, keyword_init: true)

  class Validator
    # @param db_path [String] Path to SQLite database
    # @param auth_server [Boolean] Auto-spawn Node auth server (default false)
    def initialize(db_path:, auth_server: false)
      @db_path = db_path
      @auth_pid = nil
      @auth_stopped = false
      @mutex = Mutex.new

      spawn_auth_server if auth_server
    end

    def validate_session(token)
      db = SQLite3::Database.new(@db_path)
      row = db.get_first_row(
        'SELECT "userId", "expiresAt" FROM "session" WHERE "token" = ?', [token]
      )
      return nil unless row

      user_id, expires_at = row
      exp = Time.parse(expires_at) rescue Time.iso8601(expires_at)
      return nil if exp < Time.now.utc

      get_user_by_id(db, user_id)
    ensure
      db&.close
    end

    def get_user_by_id(db = nil, user_id)
      own_db = db.nil?
      db ||= SQLite3::Database.new(@db_path)
      row = db.get_first_row(
        'SELECT "id","email","name","plan","role","emailVerified","createdAt" FROM "user" WHERE "id" = ?',
        [user_id]
      )
      return nil unless row

      User.new(
        id: row[0], email: row[1], name: row[2],
        plan: row[3] || "free", role: row[4] || "user",
        email_verified: !!row[5], created_at: row[6].to_s
      )
    ensure
      db&.close if own_db
    end

    def require_plan(user, plan)
      (PLAN_LEVELS[user.plan] || 0) >= (PLAN_LEVELS[plan] || 0)
    end

    # Stop the managed auth server subprocess.
    def stop_auth_server
      @mutex.synchronize do
        return if @auth_stopped || @auth_pid.nil?
        @auth_stopped = true
        pid = @auth_pid
        @auth_pid = nil

        begin
          # Check if still running
          Process.kill(0, pid)
          $stderr.puts "[corral-auth] Stopping auth server (pid #{pid})"
          Process.kill("TERM", pid)
          # Wait up to 3s
          deadline = Time.now + 3
          loop do
            _pid, _status = Process.waitpid2(pid, Process::WNOHANG)
            break if _pid
            break if Time.now > deadline
            sleep 0.05
          end
          # Force kill if still alive
          begin
            Process.kill(0, pid)
            Process.kill("KILL", pid)
            Process.waitpid(pid)
          rescue Errno::ESRCH, Errno::ECHILD
            # already gone
          end
        rescue Errno::ESRCH, Errno::ECHILD
          # already gone
        end
      end
    end

    private

    def spawn_auth_server
      port = ENV.fetch("CORRAL_AUTH_PORT", "3456")
      server_path = find_auth_server

      unless server_path
        $stderr.puts "[corral-auth] server/auth.js not found — auth operations won't work, session validation still works"
        return
      end

      # Check node is available
      unless system("node", "--version", out: File::NULL, err: File::NULL)
        $stderr.puts "[corral-auth] Node.js not installed — skipping auth server spawn"
        return
      end

      env = { "AUTH_PORT" => port }
      rd_out, wr_out = IO.pipe
      rd_err, wr_err = IO.pipe

      @auth_pid = Process.spawn(env, "node", server_path, out: wr_out, err: wr_err)
      wr_out.close
      wr_err.close

      # Pipe output to stderr with prefix in background threads
      pipe_to_log = ->(io) {
        Thread.new do
          io.each_line { |line| $stderr.puts "[corral-auth] #{line.rstrip}" unless line.strip.empty? }
        rescue IOError
          # closed
        end
      }
      pipe_to_log.call(rd_out)
      pipe_to_log.call(rd_err)

      # Health check
      url = URI("http://localhost:#{port}/api/auth/ok")
      deadline = Time.now + 5
      healthy = false
      while Time.now < deadline
        begin
          res = Net::HTTP.get_response(url)
          if res.code == "200"
            healthy = true
            break
          end
        rescue StandardError
          # not ready yet
        end
        sleep 0.1
      end

      if healthy
        $stderr.puts "[corral-auth] Auth server ready on port #{port} (pid #{@auth_pid})"
      else
        $stderr.puts "[corral-auth] Auth server health check failed after 5s — it may still be starting"
      end

      # Register cleanup
      at_exit { stop_auth_server }
      trap("TERM") { stop_auth_server; exit }
      trap("INT") { stop_auth_server; exit }
    rescue => e
      $stderr.puts "[corral-auth] Failed to spawn auth server: #{e.message}"
    end

    def find_auth_server
      if (p = ENV["CORRAL_AUTH_SERVER"])
        return File.file?(p) ? p : nil
      end
      dir = File.dirname(File.realpath(@db_path)) rescue File.dirname(@db_path)
      10.times do
        candidate = File.join(dir, "server", "auth.js")
        return candidate if File.file?(candidate)
        parent = File.dirname(dir)
        break if parent == dir
        dir = parent
      end
      nil
    end
  end

  # Rack middleware — sets env["corral.user"]
  class RackMiddleware
    def initialize(app, db_path:, auth_server: false)
      @app = app
      @validator = Validator.new(db_path: db_path, auth_server: auth_server)
    end

    def call(env)
      token = extract_token(env)
      env["corral.user"] = token ? @validator.validate_session(token) : nil
      @app.call(env)
    end

    private

    def extract_token(env)
      # Cookie
      cookies = env["HTTP_COOKIE"]&.split(";")&.map(&:strip) || []
      cookie = cookies.find { |c| c.start_with?("#{COOKIE_NAME}=") }
      return cookie.split("=", 2).last if cookie

      # Authorization header
      auth = env["HTTP_AUTHORIZATION"]
      return auth[7..] if auth&.start_with?("Bearer ")

      nil
    end
  end

  # Rails concern
  module AuthConcern
    def self.included(base)
      base.class_attribute :corral_db_path, default: "auth.db"
      base.class_attribute :corral_auth_server, default: false
      base.before_action :_corral_authenticate
    end

    private

    def _corral_authenticate
      validator = Validator.new(db_path: self.class.corral_db_path, auth_server: self.class.corral_auth_server)
      token = cookies[COOKIE_NAME] ||
              request.headers["Authorization"]&.then { |a| a.start_with?("Bearer ") ? a[7..] : nil }
      @corral_user = token ? validator.validate_session(token) : nil
    end

    def corral_user
      @corral_user
    end

    def require_corral_auth!
      head :unauthorized unless @corral_user
    end
  end
end
