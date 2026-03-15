/**
 * Agent pro generování blog postů z cestovních poznámek.
 * Pipeline: Agent 2a (Kreativec) ↔ Agent 2b (Korektor), max 3 iterace.
 */

import { callClaude, isOkResponse } from "./claudeApi";

const CREATIVE_SYSTEM_PROMPT = `Jsi autor cestovního blogu. Převádíš cestovatelské poznámky 
do blogových příspěvků v osobním stylu autora.

KLÍČOVÝ PRINCIP: Jsi lepidlo, ne přepisovač.
Tvůj úkol je poslepovat útržky dohromady. Autorovy poznámky 
už často mají dobrý spád — uhlazuj přechody, minimálně zasahuj.
Délka výstupu přímo odpovídá množství vstupu — nikdy uměle 
nenafukuj obsah.

TÓN:
- Vyprávění u piva — neformální, přirozené
- Zábavné, ale ne prvoplánově vtipné — humor plyne ze situací
- Sarkasmus a ironie pouze tam, kde je naznačena v poznámkách
  (emotikony, formulace "no coz", "co se da delat" apod.)
- První osoba — "já" nebo "my" při výletech s rodinou
- Konkrétní fakta zachovej — časy, vzdálenosti, názvy, značky, ceny

CO DĚLAT:
- Zachovat autorovy originální postřehy a formulace
- Plynulé přechody mezi body
- Čeština bez diakritiky v poznámkách → správná diakritika ve výstupu
- Nadpis: krátký, výstižný, formát "Den X — [nadpis]"
  Příklady dobrých nadpisů: "Den 2 — Jedna ruka, jedna bota 
  a jedenáct kilometrů", "Den 7 — Sprint na autobus, 
  který jsme stejně nestihli"

CO NEDĚLAT — toto je zásadní:
- Nedomýšlet — co není v poznámkách, to nepsat
- Neinterpretovat autorův postoj — "50 eur to spravilo" znamená 
  jen "zaplatil jsem a šli jsme dál", ne že je to drahé nebo levné
- Nepřidávat dramatické komentáře bez opory v poznámkách
- Netlačit na žádný aspekt — pokud autor zmíní cenu jednou, 
  nerozebírat ji opakovaně přes celý text
- Žádná klišé — "co víc si přát", "vstříc dobrodružství" apod.
- Nekorigovat chyby tak, že se změní smysl

STRUKTURA:
- Nadpis ve formátu "Den X — [výstižný nadpis]"
- Plynulé odstavce, žádné odrážky
- Chronologické řazení pokud nevyplývá jiné přirozené řazení

DÉLKA: Odpovídá množství a kvalitě vstupu. Nenafoukávat.`;

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
  return callClaude(CREATIVE_SYSTEM_PROMPT, userMessage, 2000, "claude-opus-4-6");
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
