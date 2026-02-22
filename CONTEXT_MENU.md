# Context Menu & Bottom Panel Features

## Right-Click Context Menu

When you right-click on any code in the editor, you'll see a **MY Coder** submenu with these options:

### 📍 Available on Selection

| Command | What it does | Shortcut |
|---|---|---|
| **💡 Explain** | Opens chat with explanation of selected code in simple terms | — |
| **♻️ Refactor** | Opens chat with refactored version (cleaner, more maintainable) | — |
| **📤 Send to Prompt** | Copies selection into chat input so you can add your own instructions | — |
| **🧪 Generate Tests** | Opens chat with comprehensive test suite for the selected code | — |
| **⚡ Optimize** | Opens chat with performance-optimized version of selected code | — |
| **🔧 Fix** | Opens chat with bugs fixed and issues resolved | — |

### 📍 Always Available

| Command | What it does | Shortcut |
|---|---|---|
| **💬 Inline Chat** | Shows inline input box at cursor — type instruction, AI modifies code in-place | `Ctrl+I` / `Cmd+I` |

---

## Inline Chat (Ctrl+I / Cmd+I)

Similar to GitHub Copilot's inline chat:

1. Place cursor anywhere in your code
2. Press **Ctrl+I** (Windows/Linux) or **Cmd+I** (Mac)
3. Type your instruction (e.g., "Add error handling", "Extract to function", "Add JSDoc comments")
4. AI generates the modified code and applies it directly

No need to open the chat panel — edits happen **inline**.

---

## Bottom Panel (Ctrl+Shift+P / Cmd+Shift+P)

A toggleable panel at the bottom with three tabs:

### 1️⃣ Problems Tab

- Shows all TypeScript/ESLint errors and warnings from your workspace
- Click any problem to jump to that file/line
- Live updates as you fix issues

### 2️⃣ AI Actions Tab

Quick-access buttons for common AI tasks:

| Button | Action |
|---|---|
| 💡 Explain Code | Explains active file or selection |
| ♻️ Refactor | Refactors active file or selection |
| 🧪 Generate Tests | Generates tests for active file |
| ⚡ Optimize | Optimizes active file for performance |
| 🔧 Fix Issues | Detects and fixes all issues in active file |
| 🔍 Code Review | Full code review of active file |
| 🔒 Security Scan | Security audit (SAST, secrets detection, etc.) |

All buttons automatically:
1. Run the AI action on your active file
2. Open the main MY Coder chat panel
3. Show results as a diff you can approve

### 3️⃣ Terminal Tab

*(Coming soon — terminal integration)*

---

## How It Works

All context menu commands and bottom panel actions **integrate with the main chat panel**. They:

1. Take your selection or active file
2. Build the appropriate prompt
3. Send it to the chat panel
4. Show results as a diff you can **Apply** or **Reject**

This gives you:
- **Speed** — right-click → action, no typing
- **Safety** — always review changes before applying
- **Consistency** — same AI quality as the main chat
- **Flexibility** — can edit the prompt before sending

---

## Keyboard Shortcuts Summary

| Action | Windows/Linux | Mac |
|---|---|---|
| Inline Chat | `Ctrl+I` | `Cmd+I` |
| Bottom Panel | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| Open Chat Panel | `Ctrl+Shift+M` | `Cmd+Shift+M` |
| Trigger Inline Completion | `Alt+C` | `Option+C` |

---

## Example Workflows

### Fix a bug quickly
1. Select buggy code
2. Right-click → **MY Coder** → **Fix**
3. Chat opens with the fix
4. Review diff → **Apply**

### Generate tests
1. Select function to test
2. Right-click → **MY Coder** → **Generate Tests**
3. Chat shows full test suite
4. Copy to new test file

### Refactor inline
1. Place cursor in messy function
2. Press `Ctrl+I` / `Cmd+I`
3. Type: "Extract validation logic to separate function"
4. AI rewrites the code in-place

### Check workspace health
1. Press `Ctrl+Shift+P` / `Cmd+Shift+P` to open bottom panel
2. Click **Problems** tab → see all errors
3. Click **AI Actions** → **Fix Issues** → auto-fix all detected problems
