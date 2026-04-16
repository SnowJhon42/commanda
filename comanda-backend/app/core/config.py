import os


class Settings:
    app_name: str = "Comanda Backend"
    environment: str = os.getenv("ENVIRONMENT", "dev")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./comanda_dev.db")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
    cors_allow_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ALLOW_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
        ).split(",")
        if origin.strip()
    ]
    cloudflare_account_id: str | None = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    cloudflare_r2_bucket: str | None = os.getenv("CLOUDFLARE_R2_BUCKET")
    cloudflare_api_token: str | None = os.getenv("CLOUDFLARE_API_TOKEN")
    cloudflare_public_host: str = os.getenv(
        "CLOUDFLARE_PUBLIC_HOST", "https://pub-5d4b544badf2444a82ffa24a0f757908.r2.dev"
    )
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    cors_allow_origin_regex: str = os.getenv(
        "CORS_ALLOW_ORIGIN_REGEX",
        r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    )

    def validate(self) -> None:
        if self.environment.lower() != "dev" and self.jwt_secret_key == "change-me-in-production":
            raise RuntimeError("JWT_SECRET_KEY must be set to a non-default value outside dev")


settings = Settings()
settings.validate()
