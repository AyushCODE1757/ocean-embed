import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import core
from .settings import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="OceanEmbed API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origins, allow_methods=["GET"], allow_headers=["*"]
    )
    app.include_router(core.router)
    return app


app = create_app()
