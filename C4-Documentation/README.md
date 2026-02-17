# Career-Hero Architecture Documentation (v1.3.0)

This directory hosts the comprehensive **C4 Architecture Documentation** for the Career-Hero project. These documents are designed to provide a deep understanding of the system's design, from high-level context to low-level implementation.

## Document Index

1.  **[System Context](./c4-context.md)**  
    *Perspective: Business & User Level*  
    Defines the system's boundaries, personas (Job Seekers), and its core dependencies like Google Gemini and Supabase.

2.  **[Container Architecture](./c4-container.md)**  
    *Perspective: Deployment & Infrastructure*  
    Illustrates how the Web App, Flask API, and Database containers communicate and are deployed.

3.  **[Component Design - Backend](./c4-component-backend.md)**  
    *Perspective: Logical Architecture*  
    Detailing the modular service structure (AI, RAG, PDF, Auth) inside the `backend/` directory.

4.  **[Component Design - Frontend](./c4-component-frontend.md)**  
    *Perspective: Logical Architecture*  
    Focusing on the React component hierarchy, state management with Context/Zustand, and AI streaming hooks.

---

## Technical Highlights
*   **Decoupled Services**: The transition to a modular service layer ensures that LLM logic is isolated from generic API routing.
*   **Adaptive RAG**: The architecture natively supports domain-aware AI responses.
*   **High-Security UX**: Integrates PII protection alongside seamless UI feedback (Thinking indicators).

## Visualization
All diagrams are written in **Mermaid.js**. To view them in high resolution:
- Open these files in VS Code with the *Mermaid Preview* extension.
- Or paste the code blocks into the [Mermaid Live Editor](https://mermaid.live/).

---
*Last Updated: 2026-02-17 (Project v1.3.0)*
