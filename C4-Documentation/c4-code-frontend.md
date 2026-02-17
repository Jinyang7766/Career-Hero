# C4 Code-Level Documentation: Frontend

## Overview
- **Name**: Web Client
- **Location**: `ai-resume-builder/`
- **Language**: TypeScript (React)
- **Purpose**: Provides a user interface for building, editing, and analyzing resumes.

## Key Directories & Components

### 1. Application Core (`src/`)
- **`App.tsx`**: Main application router and context provider setup.
- **`app-context.tsx`**: Global context (State Management) for `resumeData`, `currentStep`, `userProfile`.
- **`ai-service.ts`**: Helper class for interacting with the backend AI chat API.
- **`api-config.ts`**: Configuration for backend API base URL (`VITE_API_BASE_URL`).
- **`supabase-client.ts`**: Frontend Supabase client for potential direct database access (though primarily via backend for security).

### 2. UI Components (`components/`)
- **`screens/AiAnalysis.tsx`**: Main component for the AI analysis workflow (Resume Select -> JD Input -> Chat/Report).
- **`screens/Editor.tsx`**: The resume editor interface.
- **`templates/`**: Resume templates (Modern, Classic, etc.) used for previewing and PDF export.

### 3. Key Services
- **`useInterviewChat` (`hooks/`)**: Custom hook managing the stateful interview chat session, streaming responses, and audio input.
- **`useInterviewVoice`**: Manages voice recognition (Web Speech API) and audio playback for interview simulation.

## Workflow
- Users start at `ResumeSelectPage`, proceed to `JdInputPage` (upload job description), then enter `ChatPage` for AI interview or `ReportPage` for analysis results.
- Updates to `resumeData` are synced via `app-context`.

## Dependencies
- **Internal**: `src/ui`, `components/screens`, `hooks`.
- **External**:
    - `react`, `react-router-dom`: SPA framework.
    - `tailwindcss`: Styling.
    - `lucide-react`, `material-symbols`: Icons.
