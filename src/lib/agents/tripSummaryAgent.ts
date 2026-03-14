/**
 * Agent pro generování souhrnného blog postu celého tripu.
 * Pipeline: Agent 2a (Kreativec) ↔ Agent 2b (Korektor), max 3 iterace.
 */

import { callClaude, isOkResponse } from "./claudeApi";

const CREATIVE_SYSTEM_PROMPT = `Jsi autor cestovního blogu. Píšeš souhrnný článek o celém tripu.
Styl: neformální, osobní, s humorem a sebeironií. První osoba, případně rodinné "my". Gramaticky správně, s diakritikou.
Věty přirozeně navazují, příbuzné momenty slučuj do odstavců.

Šablona výstupu:
1. Úvod – co to byl za trip, kde a kdy (2-3 věty)
2. Celkové dojmy a highlights tripu
3. Konkrétní momenty které stojí za zmínku
4. Praktické info (oblast, ubytování, celkový charakter terénu)
5. Doporučení – stojí to za to a pro koho
6. Co nás čeká příště

Délka: 500-800 slov.
Nezakrývej průšvihy – jsou součástí příběhu.
Nevymýšlej nic co není ve vstupních materiálech.
Pokud něco nevíš, nechej prázdné místo [?]`;

const CORRECTOR_SYSTEM_PROMPT = `Jsi korektor cestovního blogu. Dostaneš summary blog post a původní vstupní materiály.
1. Porovnej blog post s materiály
2. Vytvoř seznam konkrétních oprav ve formátu:
   "Věta [citace]: v materiálech je [správná verze] – oprav"
3. Kontroluješ pouze: faktické chyby, diakritiku, gramatiku
4. Nikdy neměníš styl, strukturu ani tón textu
5. Pokud je vše správně, vrať: "OK"`;

const REVISE_SYSTEM_PROMPT = `Jsi autor cestovního blogu. Dostaneš aktuální text blog postu a seznam konkrétních oprav od korektora.
Tvůj úkol: Aplikuj pouze tyto opravy do textu. Neměň styl, strukturu ani nic, co není v seznamu. Vrať celý opravený text.`;

const MAX_ITERATIONS = 3;

export type TripSummaryParams = {
  input: string;
  tripName: string;
};

export type TripSummaryProgress = (
  phase: "generating" | "correcting" | "done",
  iteration?: number,
) => void;

/**
 * Agent 2a – Kreativec: vygeneruje první draft summary.
 */
export async function generateTripSummaryDraft(
  params: TripSummaryParams,
): Promise<string> {
  const userMessage = `Trip: ${params.tripName}\n\nVstupní materiály:\n\n${params.input}`;
  return callClaude(CREATIVE_SYSTEM_PROMPT, userMessage, 3000);
}

/**
 * Agent 2b – Korektor: porovná summary s materiály, vrátí opravy nebo "OK".
 */
export async function correctTripSummary(
  blogPost: string,
  materials: string,
): Promise<string> {
  const userMessage = `Vstupní materiály:\n\n${materials}\n\n---\n\nSummary blog post:\n\n${blogPost}`;
  return callClaude(CORRECTOR_SYSTEM_PROMPT, userMessage);
}

/**
 * Agent 2a – revize: aplikuje seznam oprav.
 */
export async function reviseTripSummary(
  currentText: string,
  corrections: string,
): Promise<string> {
  const userMessage = `Aktuální text:\n\n${currentText}\n\n---\n\nSeznam oprav:\n\n${corrections}`;
  return callClaude(REVISE_SYSTEM_PROMPT, userMessage);
}

export type TripSummaryPipelineResult = {
  text: string;
  iterations: number;
};

/**
 * Dvouvrstvá pipeline: Kreativec ↔ Korektor, max 3 iterace.
 * Volitelně volá onProgress(phase, iteration).
 */
export async function runTripSummaryPipeline(
  params: TripSummaryParams,
  onProgress?: TripSummaryProgress,
): Promise<TripSummaryPipelineResult> {
  onProgress?.("generating");
  let text = await generateTripSummaryDraft(params);
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    onProgress?.("correcting", iterations);

    const feedback = await correctTripSummary(text, params.input);

    if (isOkResponse(feedback)) {
      break;
    }

    text = await reviseTripSummary(text, feedback);
  }

  return { text, iterations };
}
