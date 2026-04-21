export type CorpusEntry = {
  word: string;
  definition: string;
  pos: string;
  rank: number;
  beta: number;
};

export type Corpus = {
  generatedAt: string;
  source: string;
  size: number;
  words: CorpusEntry[];
};

let cached: Corpus | null = null;
let cachedBetas: Float64Array | null = null;

export async function loadCorpus(): Promise<Corpus> {
  if (cached) return cached;
  const res = await fetch("/corpus.json");
  if (!res.ok) throw new Error(`Failed to load corpus: ${res.status}`);
  cached = (await res.json()) as Corpus;
  return cached;
}

/** Cached Float64Array of β values across the whole corpus — for total-known sums. */
export function corpusBetas(corpus: Corpus): Float64Array {
  if (cachedBetas && cachedBetas.length === corpus.size) return cachedBetas;
  const arr = new Float64Array(corpus.size);
  for (let i = 0; i < corpus.size; i++) arr[i] = corpus.words[i]!.beta;
  cachedBetas = arr;
  return arr;
}
