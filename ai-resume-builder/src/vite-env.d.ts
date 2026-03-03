/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly REACT_APP_GEMINI_API_KEY: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_GUIDED_FLOW_ENABLED?: string
  readonly VITE_GUIDED_STEP12_FOLLOWUP_ENABLED?: string
  readonly VITE_CAREER_PLANNING_CHAT_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
