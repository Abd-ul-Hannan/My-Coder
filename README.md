# 🤖 MY Coder — AI-Powered Developer Agent for VS Code

An autonomous AI coding assistant that plans, generates, debugs, and evolves real projects inside VS Code.

---

## Architecture (v2 — Issue 3 Refactor)

```
src/
├── types.ts                    ← All shared types (no business logic)
│
├── ai/                         ← AI Protocol Layer
│   ├── aiService.ts            ← Universal client: OpenAI-compat + Anthropic SDK
│   └── apiKeyValidator.ts      ← Issue 1: key prefix detection, mismatch prevention
│
├── interview/                  ← Interview Engine Layer (Issue 2)
│   ├── interviewEngine.ts      ← Orchestrator: AI inference + state machine
│   ├── interviewStateMachine.ts← State: intent→refinement→stack→auth→deploy→confirm
│   └── intentInferrer.ts       ← AI: free text → InferredIntent JSON
│
├── planning/                   ← Planning Layer
│   ├── plannerAgent.ts         ← AI: ProjectInterview → DevelopmentPlan JSON
│   ├── codeAgent.ts            ← AI: FileSpec → complete file content (streaming)
│   └── fixAgent.ts             ← AI: BuildResult → targeted file fixes
│
├── core/                       ← Core Business Logic
│   ├── workspaceAnalyzer.ts    ← Detect framework, language, files, build command
│   ├── projectBuilder.ts       ← Create dirs, write files, open in VS Code
│   ├── patchManager.ts         ← Diff generation, backup, rollback
│   └── buildRunner.ts          ← Spawn build process, parse TypeScript/Vite errors
│
├── storage/                    ← Storage Layer
│   ├── historyManager.ts       ← Session lifecycle, provider switching
│   ├── localStorageProvider.ts ← File-based sessions in globalStorageUri
│   ├── driveStorageProvider.ts ← Google Drive appData folder
│   └── googleAuth.ts           ← OAuth2 flow (localhost:9876 redirect)
│
├── ui/                         ← UI Layer
│   └── chatPanel.ts            ← WebviewPanel controller, message routing
│
└── extension.ts                ← VS Code entry point, command registration
```

### Dependency Flow (no circular deps)

```
types.ts
  ↑
ai/          (depends on: types)
  ↑
interview/   (depends on: ai, types)
planning/    (depends on: ai, types)
core/        (depends on: types)
storage/     (depends on: types)
  ↑
ui/          (depends on: ai, interview, planning, core, storage, types)
  ↑
extension.ts (depends on: ui)
```

---

## Issue 1 — API Key Validation

**Problem:** Groq key (`gsk_...`) saved with provider set to `openai` → 401.

**Solution (`src/ai/apiKeyValidator.ts`):**

| Key prefix | Detected provider |
|---|---|
| `sk-ant-` | anthropic |
| `sk-or-` | openrouter |
| `gsk_` | groq |
| `AIza` | gemini |
| `sk-` | openai |

- Validation runs **before** any API call — in `AIService` constructor and before saving keys.
- Mismatch shows: _"API key looks like a Groq key but provider is set to OpenAI"_
- 401 errors caught and shown as: _"Invalid API key or wrong provider selected."_
- `testConnection()` makes a minimal safe request, never throws.

---

## Issue 2 — Dynamic Interview

**Old:** Static 9-step interview, same questions for every project.

**New (`src/interview/`):**

```
User types: "I want to build a Stripe-powered SaaS dashboard"
                        ↓
              intentInferrer (AI call)
                        ↓
    InferredIntent: { projectType: 'web', appCategory: 'saas',
                      suggestedFramework: 'nextjs', confidence: 'high' }
                        ↓
    InterviewStateMachine shows refinement question with inferred values
    User: "yes" → skip stack-selection → go straight to auth
    User: "change to Vue" → show only web frameworks
                        ↓
    auth → deployment → features (filtered by appCategory) → confirmation
                        ↓
                  ProjectInterview (finalized)
```

**Phases:**
1. `intent` — free text, "What do you want to build?"
2. `refinement` — show inferred stack, confirm or correct
3. `stack-selection` — only if user wants to change (filtered by projectType)
4. `auth` — auth provider
5. `deployment` — deploy target
6. `features` — options filtered by `appCategory` (ecommerce ≠ game ≠ dashboard)
7. `confirmation` — full summary
8. `finalized` — ready to build

---

## Supported Providers

| Provider | Key prefix | Free tier |
|---|---|---|
| OpenAI | `sk-` | ❌ |
| Anthropic | `sk-ant-` | ❌ |
| Groq | `gsk_` | ✅ (fast Llama) |
| Google Gemini | `AIza` | ✅ |
| Mistral AI | — | ❌ |
| Ollama | none needed | ✅ local |
| OpenRouter | `sk-or-` | ✅ (some models) |
| Custom | configurable | — |

---

## Setup

```bash
npm install
npm run compile
# Press F5 → Extension Development Host
# Ctrl+Shift+P → MY Coder: Open Panel
# Click ⚙️ → select provider → paste key → Test Connection → Save
```

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `myCoder.aiProvider` | string | `openai` | Active AI provider |
| `myCoder.model` | string | `gpt-4o` | Model name |
| `myCoder.customBaseUrl` | string | — | Override API base URL |
| `myCoder.maxRetries` | number | `3` | Build auto-fix retries |
| `myCoder.autoRunBuild` | boolean | `true` | Run build after generation |
