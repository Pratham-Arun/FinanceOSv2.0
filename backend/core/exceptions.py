from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from utils.logger import logger

def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        if isinstance(exc.detail, dict):
            content = exc.detail
            if "success" not in content:
                content["success"] = False
        else:
            content = {"detail": exc.detail, "success": False, "message": str(exc.detail)}
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.error(f"Validation error on {request.url.path}: {exc}")
        # Pydantic v2 may include non-serializable objects (e.g. ValueError) in
        # the 'ctx' dict. Sanitise each error entry so the response is always
        # a valid JSON payload.
        errors = []
        for e in exc.errors():
            sanitised = dict(e)
            ctx = sanitised.get("ctx")
            if isinstance(ctx, dict):
                sanitised["ctx"] = {k: str(v) for k, v in ctx.items()}
            errors.append(sanitised)
        return JSONResponse(
            status_code=422,
            content={"detail": errors, "success": False, "message": "Validation Error"}
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error", "success": False, "message": str(exc)}
        )
