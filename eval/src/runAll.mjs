import { runFunctional } from "./runFunctional.mjs";
import { runLatency } from "./runLatency.mjs";
import { runStress } from "./runStress.mjs";

async function main() {
  const only = (process.env.ONLY ?? "functional,latency,stress").split(",").map((s) => s.trim());
  if (only.includes("functional")) await runFunctional();
  if (only.includes("latency")) await runLatency();
  if (only.includes("stress")) await runStress();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
