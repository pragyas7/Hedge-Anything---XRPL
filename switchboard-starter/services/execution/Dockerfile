# Build context is switchboard-starter (the directory that contains pnpm-workspace.yaml).
# docker compose in infra/ sets context to "..".
FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json packages/contracts/
COPY packages/contracts/src packages/contracts/src
COPY services/execution/package.json services/execution/tsconfig.json services/execution/
COPY services/execution/src services/execution/src
COPY services/execution/dev-keys services/execution/dev-keys

# No lockfile is copied. Do not pass --frozen-lockfile.
RUN pnpm install --filter @switchboard/execution...

WORKDIR /app/services/execution
EXPOSE 4103
CMD ["pnpm", "start"]
