# services/vector_store/ — Dead Code (Phase 1 Artefact)

This directory contains an earlier vector store abstraction that was never
connected to the active RAG implementation.

**Nothing in this directory is imported or called at runtime.**

The active retrieval stack is:
- `services/rag_service.py` — keyword-based policy Q&A backed by MongoDB text search
- `repositories/knowledge_repository.py` — knowledge base persistence
- `groq_service.get_embedding()` returns a deterministic hash (not a real embedding)

## Phase 2 note

Phase 2 Stage 5 plans to upgrade the RAG layer to real vector retrieval.
When that work begins, this directory should either be cleaned up and populated
with the real implementation, or deleted and replaced by a new
`services/ai_core/retrieval/` module.
Do not reference these files in new code.
