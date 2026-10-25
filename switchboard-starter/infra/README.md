# Local infrastructure

Postgres and Redis are optional for the current in-memory services. Start them only when a service is configured to use `DATABASE_URL` or `REDIS_URL`.

```bash
cd switchboard-starter/infra
docker compose up -d postgres redis
```

Postgres listens on `localhost:5432` (`switchboard` / `localonly` / database `switchboard`). Redis listens on `localhost:6379`.

## App run order

Use Node 20.19.1 and pnpm 9.15.0. From `switchboard-starter`:

```bash
export PATH="$HOME/.nvm/versions/node/v20.19.1/bin:$PATH"
pnpm install
```

1. Markets on port **4102** (Agent B). Execution posts orders here.
2. Execution on port **4103**:

   ```bash
   pnpm --filter @switchboard/execution dev
   ```

3. Strategy on port **4101** (Agent A).
4. Web on port **3000**.

The compose file also defines an `execution` service that builds `services/execution/Dockerfile` with context `switchboard-starter`. It does not depend on Postgres. Strategy and markets Dockerfiles are not referenced, because those directories belong to other agents and may not contain Dockerfiles yet.

```bash
docker compose up --build execution
```

`AP4M_MODE` in that service is `mock`. No agent private key is set.
