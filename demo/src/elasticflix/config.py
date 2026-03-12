from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_index: str = "movies"
    otlp_endpoint: str | None = None
    service_name: str = "elasticflix"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
