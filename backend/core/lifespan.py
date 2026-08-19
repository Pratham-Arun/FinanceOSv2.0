from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import mongo
from seed.seed_database import seed_database
from utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongo.connect()
    await seed_database()
    logger.info("FinanceOS started", llm="groq/llama-3.3-70b-versatile", ocr="tesseract")
    yield
    await mongo.disconnect()
