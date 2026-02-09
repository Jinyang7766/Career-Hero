# Project-Specific Agent Rules

## Backup Protocol (Mandatory)
Before modifying ANY file in this project, the AI agent MUST:
1.  **Ensure a `backup/` directory exists** in the project root.
2.  **Create a backup copy** of the target file inside the `backup/` directory, mirroring the source file's relative path structure.
    - Path format: `backup/[relative_path_to_file]`
3.  **Perform the modification** only after the backup is confirmed.

This ensures that we can always revert to the previous state in case of issues.
