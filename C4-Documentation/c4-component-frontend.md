# C4 Component: Frontend Application

## Overview
- **Name**: Career-Hero Web App
- **Type**: Single Page Application (SPA)
- **Technology**: React, TypeScript, Vite, Tailwind CSS
- **Description**: The user-facing interface for the Career-Hero platform, enabling seamless resume editing, AI analysis, and interview simulation.

## Purpose
- Provide an intuitive, responsive UI for job seekers.
- Facilitate real-time resume editing and feedback loop with AI.
- Render consistent, printer-friendly layouts for resume export.

## Key Components

### 1. Resume Editor (`Editor.tsx`)
- **Responsibility**: Interactive form-based interface for managing personal info, education, work experience, projects, skills, and languages.
- **Interfaces**: Real-time previews (`templates/Preview.tsx`) updating as the user types.

### 2. AI Analysis Workflow (`AiAnalysis.tsx`)
- **Responsibility**:
    - Orchestrates the multi-step process: Resume Selection -> Job Description Input -> Analysis -> Report/Chat.
    - Displays AI-generated scores and suggestions.
    - Facilitates a guided AI interview chat with simulated HR questions.
- **Features**: Real-time score updates, inline suggestions, voice-enabled chat.

### 3. State Management (`app-context.tsx`)
- **Responsibility**: Manages global application state (current resume, user profile, UI configuration) using React Context API.
- **Interfaces**: Persists state across page navigations.

### 4. Authentication/Profile (`Login.tsx`, `Profile.tsx`)
- **Responsibility**: User login, registration, password reset, and profile management.
- **Interfaces**: Interfaces with backend `/api/auth` endpoints.

## Dependencies
- **Backend API**: For all data persistence and AI logic.
- **Browser APIs**:
    - **Web Speech API**: Voice recognition for interview simulation.
    - **Local Storage**: Caching user preferences and draft data.
    - **File API**: Uploading resumes (PDF/DOCX) and profile pictures.

## Diagram
```mermaid
graph TD
    User((User)) -->|Interacts| SPA[Web App (React)]
    SPA -->|REST API| BE[Backend Service]
    SPA -->|Voice/Audio| Browser[Browser APIs]
```
