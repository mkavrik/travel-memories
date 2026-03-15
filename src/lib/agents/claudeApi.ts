/**
 * Shared Claude API helpers for agent pipelines.
 */

export async function callClaude(
  system: string,
  userContent: string,
  maxTokens = 2000,
  model = "claude-opus-4-6",
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API failed: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text?: string }[];
  };
  const textParts = data.content.filter((c): c is { type: "text"; text: string } => c.type === "text");
  if (textParts.length === 0) throw new Error("Claude API response missing text.");
  return textParts.map((c) => c.text).join("\n\n").trim();
}

/**
 * Volá Claude API s nástrojem web search. Použij pro Agent 2a (Kreativec),
 * aby mohl ověřovat geografické názvy. Response může obsahovat mix bloků
 * (text, tool_use, web_search_tool_result) — vracíme pouze zřetězený text
 * z bloků type === "text".
 */
export function isOkResponse(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t === "OK" || t === '"OK"' || t.startsWith("OK\n") || t.startsWith("OK ");
}
