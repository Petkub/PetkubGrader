from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    admin,
    contests,
    judge0_callback,
    problems,
    ranking,
    submissions,
    topics,
    users,
)
from app.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: future place for redis pool init, judge0 sanity ping.
    yield


app = FastAPI(title="MyGrader API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,  # BFF passes secret header; no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(users.router)
app.include_router(problems.router)
app.include_router(submissions.router)
app.include_router(contests.router)
app.include_router(admin.router)
app.include_router(topics.router)
app.include_router(ranking.router)
app.include_router(judge0_callback.router)
