// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Lightweight TF-IDF (Term Frequency–Inverse Document Frequency) search engine.
 *
 * Used exclusively by the mock implementation to provide keyword-based
 * relevance scoring without external dependencies. Production uses Bedrock
 * embeddings instead.
 *
 * **Algorithm:**
 * 1. Documents are tokenized into lowercase alphanumeric tokens.
 * 2. Term frequencies (TF) are normalized by document length.
 * 3. Inverse document frequencies (IDF) use smoothed log: `log((N+1)/(df+1)) + 1`.
 * 4. Query scores are the sum of `TF * IDF` for each query token.
 * 5. Scores are normalized to [0, 1] relative to the best match.
 *
 * @module
 */

// ── TF-IDF Engine ──────────────────────────────────────────────────────────

/** A single indexed document's term frequencies and token count. */
interface IndexEntry {
	/** Map of term → normalized term frequency (count / total tokens). */
	termFreqs: Map<string, number>;
	/** Total number of tokens in the document. */
	length: number;
}

/**
 * Pre-computed TF-IDF index over a document corpus.
 * Created by {@link buildIndex} and queried by {@link search}.
 */
export interface TfIdfIndex {
	/** Per-document term frequency data, ordered by insertion. */
	entries: IndexEntry[];
	/** Global inverse document frequency for each term in the corpus. */
	idf: Map<string, number>;
	/** Total number of documents in the index. */
	docCount: number;
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1);
}

/**
 * Build a TF-IDF index from a list of document texts.
 *
 * Each element in `documents` is one chunk/document to index. The returned
 * index can be passed to {@link search} for ranked retrieval.
 *
 * @param documents - Array of plain-text strings to index. Order is preserved
 *   and used as the `docIndex` in search results.
 * @returns A pre-computed TF-IDF index ready for querying.
 */
export function buildIndex(documents: string[]): TfIdfIndex {
	const entries: IndexEntry[] = [];
	const docFreqs = new Map<string, number>();

	for (const doc of documents) {
		const tokens = tokenize(doc);
		const termFreqs = new Map<string, number>();
		for (const token of tokens) {
			termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
		}
		// Normalize TF by document length
		for (const [term, count] of termFreqs) {
			termFreqs.set(term, count / (tokens.length || 1));
		}
		// Track document frequency
		for (const term of termFreqs.keys()) {
			docFreqs.set(term, (docFreqs.get(term) ?? 0) + 1);
		}
		entries.push({ termFreqs, length: tokens.length });
	}

	// Compute IDF: log((N + 1) / (df + 1)) + 1 (smoothed)
	const idf = new Map<string, number>();
	const N = documents.length;
	for (const [term, df] of docFreqs) {
		idf.set(term, Math.log((N + 1) / (df + 1)) + 1);
	}

	return { entries, idf, docCount: N };
}

/**
 * Search the index with a natural language query and return the top-K
 * document indices ranked by relevance.
 *
 * Scores are normalized to [0, 1] where 1.0 is the best match. Documents
 * with zero overlap with the query are excluded from results.
 *
 * @param index - Pre-computed TF-IDF index from {@link buildIndex}.
 * @param query - Natural language search query string.
 * @param maxResults - Maximum number of results to return.
 * @returns Sorted array of `{ docIndex, score }` pairs, highest score first.
 *   Empty array if the query has no matching tokens or the index is empty.
 */
export function search(
	index: TfIdfIndex,
	query: string,
	maxResults: number,
): { docIndex: number; score: number }[] {
	if (index.docCount === 0) return [];

	const queryTokens = tokenize(query);
	if (queryTokens.length === 0) return [];

	const scores: { docIndex: number; score: number }[] = [];

	for (let i = 0; i < index.entries.length; i++) {
		const entry = index.entries[i];
		let score = 0;
		for (const token of queryTokens) {
			const tf = entry.termFreqs.get(token) ?? 0;
			const idfVal = index.idf.get(token) ?? 0;
			score += tf * idfVal;
		}
		if (score > 0) {
			scores.push({ docIndex: i, score });
		}
	}

	if (scores.length === 0) return [];

	// Normalize scores to [0, 1]
	const maxScore = Math.max(...scores.map(s => s.score));
	if (maxScore > 0) {
		for (const s of scores) {
			s.score = s.score / maxScore;
		}
	}

	scores.sort((a, b) => b.score - a.score);
	return scores.slice(0, maxResults);
}
