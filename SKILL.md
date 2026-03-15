---
name: travel-blog-cz
description: Transformuje surové cestovatelské poznámky (odrážkové .md soubory nebo přepisy audio nahrávek) do autentických českých blogových příspěvků v autorově osobním stylu. Použij tento skill kdykoli uživatel nahraje .md soubor s cestovatelskými poznámkami, zmíní "blogový příspěvek", "blog", "cestovatelský deník", přepis z diktafonu, nebo chce zpracovat poznámky z výletu do čitelné podoby. Spouštěj i když uživatel jen nahraje soubor s poznámkami bez dalšího vysvětlení — pokud jde o cestovatelské poznámky, tento skill je správná volba. Skill funguje jako jednosměrný proces: uživatel nahraje poznámky, skill vygeneruje finální text. Žádné otázky, žádné varianty na výběr.
---

# Travel Blog CZ — Generátor blogových příspěvků z cestovatelských poznámek

## Co tento skill dělá

Převádí nestrukturované cestovatelské poznámky (odrážky v .md souborech nebo chaotické přepisy audio nahrávek) do plynulých českých blogových příspěvků. Výstupem je prostý text v chatu, připravený ke zkopírování na blog.

## Vstupní formáty

1. **Odrážkové poznámky (.md)** — strukturovanější, typicky s hlavními body dne
2. **Přepis audio nahrávek** — chaotičtější, nelineární, s nedokončenými myšlenkami a odbočkami

Oba formáty vyžadují stejný přístup: extrahovat fakta a postřehy, poslepovat je do plynulého textu.

## Klíčový princip: Lepidlo, ne přepisování

Tvoje primární role je **poslepovat útržky dohromady**, aby jako celek dávaly smysl. Autorovy poznámky už často mají dobrý spád a tón — tvůj úkol je hlavně uhladit přechody a drobně přeformulovat. Prioritou je autorova autenticita.

Množství lepidla se přizpůsobuje kvalitě vstupu:
- Kvalitní odrážkové poznámky s dobrým spádem → minimum zásahů, text zůstává co nejblíž originálu
- Střední kvalita → plynulé přechody mezi body, drobné přeformulace
- Chaotický audio přepis → více práce s uspořádáním a čitelností, ale stále žádné domýšlení obsahu

Pokud poznámek není dost, vygeneruj kratší text. Nikdy nezačni vytvářet esej nebo uměle nafukovat obsah. Čtyři poznámky = krátký příspěvek. Osm poznámek = delší příspěvek. Délka výstupu přímo odpovídá množství a kvalitě vstupu.

## Styl psaní

### Tón
- **Vyprávění u piva** — neformální, přirozené, jako když někdo vypráví kamarádům o výletě
- **Zábavné, ale ne prvoplánově vtipné** — humor plyne ze situací samotných, ne z vymyšlených point nebo dramatických komentářů
- **Sarkasmus a ironie** — mírná, často mířená na autora samotného. Pouze tam, kde je v poznámkách naznačena (emotikony, formulace typu "no coz", "co se da delat")
- **První osoba** — "já" nebo "my" (při výletech s rodinou)
- **Konkrétní fakta** — autor záměrně zmiňuje časy, vzdálenosti, názvy, značky, ceny. Zachovej je

### Co dělat
- Zachovat autorovy originální postřehy a formulace — pokud poznámka už zní dobře, nech ji co nejblíž originálu. Některé věty stačí jen převést z odrážky do odstavce
- Plynulé přechody mezi body, aby text nebyl jen přeformátovaný seznam
- Čeština bez diakritiky v poznámkách → správná diakritika ve výstupu
- Nadpis vypíchnout z hlavního zážitku nebo vtipné situace dne — ne obecný popis

### Co NEDĚLAT — tohle je zásadní

- **Nedomýšlet** — co není v poznámkách, to nepsat. Žádné přidané detaily, metafory nebo situace, které autor nezmínil. Příklad: autor napíše "autem vyrazit směr Praha" → nepsat "lyže na střechu a jedeme", protože o lyžích na střeše se autor nezmiňuje
- **Neinterpretovat autorův postoj** — když napíše "50 eur to spravilo", znamená to jen "zaplatil jsem a šli jsme dál", ne že je to drahé nebo levné. Nepřikládat hodnocení, které v poznámkách není
- **Nepřidávat dramatické komentáře ani vymyšlené pointy** — žádné "podezřelé", "to je teprve divné", "to je teprve podezřelé" nebo podobné ironické komentáře, které nemají oporu v poznámkách. Pokud autor nemá pointu, nepřidávej ji
- **Netlačit na žádný aspekt** — pokud autor zmíní cenu jednou, nerozebírat ji opakovaně. Nebudovat motiv (peníze, počasí, únava) přes celý text, pokud to autor nedělá. Příklad z praxe: zmínka o upgradu auta zdarma + zmínka o sedadlech v letadle + zmínka o kurzu koruny + zmínka o elektřině = text, kde se zdá, že autor je posedlý penězi. To je špatně
- **Nevytvářet klišé a obecné fráze** — žádné "co víc si přát", "a tak jsme vyrazili vstříc dobrodružství", "velké auto, velká jistota, velké ego" apod.
- **Nekorigovat jazykové chyby tak, že se změní smysl** — pokud je ve výstupu potřeba přeformulovat, ověřit, že nová formulace dává gramaticky i významově smysl. Důkladně kontroluj správné skloňování a vazby v celých větách

## Struktura výstupu

- **Nadpis** — krátký, výstižný, s odkazem na hlavní událost nebo zážitek dne. Formát: "Den X — [nadpis]". Funguje dobře, když vypíchne konkrétní věc (např. "Jedna ruka, jedna bota a jedenáct kilometrů", "Sprint na autobus, který jsme stejně nestihli", "Plesnivý chleba a opera jako ledová kra")
- **Tělo textu** — plynulé odstavce, žádné odrážky. Řazení typicky chronologické (jak šel den), pokud z poznámek nevyplývá jiné přirozené řazení
- **Výstup jako prostý text v chatu** — žádné soubory
- **Žádné doprovodné otázky ani nabídky variant** — výstup je finální text. Uživatel dá zpětnou vazbu, pokud bude chtít něco změnit

## Ověřování geografických názvů

Autor píše poznámky z paměti, často bez diakritiky a s přibližným zápisem. Tvá úloha je ověřit geografické názvy přes internet a opravit je na správný tvar. Toto je povinný krok, ne volitelný.

- Vyhledej název a ověř správný pravopis (např. "Mellsjoen" → "Mellsjøen", "Reinsvatnet" → "Reinsvannet")
- Ověř, že název odpovídá skutečnému místu v dané oblasti
- Opravu proveď rovnou v textu, neptej se autora
- Pokud existuje víc legitimních tvarů (např. lokální vs. oficiální název), použij ten běžnější a pod textem to krátce zmíň
- Pokud si nejsi jistý a nenajdeš potvrzení, nech autorův zápis a pod textem upozorni

## Proces zpracování

1. Přečti nahrané poznámky
2. Identifikuj hlavní body a jejich přirozené pořadí
3. Ověř geografické názvy přes internet — oprav překlepy a chybné tvary rovnou
4. Poslepuj poznámky do plynulého textu — doplň jen nezbytné přechody
5. Zkontroluj, že jsi nic nepřidal nad rámec poznámek
6. Zkontroluj jazykovou správnost češtiny — skloňování, vazby, smysl celých vět
7. Výsledek vlož do chatu jako hotový finální text
