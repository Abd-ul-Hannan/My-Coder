"use strict";
// src/integrations/deploymentAgent.ts
// ─────────────────────────────────────────────────────────────────────────────
// Deployment Agent
//
// Generates complete deployment configurations:
//   - Vercel (vercel.json, GitHub Actions deploy)
//   - Docker (Dockerfile, docker-compose.yml)
//   - Railway (railway.json)
//   - Fly.io (fly.toml)
//   - CI/CD pipelines (GitHub Actions: lint, test, build, deploy)
//   - Environment variable documentation
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeploymentAgent = void 0;
class DeploymentAgent {
    aiService;
    constructor(aiService) {
        this.aiService = aiService;
    }
    /**
     * Generates all deployment configuration files for the selected target.
     */
    async generateDeploymentConfig(interview, plan) {
        switch (interview.deploymentTarget) {
            case 'vercel': return this.generateVercel(interview, plan);
            case 'docker': return this.generateDocker(interview, plan);
            case 'railway': return this.generateRailway(interview, plan);
            case 'fly': return this.generateFly(interview, plan);
            case 'aws': return this.generateAWS(interview, plan);
            default: return this.generateGenericCI(interview, plan);
        }
    }
    // ─── Vercel ──────────────────────────────────────────────────────────────
    async generateVercel(interview, plan) {
        const vercelJson = JSON.stringify({
            buildCommand: plan.buildInstructions[0]?.command ?? 'npm run build',
            outputDirectory: '.next',
            framework: interview.framework === 'nextjs' ? 'nextjs' : undefined,
            regions: ['iad1'],
            env: plan.envVariables
                .filter(v => v.required)
                .reduce((acc, v) => ({ ...acc, [v.key]: `@${v.key.toLowerCase().replace(/_/g, '-')}` }), {}),
        }, null, 2);
        const ciYaml = this.githubActionsCI(interview, 'vercel', [
            '- name: Deploy to Vercel',
            '  uses: amondnet/vercel-action@v25',
            '  with:',
            '    vercel-token: ${{ secrets.VERCEL_TOKEN }}',
            '    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}',
            '    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}',
            '    vercel-args: --prod',
        ].join('\n'));
        return {
            files: [
                { path: 'vercel.json', content: vercelJson },
                { path: '.github/workflows/deploy.yml', content: ciYaml },
                { path: '.env.example', content: plan.envVariables.map(v => `${v.key}=${v.example ?? ''} # ${v.description}`).join('\n') },
            ],
            instructions: '1. Install Vercel CLI: `npm i -g vercel`\n2. Run `vercel login`\n3. Run `vercel --prod`\n4. Set environment variables in Vercel dashboard.',
        };
    }
    // ─── Docker ──────────────────────────────────────────────────────────────
    async generateDocker(interview, plan) {
        const isNode = ['nextjs', 'react', 'vue', 'nestjs', 'express', 'fastify'].includes(interview.framework);
        const isPython = interview.language === 'python';
        let dockerfile = '';
        if (isPython) {
            dockerfile = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`;
        }
        else if (isNode) {
            const buildCmd = plan.buildInstructions[0]?.command ?? 'npm run build';
            dockerfile = `FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ${buildCmd}

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]`;
        }
        const compose = `version: '3.9'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
${plan.envVariables.filter(v => v.required).map(v => `      - ${v.key}=\${${v.key}}`).join('\n')}
    restart: unless-stopped
${interview.database !== 'none' && interview.database !== 'supabase' ? `  db:
    image: ${interview.database === 'mongodb' ? 'mongo:7' : 'postgres:16-alpine'}
    restart: unless-stopped
    volumes:
      - db-data:/var/lib/${interview.database === 'mongodb' ? 'mongodb' : 'postgresql'}

volumes:
  db-data:` : ''}`;
        const ciYaml = this.githubActionsCI(interview, 'docker', [
            '- name: Build and push Docker image',
            '  uses: docker/build-push-action@v5',
            '  with:',
            '    push: true',
            '    tags: ${{ env.IMAGE_NAME }}:latest',
        ].join('\n'));
        return {
            files: [
                { path: 'Dockerfile', content: dockerfile },
                { path: 'docker-compose.yml', content: compose },
                { path: '.dockerignore', content: 'node_modules\n.next\n.git\n*.log\n.env' },
                { path: '.github/workflows/deploy.yml', content: ciYaml },
            ],
            instructions: '1. `docker build -t my-app .`\n2. `docker-compose up -d`\n3. Set env vars in a `.env` file.',
        };
    }
    // ─── Railway ─────────────────────────────────────────────────────────────
    async generateRailway(interview, plan) {
        const railwayJson = JSON.stringify({
            build: { builder: 'NIXPACKS' },
            deploy: {
                startCommand: plan.buildInstructions[0]?.command ? 'npm start' : undefined,
                healthcheckPath: '/api/health',
                restartPolicyType: 'ON_FAILURE',
            },
        }, null, 2);
        return {
            files: [
                { path: 'railway.json', content: railwayJson },
                { path: '.github/workflows/deploy.yml', content: this.githubActionsCI(interview, 'railway', '') },
            ],
            instructions: '1. Install Railway CLI: `npm i -g @railway/cli`\n2. `railway login`\n3. `railway up`',
        };
    }
    // ─── Fly.io ──────────────────────────────────────────────────────────────
    async generateFly(interview, plan) {
        const flyToml = `app = "${interview.projectName}"
primary_region = "iad"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1
`;
        return {
            files: [
                { path: 'fly.toml', content: flyToml },
                { path: '.github/workflows/deploy.yml', content: this.githubActionsCI(interview, 'fly', [
                        '- name: Deploy to Fly.io',
                        '  uses: superfly/flyctl-actions/setup-flyctl@master',
                        '- run: flyctl deploy --remote-only',
                        '  env:',
                        '    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}',
                    ].join('\n')) },
            ],
            instructions: '1. Install: `brew install flyctl`\n2. `fly auth login`\n3. `fly launch`\n4. `fly deploy`',
        };
    }
    // ─── AWS ─────────────────────────────────────────────────────────────────
    async generateAWS(interview, plan) {
        const response = await this.aiService.complete([{ role: 'user', content: `Generate AWS deployment config for: ${interview.projectName} (${interview.framework}, ${interview.language}). Include: Dockerfile, buildspec.yml for CodeBuild, and basic CloudFormation template.` }], 'You are an AWS DevOps expert. Return only the requested files as a JSON object: { "Dockerfile": "...", "buildspec.yml": "...", "cloudformation.yaml": "..." }. No markdown.');
        try {
            const cleaned = response.content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
            const parsed = JSON.parse(cleaned);
            return {
                files: Object.entries(parsed).map(([p, c]) => ({ path: p, content: c })),
                instructions: 'Set up AWS credentials and run: `aws cloudformation deploy --template-file cloudformation.yaml --stack-name my-app`',
            };
        }
        catch {
            return { files: [], instructions: 'Use the Docker deployment option for AWS ECS/EKS.' };
        }
    }
    // ─── Generic CI ──────────────────────────────────────────────────────────
    async generateGenericCI(interview, plan) {
        return {
            files: [{ path: '.github/workflows/ci.yml', content: this.githubActionsCI(interview, 'generic', '') }],
            instructions: 'CI/CD pipeline added. Push to main to trigger build and tests.',
        };
    }
    // ─── GitHub Actions Template ──────────────────────────────────────────────
    githubActionsCI(interview, target, deploySteps) {
        const isNode = interview.language === 'typescript' || interview.language === 'javascript';
        return `name: CI/CD — ${interview.projectName}

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      ${isNode ? `- uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run test --if-present
      - run: npm run build` : `- uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: python -m pytest`}

  ${target !== 'generic' ? `deploy:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      ${deploySteps}` : ''}
`;
    }
}
exports.DeploymentAgent = DeploymentAgent;
//# sourceMappingURL=deploymentAgent.js.map