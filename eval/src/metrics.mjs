export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function latencyStat(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) {
    return { count: 0, mean: 0, p50: 0, p90: 0, p95: 0, max: 0 };
  }
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    count: sorted.length,
    mean: Number(mean.toFixed(2)),
    p50: Number(percentile(sorted, 50).toFixed(2)),
    p90: Number(percentile(sorted, 90).toFixed(2)),
    p95: Number(percentile(sorted, 95).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

export function computeMetrics(results) {
  const m = {
    total: results.length,
    successful: 0,
    failed: 0,
    accuracy: 0,
    precision: 0,
    recall: 0,
    f1: 0,
    confusion_matrix: { tp: 0, tn: 0, fp: 0, fn: 0 },
  };
  for (const r of results) {
    if (r.status === "ok") m.successful += 1;
    else m.failed += 1;
    const t = r.truth_positive;
    const p = r.predicted_positive;
    if (t && p) m.confusion_matrix.tp += 1;
    else if (!t && !p) m.confusion_matrix.tn += 1;
    else if (!t && p) m.confusion_matrix.fp += 1;
    else m.confusion_matrix.fn += 1;
  }
  const cm = m.confusion_matrix;
  const denom = cm.tp + cm.tn + cm.fp + cm.fn;
  m.accuracy = denom ? (cm.tp + cm.tn) / denom : 0;
  m.precision = cm.tp + cm.fp ? cm.tp / (cm.tp + cm.fp) : 0;
  m.recall = cm.tp + cm.fn ? cm.tp / (cm.tp + cm.fn) : 0;
  m.f1 =
    m.precision + m.recall
      ? (2 * m.precision * m.recall) / (m.precision + m.recall)
      : 0;
  return m;
}

export function groupBy(items, key) {
  const out = {};
  for (const item of items) {
    const k = key(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}
