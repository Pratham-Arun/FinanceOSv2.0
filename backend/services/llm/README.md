# services/llm/ — Dead Code (Phase 1 Artefact)

This directory contains an earlier provider-switching factory pattern that was
superseded before Phase 1 shipped.

**Nothing in this directory is imported or called at runtime.**

The active LLM integration is:
- `services/groq_service.py` — Groq SDK wrapper (primary)
- `services/gemini_service.py` — retained for the metrics endpoint only
- `services/ai_service.py` — two-tier pipeline (Groq → rule-engine fallback)

## Phase 2 decision

These files should either be deleted before Phase 2 begins (preferred) or
kept only if the factory pattern is revived for the Finance AI Core in Stage 7.
Do not reference these files in new code.
