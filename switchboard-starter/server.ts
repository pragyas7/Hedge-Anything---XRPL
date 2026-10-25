import { createDemoApp } from "./demo/app.js";

const gateway = await createDemoApp();
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4110);
  await gateway.listen({ port, host: "0.0.0.0" });
  console.log(`switchboard demo listening on ${port}`);
}

export default gateway;
