# SQLite Setup for MY Coder

`better-sqlite3` is a native Node.js module. VS Code runs extensions inside its
own Electron runtime, so the module must be **rebuilt** against that runtime
before it will load. Without this step the extension silently falls back to the
JSON file-based storage.

---

## Quick setup (one-time, after `npm install`)

```bash
cd my-coder/

# 1. Install all dependencies
npm install

# 2. Find your VS Code Electron version
code --version
# e.g. "1.87.2"
# Electron version is shown in Help → About

# 3. Rebuild better-sqlite3 for VS Code's Electron
npx @electron/rebuild -f -w better-sqlite3 \
  --runtime electron \
  --target <ELECTRON_VERSION> \
  --dist-url https://electronjs.org/headers \
  --arch x64

# Example for VS Code 1.87 (Electron 28):
npx @electron/rebuild -f -w better-sqlite3 \
  --runtime electron \
  --target 28.3.3 \
  --dist-url https://electronjs.org/headers \
  --arch x64
```

After rebuilding, the `.node` binary will be in
`node_modules/better-sqlite3/build/Release/better_sqlite3.node`.

---

## What the VS Code / Electron version mapping looks like

| VS Code | Electron | Node ABI |
|---------|----------|----------|
| 1.87.x  | 28.x     | 116      |
| 1.86.x  | 27.x     | 115      |
| 1.85.x  | 26.x     | 114      |

Run `process.versions.electron` in the VS Code developer console
(Help → Toggle Developer Tools → Console) to confirm.

---

## What happens if you skip this step?

The extension detects the load failure and automatically falls back to the
previous JSON-file storage. All features continue to work — you just won't get
the SQLite backend or Google Drive sync of sessions/keys.

You will see this in the VS Code developer console:
```
[MY Coder] SQLite init failed, using JSON fallback: Error: ...
```

---

## Verifying the setup works

1. Open MY Coder in VS Code.
2. Open Help → Toggle Developer Tools → Console.
3. You should NOT see `SQLite init failed`.
4. Type a chat message — a session should appear in the sidebar.
5. The database file is at:
   `~/.vscode/extensions/my-coder-*/globalStorage/my-coder.db`

---

## Google Drive sync of API keys

When you sign in to Google and save an API key, that key is written to:
1. **VS Code SecretStorage** — encrypted, specific to this machine.
2. **SQLite `api_keys` table** — travels with your `my-coder.db` to Drive.

On a new machine, after signing in to Google, MY Coder pulls the Drive DB,
finds your API key in the `api_keys` table, and automatically promotes it into
the local SecretStorage. You don't need to re-enter your API key.
