/**
 * Tool-subset selection via keyword ranking.
 * Given a user query and a list of tool descriptions, returns tools whose
 * name + description contain keywords relevant to the query.
 *
 * This avoids context rot by only injecting relevant tools into the LLM prompt.
 */

interface DescribedTool {
  name: string;
  description: string;
}

/** Simple keyword-based relevance scoring. */
function relevanceScore(query: string, tool: DescribedTool): number {
  const q = query.toLowerCase();
  const text = `${tool.name} ${tool.description}`.toLowerCase();

  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 0;

  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) {
      score += 1;
    }
    // Bonus for exact word match in name
    const nameWords = tool.name.toLowerCase().split(/_/);
    if (nameWords.includes(term)) {
      score += 2;
    }
  }
  return score / terms.length;
}

/**
 * Rank and select the top-N tools relevant to a query.
 * Tools with score > 0.3 are always included; those with score > 0 may be
 * included up to maxTools.
 */
export function selectTools(
  query: string,
  tools: DescribedTool[],
  maxTools = 10,
): DescribedTool[] {
  const scored = tools.map((t) => ({ tool: t, score: relevanceScore(query, t) }));
  scored.sort((a, b) => b.score - a.score);

  const selected: DescribedTool[] = [];
  for (const { tool, score } of scored) {
    if (score > 0) {
      selected.push(tool);
    }
    if (selected.length >= maxTools) break;
  }

  return selected;
}
