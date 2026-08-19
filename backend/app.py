import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from core.lifespan import lifespan
from core.middleware import configure_middleware
from core.exceptions import register_exception_handlers
from routers import (
    auth_router,
    expense_router,
    approval_router,
    notification_router,
    analytics_router,
    ai_router,
    knowledge_router,
    admin_router,
    invoice_router,
)

app = FastAPI(
    title="FinanceOS API",
    version="1.0",
    lifespan=lifespan,
)

configure_middleware(app)
register_exception_handlers(app)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth_router.router)
app.include_router(expense_router.router)
app.include_router(approval_router.router)
app.include_router(notification_router.router)
app.include_router(analytics_router.router)
app.include_router(ai_router.router)
app.include_router(knowledge_router.router)
app.include_router(admin_router.router)
app.include_router(invoice_router.router)
