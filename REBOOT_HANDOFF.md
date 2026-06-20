# Reboot Handoff Instructions for Antigravity Agent

**Context:** 
The user is working on a VS Code Extension (VSX) combined with an MCP server called **"SDOA Migration Engine"** (`sdoa-mcp-extension`). This extension exposes commands like `sdoa.runMigration` and `sdoa.generatePrimitive` and relies on `authorities/mcp/server.js`.

Due to a failing `D:` drive, the user was forced to move the entire workspace from `D:\projects\MCP` to `C:\MCP`. This emergency migration has caused IDE extensions (like SonarLint and Ghost/Copilot) to crash, largely due to stale absolute paths lingering in caches and local `node_modules`.

**Your Goal:** 
Finalize the workspace migration to `C:\MCP`, restore system integrity, and ensure zero remaining references to the broken `D:` drive.

## Immediate First Step (CRITICAL)

Before doing anything else, you must load and execute the system OS kernel:
- `[ ]` Read the file `C:\Users\trech\.agents\bootloader.md`. 
- `[ ]` Assume the specified persona/OS profile.
- `[ ]` Output the required startup banner exactly as mandated by the bootloader.

## Workspace Repair & Cleanup Tasks

Once you have booted the Engineering OS, proceed with the following:

- `[ ]` **Global Path Scrub (Eradicate `D:\`):**
  - Search the entire workspace (`C:\MCP`) for any remaining references to the `D:` drive (e.g., `D:\`, `d:\`, `D:/`). 
  - Update any found paths to point to their new location (e.g., `D:\projects\MCP` should become `C:\MCP`).
  - *Hint: Check scripts like `_canon_enum.ps1` and `_canon_copy.ps1` first.*

- `[ ]` **Reinstall Node Dependencies:** 
  - Delete the `node_modules` folder in `C:\MCP` completely to remove any stale symlinks or binary paths hardcoded to `D:`.
  - Run `npm install` in `C:\MCP` to perform a fresh, clean installation on the new drive.

- `[ ]` **Verify:**
  - Let the user know the fixes have been applied.
  - Ask them if Ghost and SonarLint are no longer crashing and if the VSX MCP build is ready for active development again.
