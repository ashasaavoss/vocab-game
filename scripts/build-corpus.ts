/**
 * Build a vocabulary corpus for IRT-based adaptive testing.
 *
 * Pipeline:
 *   1. Fetch ranked English frequency list (OpenSubtitles 2018).
 *   2. For each lemma in rank order, pull a first-sense gloss from WordNet 3.1.
 *      Parse WordNet index/data files directly (much faster than wordpos lookups).
 *   3. Compute difficulty β for each kept word using a probit transform:
 *        beta_i = Φ⁻¹((rank_i - 0.5) / N)
 *      This stretches β over roughly [-4.3, +4.3] for N≈60k, putting the hard
 *      tail at β≈+4 instead of β≈+1 (as with SD-standardization of log-rank).
 *      High-ability users can now actually be challenged.
 *   4. Write client/public/corpus.json.
 *
 * Run: `npm run build:corpus`
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "client", "public", "corpus.json");

const require = createRequire(import.meta.url);
const WORDNET_DICT = dirname(require.resolve("wordnet-db/dict/index.noun"));

const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt";

type Pos = "n" | "v" | "a" | "r";
const POS_FILES: Record<Pos, { index: string; data: string }> = {
  n: { index: "index.noun", data: "data.noun" },
  v: { index: "index.verb", data: "data.verb" },
  a: { index: "index.adj", data: "data.adj" },
  r: { index: "index.adv", data: "data.adv" },
};
const POS_PRIORITY: Pos[] = ["n", "v", "a", "r"];

type CorpusEntry = {
  word: string;
  definition: string;
  pos: Pos;
  rank: number;
  beta: number;
};

type Corpus = {
  generatedAt: string;
  source: string;
  size: number;
  words: CorpusEntry[];
};

/**
 * Inverse standard normal CDF (probit function), Acklam's rational approximation.
 * Accurate to ~1e-9 over (0,1). Used to map rank percentile → β on the standard
 * normal scale.
 */
function probit(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`probit requires 0 < p < 1, got ${p}`);
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r +
        a[5]!) *
        q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

async function fetchFrequencyList(): Promise<string[]> {
  console.log(`[corpus] fetching ${FREQ_URL}`);
  const res = await fetch(FREQ_URL);
  if (!res.ok) throw new Error(`Frequency fetch failed: ${res.status}`);
  const text = await res.text();
  const words: string[] = [];
  for (const line of text.split("\n")) {
    const token = line.split(" ")[0]?.trim().toLowerCase();
    if (!token) continue;
    if (!/^[a-z]{3,20}$/.test(token)) continue;
    words.push(token);
  }
  console.log(`[corpus]   ${words.length} candidate words from frequency list`);
  return words;
}

/**
 * Index line format (WordNet):
 *   lemma pos synset_cnt p_cnt [ptr_symbol ...] sense_cnt tagsense_cnt synset_offset [synset_offset ...]
 * Trim before splitting (WordNet lines have trailing whitespace).
 */
function parseIndex(path: string): Map<string, string> {
  const raw = readFileSync(path, "utf8");
  const out = new Map<string, string>();
  for (const rawLine of raw.split("\n")) {
    if (!rawLine || rawLine.startsWith(" ")) continue;
    const line = rawLine.trim();
    const parts = line.split(/\s+/);
    if (parts.length < 7) continue;
    const lemma = parts[0]!;
    const pCnt = parseInt(parts[3] ?? "0", 10);
    const primaryOffset = parts[6 + pCnt];
    if (!primaryOffset) continue;
    out.set(lemma, primaryOffset);
  }
  return out;
}

function parseData(path: string): Map<string, string> {
  const raw = readFileSync(path, "utf8");
  const out = new Map<string, string>();
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(" ")) continue;
    const barIdx = line.indexOf("|");
    if (barIdx < 0) continue;
    const offset = line.substring(0, 8);
    const afterBar = line.substring(barIdx + 1).trim();
    const firstSense = afterBar.split(";")[0]?.trim() ?? "";
    if (!firstSense) continue;
    out.set(offset, firstSense);
  }
  return out;
}

type WordNetIndex = {
  getDefinition(word: string): { def: string; pos: Pos } | null;
};

function buildWordNetIndex(): WordNetIndex {
  const indexes = new Map<Pos, Map<string, string>>();
  const datas = new Map<Pos, Map<string, string>>();
  for (const pos of POS_PRIORITY) {
    const files = POS_FILES[pos];
    indexes.set(pos, parseIndex(resolve(WORDNET_DICT, files.index)));
    datas.set(pos, parseData(resolve(WORDNET_DICT, files.data)));
  }
  return {
    getDefinition(word: string) {
      for (const pos of POS_PRIORITY) {
        const offset = indexes.get(pos)?.get(word);
        if (!offset) continue;
        const def = datas.get(pos)?.get(offset);
        if (def) return { def, pos };
      }
      return null;
    },
  };
}

async function buildCorpus(): Promise<Corpus> {
  const freqWords = await fetchFrequencyList();
  console.log(`[corpus] parsing WordNet...`);
  const wn = buildWordNetIndex();

  const kept: { word: string; definition: string; pos: Pos; rank: number }[] = [];
  for (const [i, word] of freqWords.entries()) {
    const hit = wn.getDefinition(word);
    if (!hit) continue;
    kept.push({
      word,
      definition: hit.def,
      pos: hit.pos,
      rank: i + 1, // 1-based rank among candidates with a WordNet entry? no: keep as position in freq list
    });
  }
  console.log(`[corpus] kept ${kept.length} words (WordNet ∩ frequency list)`);

  // Re-rank compactly: 1..N in frequency order over the kept set.
  kept.sort((a, b) => a.rank - b.rank);
  kept.forEach((k, i) => (k.rank = i + 1));

  // Probit β: maps rank percentile through the inverse standard normal CDF so
  // β is on the N(0,1) scale with a long hard tail.
  const N = kept.length;
  const words: CorpusEntry[] = kept.map((k) => ({
    word: k.word,
    definition: k.definition,
    pos: k.pos,
    rank: k.rank,
    beta: probit((k.rank - 0.5) / N),
  }));

  return {
    generatedAt: new Date().toISOString(),
    source:
      "OpenSubtitles-2018 frequency (FrequencyWords) ∩ WordNet 3.1, beta = probit((rank - 0.5) / N)",
    size: words.length,
    words,
  };
}

async function main() {
  const corpus = await buildCorpus();
  const betas = corpus.words.map((w) => w.beta);
  console.log(
    `[corpus] beta range: ${Math.min(...betas).toFixed(2)}..${Math.max(
      ...betas,
    ).toFixed(2)}, size=${corpus.size}`,
  );
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(corpus));
  console.log(`[corpus] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
