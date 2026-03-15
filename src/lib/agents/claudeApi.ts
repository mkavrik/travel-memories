/**
 * Shared Claude API helpers for agent pipelines.
 */

export async function callClaude(
  system: string,
  userContent: string,
  maxTokens = 2000,
  model = "claude-sonnet-4-5",
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
    content: { type: string; text: string }[];
  };
  const textPart = data.content.find((c) => c.type === "text");
  if (!textPart) throw new Error("Claude API response missing text.");
  return textPart.text.trim();
}

export function isOkResponse(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t === "OK" || t === '"OK"' || t.startsWith("OK\n") || t.startsWith("OK ");
}
