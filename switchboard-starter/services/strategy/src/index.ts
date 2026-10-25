import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? '4101');
const app = buildApp();

app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`strategy listening on ${port}`);
}).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
