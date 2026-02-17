# C4 Architecture Documentation: Career-Hero

This directory contains the comprehensive C4 architecture documentation for the Career-Hero project, generated bottom-up from the codebase.

## Documentation Structure

### 1. Context Level (System Overview)
- **[System Context](./c4-context.md)**: High-level view of the Career-Hero system, its users (Job Seekers), and external dependencies (Google Gemini, Supabase).
- **Diagrams**: System Context Diagram showing data flow and relationships.

### 2. Container Level (Deployment Architecture)
- **[Container Architecture](./c4-container.md)**: Mapping of system components to deployable units (Web App, API Service, Database).
- **Diagrams**: Container Diagram showing communication protocols and infrastructure.

### 3. Component Level (Logical Architecture)
- **[Backend Service Component](./c4-component-backend.md)**: Detailed breakdown of the backend API service, including modules for Auth, Resume Management, and AI Orchestration.
- **[Frontend Application Component](./c4-component-frontend.md)**: Detailed breakdown of the web client, including Editor, Analysis Workflow, and State Management.

### 4. Code Level (Implementation Details)
- **[Backend Code Documentation](./c4-code-backend.md)**: Analysis of `backend/app.py` and `backend/services/`.
- **[Frontend Code Documentation](./c4-code-frontend.md)**: Analysis of `ai-resume-builder/src` and key components.

## Generating Diagrams
The documentation includes Mermaid diagrams. To view them:
1. Use a Markdown viewer with Mermaid support (e.g., VS Code + Mermaid Preview).
2. Or copy the code blocks into the [Mermaid Live Editor](https://mermaid.live/).

## Purpose
This documentation serves to onboard new developers, validate architectural decisions, and provide a clear reference for system capabilities and dependencies.
