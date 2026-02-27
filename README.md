<div align="center">

<img src="resources/icon.png" alt="My-Coder Logo" width="120"/>

# 🤖 My-Coder

### The Ultimate AI Coding Assistant for Visual Studio Code

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-82%25-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Persistent%20History-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Google Drive](https://img.shields.io/badge/Google%20Drive-Cloud%20Sync-4285F4?style=for-the-badge&logo=google-drive&logoColor=white)](https://drive.google.com/)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4%EF%B8%8F-brightgreen?style=for-the-badge)](https://github.com/Abd-ul-Hannan/My-Coder)
[![Status](https://img.shields.io/badge/Status-Ready%20for%20Public%20Use-success?style=for-the-badge)]()

<br/>

> **My-Coder** is a powerful, open-source VS Code extension that brings AI-driven coding directly into your editor.  
> Chat with AI, generate full projects, fix bugs, refactor code, and more — all without ever leaving VS Code.  
> **Bring your own API key. Works with any supported AI model.**

<br/>

</div>

---

## 🌟 Why My-Coder?

Most AI coding tools are locked behind subscriptions, limited in features, or require you to switch between apps. **My-Coder** is different:

- 🔓 **Fully Open Source** — no hidden costs, no black boxes
- 🔑 **Your API Key, Your Control** — plug in any supported AI provider and go
- 🧠 **Truly Intelligent** — not just autocomplete; understands your full codebase context
- 💾 **Persistent Memory** — every conversation is saved locally with SQLite
- ☁️ **Cloud Backup** — optionally sign in with Google to sync history across all your devices
- ⚡ **Lives Inside VS Code** — zero context switching, maximum productivity

---

## ✨ Features

### 💬 AI Chat Panel
Open a dedicated chat panel inside VS Code and have real conversations with your AI model. Ask anything — from quick syntax questions to deep architectural decisions.

### 🖱️ Right-Click Context Menu
Select any block of code, right-click, and instantly invoke AI actions on it. No copy-pasting, no switching tabs.

### 🏗️ Full Project Generation
Describe what you want to build and My-Coder will generate an entire project from scratch — in **any programming language**. Frontend, backend, scripts, configs — all of it.

### 🐛 Bug Detection & Fixing
My-Coder reads your code, identifies bugs, explains what went wrong, and provides a corrected version with a clear explanation.

### ✏️ Code Editing & Refactoring
Ask My-Coder to clean up messy code, rename variables, extract functions, improve readability, or apply best practices — it handles it all.

### 🔍 Code Search & Understanding
Highlight unfamiliar code and ask My-Coder to explain it line by line. Great for working on legacy codebases or learning new frameworks.

### 🔄 Code Updates & Modernization
Tell My-Coder to upgrade old code to modern standards — update deprecated APIs, migrate between frameworks, or apply new language features.

### 🗄️ Persistent Chat History (SQLite)
Every conversation is automatically saved to a local SQLite database. Your history is always there when you come back — organized and searchable.

### ☁️ Google Drive Backup (Optional)
Want your chat history safe across devices? Sign in with your Google account and My-Coder will automatically sync and back up your entire chat history to your Google Drive — so you never lose a conversation, even if you switch machines.

---

## 📸 Preview

> _Add screenshots or a demo GIF of your extension here_

```
[ Chat Panel Screenshot ]         [ Context Menu Screenshot ]
```

---

## 🚀 Getting Started

### Step 1 — Prerequisites

| Tool | Version |
|---|---|
| [Visual Studio Code](https://code.visualstudio.com/) | `v1.75.0` or higher |
| [Node.js](https://nodejs.org/) | `v16.x` or higher |
| [npm](https://www.npmjs.com/) | `v8.x` or higher |
| An AI API Key | OpenAI / Gemini / Claude / any supported model |

---

### Step 2 — Installation

**Clone the repository**

```bash
git clone https://github.com/Abd-ul-Hannan/My-Coder.git
cd My-Coder
```

**Install dependencies**

```bash
npm install
```

**Build the extension**

```bash
npm run build
```

**Launch in VS Code**

Press `F5` inside VS Code to open an **Extension Development Host** window with My-Coder active.

---

### Step 3 — Add Your API Key

My-Coder is model-agnostic and fully open source. You bring your own API key:

1. Open VS Code Settings (`Ctrl + ,` or `Cmd + ,` on Mac)
2. Search for **`My-Coder`**
3. Paste your API key into the **API Key** field
4. Select your preferred **AI Model**
5. Save — you're ready to go! 🎉

> **Supported Providers:** OpenAI (GPT-4o, GPT-4, GPT-3.5), Anthropic (Claude), Google (Gemini), and more.

---

## 🖱️ How to Use

### Chat Panel

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Type **`My-Coder: Open Chat`**
3. Start talking to your AI coding assistant

### Context Menu (Right-Click on Code)

1. **Select** any code in the editor
2. **Right-click** to open the context menu
3. Choose a **My-Coder** action:
   - `Explain this code`
   - `Fix bugs`
   - `Refactor`
   - `Add comments`
   - `Find issues`
   - `Update / modernize`

See [CONTEXT_MENU.md](CONTEXT_MENU.md) for the full list of actions.

### Generate a Full Project from Scratch

1. Open the Chat Panel
2. Describe what you want — _"Create a full REST API in Node.js with Express and MongoDB"_
3. My-Coder generates the complete project: folder structure, files, and all code
4. Works for **any language** — Python, Java, C++, React, Flutter, and more

---

## 🗄️ SQLite — Local Chat History

All conversations are stored locally in a SQLite database on your machine by default.

- ✅ No cloud sync, no tracking, no data leaving your device
- ✅ History persists across VS Code sessions and restarts
- ✅ Database is created automatically on first use — zero setup

See [SQLITE_SETUP.md](SQLITE_SETUP.md) for the full schema and advanced configuration.

---

## ☁️ Google Drive — Cloud Chat History (Optional)

Want your chat history backed up and available across all your devices? My-Coder supports **Google Drive sync** as an optional feature.

### How to enable it

1. Open the My-Coder panel inside VS Code
2. Click **"Sign in with Google"**
3. Authenticate with your Google account
4. My-Coder will automatically sync your chat history to a dedicated folder in your Google Drive

### What gets saved

| Data | Saved Locally (SQLite) | Saved to Google Drive |
|---|---|---|
| Chat messages | ✅ Always | ✅ When signed in |
| AI responses | ✅ Always | ✅ When signed in |
| Timestamps | ✅ Always | ✅ When signed in |

### Privacy

- My-Coder only accesses the folder it creates in your Drive — nothing else
- You can revoke access at any time from your [Google Account settings](https://myaccount.google.com/permissions)
- Signing out of Google Drive in My-Coder immediately stops all syncing

---

## 🗂️ Project Structure

```
My-Coder/
├── src/                    # TypeScript source code
│   ├── extension.ts        # Main extension entry point
│   ├── panel/              # Webview chat panel logic
│   ├── commands/           # VS Code command handlers
│   ├── contextMenu/        # Right-click menu actions
│   └── db/                 # SQLite database layer
├── media/                  # CSS & JS assets for the webview UI
├── resources/              # Icons and static assets
├── dist/                   # Compiled & bundled output (auto-generated)
├── .eslintrc.json          # ESLint configuration
├── .vscodeignore           # Files excluded from packaging
├── package.json            # Extension manifest & metadata
├── tsconfig.json           # TypeScript compiler config
├── webpack.config.js       # Webpack bundler config
├── SQLITE_SETUP.md         # SQLite setup documentation
├── CONTEXT_MENU.md         # Context menu documentation
└── BUG-FIXES.md            # Bug fix changelog
```

---

## 🔧 VS Code Settings

| Setting | Description | Default |
|---|---|---|
| `myCoder.apiKey` | Your AI provider API key | `""` |
| `myCoder.model` | AI model to use (e.g. `gpt-4o`, `gemini-pro`) | `"gpt-4o"` |
| `myCoder.maxHistory` | Max messages to keep in local history | `100` |
| `myCoder.temperature` | AI creativity level (0.0 – 1.0) | `0.7` |

---

## 🛠️ Development Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile & bundle the extension with Webpack |
| `npm run watch` | Watch mode — auto-rebuild on file changes |
| `npm run lint` | Run ESLint to catch code issues |
| `npm run package` | Package the extension as a `.vsix` file |

---

## 📋 Roadmap

- [x] AI Chat Panel inside VS Code
- [x] Right-click context menu integration
- [x] Persistent chat history with SQLite
- [x] Bug detection and fixing
- [x] Code editing, refactoring, and modernization
- [x] Full project generation from scratch in any language
- [x] Google Drive sign-in & cloud chat history sync
- [ ] Publish to VS Code Marketplace
- [ ] Multi-model switching from the UI panel
- [x]Inline code completions
- [ ] Multi-file / codebase-wide context awareness
- [ ] Export chat history as Markdown or PDF
- [ ] Custom prompt templates

---

## 🤝 Contributing

My-Coder is open source and contributions are welcome from developers of all levels!

```bash
# 1. Fork this repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/My-Coder.git

# 3. Create a feature branch
git checkout -b feature/your-feature-name

# 4. Make your changes, then commit
git commit -m "feat: describe your change"

# 5. Push and open a Pull Request
git push origin feature/your-feature-name
```

Please run `npm run lint` before submitting. All PRs are welcome!

---

## 🐛 Bug Reports

Found a bug? [Open an issue](https://github.com/Abd-ul-Hannan/My-Coder/issues) with:

- Your VS Code version
- Your OS (Windows / Mac / Linux)
- Steps to reproduce the issue
- What you expected vs what happened

For a log of resolved bugs, see [BUG-FIXES.md](BUG-FIXES.md).

---

## 📄 License

This project is licensed under the **MIT License** — free to use, modify, and distribute.  
See the [LICENSE](LICENSE) file for full details.

---

<div align="center">

Built with ❤️ by **Abd-ul-Hannan**

[![GitHub](https://img.shields.io/badge/GitHub-Abd--ul--Hannan-181717?style=for-the-badge&logo=github)](https://github.com/Abd-ul-Hannan)

---

### ⭐ Found My-Coder useful? Give it a star — it helps more developers discover it! ⭐

</div>
