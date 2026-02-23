# Project-Specific Agent Rules

## Backup Protocol (Mandatory)
Before modifying ANY file in this project, the AI agent MUST:
1.  **Ensure a `backup/` directory exists** in the project root.
2.  **Create a backup copy** of the target file inside the `backup/` directory, mirroring the source file's relative path structure.
    - Path format: `backup/[relative_path_to_file]`
3.  **Perform the modification** only after the backup is confirmed.

This ensures that we can always revert to the previous state in case of issues.

## Default Execution Mode (Mandatory For All Code Tasks)
For every coding task in this repository, run the `step-test-worklog` workflow by default without waiting for user reminders.

1.  **Sub-agent routing is required** on each step.
    - `A`: scope, architecture, acceptance criteria.
    - `B-FE`: frontend implementation.
    - `B-BE`: backend/API implementation.
    - `C`: testing and validation.
    - `D`: deploy/runtime/ops checks.
2.  **Step execution must be incremental**.
    - Do one coherent change at a time.
    - Do not batch unrelated edits.
3.  **Per-step regression gate is mandatory** after each material change.
    - Preferred command:  
      `pwsh -File scripts/test-step.ps1 -FrontendUrl "https://career-hero-ai-resume-builder.vercel.app/" -BackendUrl "https://career-hero-backend-production-a634.up.railway.app"`
    - Credentials must come from runtime env vars:
      - `CAREER_HERO_TEST_EMAIL`
      - `CAREER_HERO_TEST_PASSWORD`
4.  **Failure policy is strict**.
    - If tests fail, stop forward progress.
    - Fix the failure first, then re-run the same gate command.
5.  **Work logging is mandatory**.
    - Append one entry to `WORKLOG.md` after each executed step.
    - Include: goal, changed files, commands, verification, risks/notes.
    - Redact secrets as `***`.
6.  **If skill loading is unavailable**, emulate the same workflow manually.
    - The process above remains mandatory even when `step-test-worklog` is not auto-loaded.
