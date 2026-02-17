# C4 Code-Level Documentation: Backend

## Overview
- **Name**: Backend Services
- **Location**: `backend/`
- **Language**: Python 3.12+ (Flask)
- **Purpose**: Provides RESTful APIs for resume parsing, AI analysis, authentication, and data persistence.

## Key Modules & Services

### 1. Application Entry Point (`app.py`)
- **Roles**:
    - Initializes Flask application and middleware (CORS, Logging).
    - Loads configuration from `.env`.
    - Defines API routes (`/api/*`) and maps them to service functions.
    - Handles error responses and dependency injection.

### 2. Core Domain Services (`backend/services/`)
- **`auth_user_service.py`**: Handles user registration, login, profile updates, and password management.
- **`resume_crud_service.py`**: Manages CRUD operations for resume records in Supabase.
- **`ai_endpoint_service.py`**: Orchestrates AI operations including resume analysis, chat streaming, and screenshot parsing.
- **`pdf_service.py`**: Handles PDF generation (via Playwright) and text extraction.
- **`rag_service.py`**: Implements RAG (Retrieval-Augmented Generation) logic using vector embeddings for context-aware AI responses.
- **`mock_store_service.py`**: Provides a mock data layer for development/testing without live database connections.
- **`deletion_service.py`**: Manages user account deletion workflows (soft/hard delete).

### 3. Integrations
- **Google Gemini**: Used in `ai_endpoint_service.py` and `resume_parse_service.py` for OCR, text parsing, and chat.
- **Supabase**: Used via `supabase_client` for database and auth storage.

## Dependencies
- **Internal**: `services.*` modules.
- **External**:
    - `flask`, `flask_cors`: Web framework.
    - `google-generativeai`: AI model interaction.
    - `supabase`: Database client.
    - `playwright`: PDF rendering.
