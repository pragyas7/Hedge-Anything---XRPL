import { buildApp } from "./app.js";

const app = await buildApp();
await app.listen({ port: app.config.port, host: "0.0.0.0" });
console.log(`markets listening on ${app.config.port}`);
