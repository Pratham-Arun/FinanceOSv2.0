import os
import uuid
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from core.logging import logger, request_id_ctx


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Extracts or generates an X-Request-ID for every incoming HTTP request.
    Stores it in the request_id_ctx ContextVar so all log calls within the
    same request automatically include the correlation ID.
    Echoes the ID back in the response headers for client-side tracing.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        correlation_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = request_id_ctx.set(correlation_id)
        start = time.perf_counter()

        try:
            response = await call_next(request)
        finally:
            elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
            request_id_ctx.reset(token)

        response.headers["X-Request-ID"] = correlation_id
        logger.info(
            "HTTP Request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            elapsed_ms=elapsed_ms,
        )
        return response


def configure_middleware(app: FastAPI) -> None:
    # CORS — restrict allowed origins via ALLOWED_ORIGINS env var.
    # In development, defaults to localhost:3000 and localhost:5173.
    # In production set ALLOWED_ORIGINS to a comma-separated list of your domains.
    # Example: ALLOWED_ORIGINS=https://app.financeos.com,https://admin.financeos.com
    raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
    allow_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

    # CORS must be added last (outermost layer in Starlette's middleware stack)
    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
