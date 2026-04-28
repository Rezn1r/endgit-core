# EndGit Core

**CI/CD + Plugin Marketplace API for Endstone**

EndGit Core is the backend API server that powers the EndGit ecosystem — a CI/CD pipeline and plugin marketplace designed specifically for [Endstone](https://github.com/EndstoneMC/endstone) Bedrock Dedicated Server plugins.

## Features

- 🔐 **GitHub OAuth** — Authenticate with GitHub, auto-link repositories
- 📦 **Plugin Management** — Full CRUD for plugins, versions, and metadata
- 🔄 **GitHub Webhooks** — Auto-trigger builds on `git push`
- 📤 **Artifact Storage** — Local filesystem or S3-compatible (AWS, MinIO, R2)
- ⭐ **Ratings & Reviews** — Community feedback system
- 🛡️ **Moderation** — Admin tools for plugin quality control
- 🔑 **JWT Auth** — Secure API with role-based access

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker (for PostgreSQL + Redis)
- pnpm

### Setup

```bash
# Clone
git clone https://github.com/two-tech-dev/endgit-core.git
cd endgit-core

# Start databases
docker-compose up -d

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your GitHub App credentials

# Generate Prisma client & push schema
pnpm db:generate
pnpm db:push

# Start development server
pnpm dev
```

The API will be available at `http://localhost:4000`.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/auth/login` | Login with GitHub token |
| `GET` | `/api/v1/plugins` | List plugins |
| `GET` | `/api/v1/plugins/:slug` | Plugin details |
| `GET` | `/api/v1/builds/:id` | Build details |
| `POST` | `/api/v1/github/repos/:id/enable` | Enable CI for a repo |
| `POST` | `/api/v1/webhooks/github` | GitHub webhook receiver |
| `GET` | `/api/v1/download/file/:key` | Download artifact |

## Architecture

```
endgit-core/
├── src/
│   ├── index.ts          # Express app entry
│   ├── routes/           # API route handlers
│   └── middleware/        # Auth, rate limiting
├── packages/
│   ├── database/         # Prisma schema & client
│   ├── storage/          # S3 / Local storage providers
│   └── types/            # Shared TypeScript types
└── docker-compose.yml    # PostgreSQL + Redis
```

## Related Repositories

| Repository | Description |
|------------|-------------|
| [endgit-web](https://github.com/two-tech-dev/endgit-web) | Next.js web dashboard |
| [endgit-worker](https://github.com/two-tech-dev/endgit-worker) | Build worker (Docker sandboxing) |
| [endgit-cli](https://github.com/two-tech-dev/endgit-cli) | CLI tool for developers |

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
