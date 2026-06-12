from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str = "redis://redis:6379/0"

    judge0_url: str = "http://judge0-server:2358"
    judge0_auth_token: str = ""
    judge0_callback_base: str = "http://fastapi:8000"

    api_internal_key: str
    api_cors_origins: str = "http://localhost"

    python_time_multiplier: float = 3.0
    submission_rate_limit_per_10s: int = 1
    submission_max_concurrent: int = 5

    testcase_dir: str = "/data/testcases"
    submission_dir: str = "/data/submissions"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()  # type: ignore[call-arg]
