import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATASET_ROOT = process.env.DATASET_ROOT
  ? resolve(process.env.DATASET_ROOT)
  : resolve(__dirname, "..", "dataset");

export async function loadDataset() {
  const path = resolve(DATASET_ROOT, "build/benchmark.dataset.json");
  const raw = await readFile(path, "utf8");
  const dataset = JSON.parse(raw);
  return { root: DATASET_ROOT, dataset };
}

export function truthPositive(c) {
  return c.label === "black";
}

// Dataset paths may be prefixed with tests/evaluation-dataset/; strip that so
// they resolve to files inside the extracted dataset root.
export function normalizeAssetPath(p) {
  if (!p) return p;
  return p.replace(/^(tests\/)?evaluation-dataset\//, "");
}
