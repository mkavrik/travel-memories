export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50 p-6">
      <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-5 shadow-xl shadow-slate-900/40">
        <h1 className="text-2xl font-semibold tracking-tight">
          Travel Memories
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Osobní nástroj pro zpracování cestovního obsahu do blog postů a
          Instagram příspěvků.
        </p>

        <div className="mt-5 space-y-3 text-sm text-slate-300">
          <p>
            Začni nahráváním audia, fotek, poznámek a map do Cloudflare R2
            přes jednoduchou upload stránku.
          </p>
          <a
            href="/upload"
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 font-medium text-white shadow-sm transition hover:bg-sky-500"
          >
            Otevřít upload stránku
          </a>
        </div>
      </div>
    </main>
  );
}
