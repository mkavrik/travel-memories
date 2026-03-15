/**
 * Volá POST /api/warm-cache na produkční URL (po buildi).
 * URL z env: NEXT_PUBLIC_SITE_URL nebo VERCEL_URL.
 */
const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

if (!baseUrl) {
  console.warn(
    "warm-cache: NEXT_PUBLIC_SITE_URL ani VERCEL_URL není nastaveno, přeskakuji warm-cache."
  );
  process.exit(0);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/warm-cache`;

async function main() {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    console.error(`warm-cache: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const reader = res.body;
  if (!reader) {
    console.error("warm-cache: žádné tělo odpovědi");
    process.exit(1);
  }
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((s) => s.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.message) console.log(obj.message);
        if (obj.error) console.error("warm-cache error:", obj.error);
      } catch {
        process.stdout.write(chunk);
      }
    }
  }
}

main().catch((err) => {
  console.error("warm-cache:", err);
  process.exit(1);
});
