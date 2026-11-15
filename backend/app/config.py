from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

WEAK_JWT_SECRETS = {
    "change-me",
    "change-me-in-production",
    "dev-secret-key-not-for-production",
    "secret",
    "",
}

WEAK_SEED_PASSWORDS = {
    "password123",
    "admin",
    "password",
    "changeme",
    "12345678",
    "letmein",
    "",
}


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "postgresql+psycopg://tradejournal:tradejournal@db:5432/tradejournal"
    jwt_secret_key: str = "change-me"
    jwt_access_token_expire_minutes: int = 1440
    app_timezone: str = "Europe/Rome"
    market_close_cutoff: str = "17:30"
    snapshot_time: str = "23:55"
    media_root: str = "/app/media"
    seed_admin_enabled: bool = True
    seed_admin_email: str = "admin@example.com"
    seed_admin_username: str = "admin"
    seed_admin_password: str = "password123"
    cors_origins: str = "http://localhost:15173,http://127.0.0.1:15173"

    # Asset Analysis & Coaching LLM settings
    analysis_llm_provider: str = "gemini"  # "gemini" | "openai" | "anthropic" | "ollama" | "openrouter" | "mock"
    analysis_llm_model: str = "gemini-2.5-flash"
    analysis_api_key: str = ""
    analysis_base_url: str = ""
    analysis_default_language: str = "it"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def _refuse_weak_secrets_in_production(self) -> "Settings":
        if self.environment.lower() not in {"production", "prod"}:
            return self
        if len(self.jwt_secret_key) < 32 or self.jwt_secret_key in WEAK_JWT_SECRETS:
            raise ValueError(
                "Refusing to start in production: JWT_SECRET_KEY must be a freshly "
                "generated random secret of at least 32 chars, not a default/placeholder value."
            )
        if self.seed_admin_enabled and (
            self.seed_admin_password in WEAK_SEED_PASSWORDS
            or len(self.seed_admin_password) < 12
        ):
            raise ValueError(
                "Refusing to start in production: SEED_ADMIN_ENABLED requires a strong "
                "SEED_ADMIN_PASSWORD (>= 12 chars, not a known default). "
                "Disable seeding or set a random admin password."
            )
        return self


settings = Settings()
