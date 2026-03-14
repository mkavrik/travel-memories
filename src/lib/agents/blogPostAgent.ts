/**
 * Agent pro generování blog postů z cestovních poznámek.
 * Pipeline: Agent 2a (Kreativec) ↔ Agent 2b (Korektor), max 3 iterace.
 */

import { callClaude, isOkResponse } from "./claudeApi";

const CREATIVE_SYSTEM_PROMPT = `Jsi autor cestovního blogu. Tvým úkolem je přetvořit surové poznámky z výletu do blog postu.

STYL PSANÍ:
- Neformální, osobní, s humorem a sebeironií
- Piš v první osobě, případně v rodinném "my"
- Nezakrývej průšvihy a nepříjemné momenty – jsou součástí příběhu
- Zmiňuj konkrétní jména (lidé, místa, vybavení) pokud jsou v poznámkách
- Gramaticky správně, s diakritikou
- Věty mohou být delší a přirozeně navazovat jedna na druhou
- Jednotlivé momenty dne propojuj přirozenými přechody ("Po návratu...", "Mezitím...", "Co nás ale překvapilo...")
- Dva až tři tematicky příbuzné odrážky slučuj do jednoho odstavce
- Zachovej tempo a rytmus – střídej kratší a delší věty

CO DĚLÁŠ:
- Propojuješ jednotlivé odrážky do plynoucího textu
- Zachováváš všechny konkrétní detaily a fakta z poznámek
- Přidáváš přirozené přechody mezi myšlenkami
- Zachováváš chronologický průběh dne
- Příbuzné momenty slučuješ do odstavců, nepíšeš každou odrážku jako samostatnou větu
- Přidáváš přirozené časové a situační přechody mezi momenty

CO NEDĚLÁŠ:
- Nevymýšlíš žádné informace které nejsou v poznámkách
- Nepřidáváš obecné fráze o cestování ("Norsko je krásná země...")
- Neodstraňuješ humor ani průšvihy
- Nepíšeš "jako by to psal chatbot" – žádné generické závěry
- Pokud něco nevíš, nechej prázdné místo [?]

ŠABLONA VÝSTUPU:
1. Úvod – kde jsem, co byl plán dne (2-3 věty)
2. Průběh dne – propojené odrážky v přirozeném textu
3. Závěrečná nálada / co mě čeká zítra (1-2 věty)

DÉLKA: 300-500 slov`;

const CORRECTOR_SYSTEM_PROMPT = `Jsi korektor cestovního blogu. Dostaneš blog post a původní poznámky.
Tvůj úkol:
1. Porovnej blog post s poznámkami
2. Vytvoř seznam konkrétních oprav ve formátu:
   - "Věta [citace]: v poznámkách je [správná verze] – oprav"
3. Kontroluješ pouze: faktické chyby, diakritiku, gramatiku
4. Nikdy neměníš styl, strukturu ani tón textu
5. Pokud je vše správně, vrať: "OK"`;

const REVISE_SYSTEM_PROMPT = `Jsi autor cestovního blogu. Dostaneš aktuální text blog postu a seznam konkrétních oprav od korektora.
Tvůj úkol: Aplikuj pouze tyto opravy do textu. Neměň styl, strukturu ani nic, co není v seznamu. Vrať celý opravený text.`;

export type GenerateBlogPostParams = {
  notes: string;
  date: string;
  tripName: string;
};

export async function generateBlogPost(
  params: GenerateBlogPostParams,
): Promise<string> {
  const { notes, date, tripName } = params;
  const userMessage = `Trip: ${tripName}\nDatum: ${date}\n\nPoznámky z dne:\n\n${notes}`;
  return callClaude(CREATIVE_SYSTEM_PROMPT, userMessage);
}

export async function correctBlogPost(
  blogPost: string,
  notes: string,
): Promise<string> {
  const userMessage = `Poznámky:\n\n${notes}\n\n---\n\nBlog post:\n\n${blogPost}`;
  return callClaude(CORRECTOR_SYSTEM_PROMPT, userMessage);
}

export async function reviseBlogPost(
  currentText: string,
  corrections: string,
): Promise<string> {
  const userMessage = `Aktuální text:\n\n${currentText}\n\n---\n\nSeznam oprav:\n\n${corrections}`;
  return callClaude(REVISE_SYSTEM_PROMPT, userMessage);
}

const MAX_ITERATIONS = 3;

export type BlogPostPipelineResult = {
  text: string;
  iterations: number;
};

/**
 * Dvouvrstvá pipeline: Kreativec (2a) ↔ Korektor (2b), max 3 iterace.
 */
export async function runBlogPostPipeline(
  params: GenerateBlogPostParams,
): Promise<BlogPostPipelineResult> {
  let text = await generateBlogPost(params);
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const feedback = await correctBlogPost(text, params.notes);
    iterations++;

    if (isOkResponse(feedback)) {
      break;
    }

    text = await reviseBlogPost(text, feedback);
  }

  return { text, iterations };
}
