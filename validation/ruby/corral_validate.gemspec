Gem::Specification.new do |s|
  s.name        = "corral-validate"
  s.version     = "0.1.0"
  s.summary     = "Minimal session validation for Corral/Better Auth"
  s.description = "Reads the shared Better Auth database directly to validate sessions. Includes Rack middleware and Rails concern."
  s.authors     = ["Llama Farm"]
  s.license     = "MIT"
  s.files       = ["corral_validate.rb"]
  s.require_paths = ["."]

  s.add_dependency "sqlite3", "~> 2.0"

  s.required_ruby_version = ">= 3.0"
end
