// The 1,000-question exam: node test/exam-1000.js. Offline categories (math, units) run every time and cost nothing.// AI categories (capitals, elements, authors, dates, ...) are 500 questions; each run asks a rotating CAP of them
// (default 250, DAY= to pick the slice) so the free Groq caps hold. CAP=500 asks them all. Paced 3.2s apart.
// Exit code 1 on any miss.
const E = require("../docs/engine.js");
const Q = []; // [category, question, regex]
const add = (cat, q, re) => Q.push([cat, q, re]);
// The engine may or may not print thousands separators, so a number matches with the comma optional.
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",?");

// math: computed, so the expected answer cannot be mistyped
for (let i = 0; i < 90; i++) { const a = 12 + ((i * 7) % 88), b = 3 + ((i * 5) % 17); add("math", `${a} times ${b}`, new RegExp(`^${num(a * b)}$`)); }
for (let i = 0; i < 80; i++) { const a = 100 + i * 37, b = 11 + i * 3; add("math", `${a}+${b}`, new RegExp(`^${a + b}$`)); }
for (let i = 0; i < 60; i++) { const a = 500 + i * 41, b = 17 + i * 4; add("math", `${a}-${b}`, new RegExp(`^${a - b}$`)); }
for (let i = 2; i < 42; i++) add("math", `${i * i + 0} square root`.replace(/^(\d+) square root$/, `square root of $1`), new RegExp(`^${i}$`));
for (let i = 0; i < 40; i++) { const p = [5, 10, 15, 20, 25, 50, 75][i % 7], n = 40 + i * 20; if ((p * n) % 100 === 0) add("math", `${p}% of ${n}`, new RegExp(`^${(p * n) / 100}$`)); }
for (let i = 2; i < 32; i++) add("math", `${i} squared`, new RegExp(`^${i * i}$`));

for (let i = 2; i < 32; i++) add("math", `${i} cubed`, new RegExp(`^${num(i ** 3)}$`));
for (let i = 2; i < 32; i++) add("math", `cube root of ${i ** 3}`, new RegExp(`^${i}$`));
for (let i = 5; i < 31; i++) add("math", `2^${i}`, new RegExp(`^${num(2 ** i)}$`));
for (let i = 3; i < 11; i++) add("math", `${i} factorial`, new RegExp(num([...Array(i)].reduce((a, _, k) => a * (k + 1), 1))));
for (let i = 1; i < 41; i++) if (!/^[01]+$/.test(String(i * 6 + 3))) add("math", `${i * 6 + 3} in binary`, new RegExp(`${(i * 6 + 3).toString(2)}`));
for (let i = 1; i < 41; i++) add("math", `${i * 13} divided by 13`, new RegExp(`^${i}$`));
for (let i = 1; i < 41; i++) add("math", `${i * 8 + 1}*${i + 2}`, new RegExp(`^${num((i * 8 + 1) * (i + 2))}$`));

for (let i = 1; i < 61; i++) add("math", `${i * 7 + 400}+${i * 11}`, new RegExp(`^${num(i * 7 + 400 + i * 11)}$`));
for (let i = 1; i < 21; i++) add("math", `${i * 9} divided by 3`, new RegExp(`^${i * 3}$`));

// units: factor tables, the expected leading digits computed from the factor
// Leading digits are truncated, not rounded: the engine prints the full value, so "3.10" matches 3.106856.
const lead = (r) => { const t = String(+r.toFixed(6)); let n = 0, i = 0; for (; i < t.length && n < 3; i++) if (/\d/.test(t[i]) && (n || t[i] !== "0")) n++; return t.slice(0, i); };
const unit = (from, to, f) => { for (const v of [2, 5, 10, 25, 50, 100, 250, 500]) { const s = lead(v * f); add("units", `${v} ${from} to ${to}`, new RegExp(s.replace(".", "\\.").replace(/^(\d{1,3})(\d{3})$/, "$1,?$2"))); } };
unit("km", "miles", 0.621371); unit("miles", "km", 1.609344); unit("kg", "lbs", 2.204623); unit("lbs", "kg", 0.453592); unit("m", "feet", 3.28084); unit("feet", "m", 0.3048);
unit("liters", "gallons", 0.264172); unit("inches", "cm", 2.54); unit("cm", "inches", 0.393701);

for (const v of [-40, -10, 0, 10, 20, 25, 30, 37, 50, 75, 100, 150, 200, 250]) add("units", `${v} C to F`, new RegExp(String(v * 9 / 5 + 32).replace(".", "\\.").replace("-", "[-−]")));
for (const v of [-40, 0, 32, 50, 68, 86, 98.6, 100, 212, 350, 400]) add("units", `${v} F to C`, new RegExp(lead(Math.abs((v - 32) * 5 / 9)).replace(".", "\\.").replace(/^0$/, "^-?0")));
const bytes = (from, to, f) => { for (const v of [1, 2, 5, 10, 50, 100, 500, 2000]) add("units", `${v} ${from} to ${to}`, new RegExp(String(v * f).replace(".", "\\.").replace(/^(\d{1,3})(\d{3})$/, "$1,?$2"))); };
bytes("GB", "MB", 1000); bytes("MB", "GB", 0.001); bytes("TB", "GB", 1000); bytes("hours", "minutes", 60); bytes("minutes", "seconds", 60); bytes("days", "hours", 24); bytes("weeks", "days", 7); bytes("km", "m", 1000); bytes("kg", "g", 1000); bytes("m", "cm", 100);

// AI categories: stable facts, tight patterns
const capitals = { France: "Paris", Germany: "Berlin", Italy: "Rome", Spain: "Madrid", Portugal: "Lisbon", Ireland: "Dublin", Norway: "Oslo", Sweden: "Stockholm", Finland: "Helsinki", Denmark: "Copenhagen", Poland: "Warsaw", Austria: "Vienna", Hungary: "Budapest", Greece: "Athens", Russia: "Moscow", Ukraine: "Kyiv|Kiev", Japan: "Tokyo", China: "Beijing", "South Korea": "Seoul", India: "New Delhi|Delhi", Thailand: "Bangkok", Vietnam: "Hanoi", Indonesia: "Jakarta", Philippines: "Manila", Australia: "Canberra", "New Zealand": "Wellington", Canada: "Ottawa", Mexico: "Mexico City", Brazil: "Bras[ií]lia", Argentina: "Buenos Aires", Chile: "Santiago", Peru: "Lima", Colombia: "Bogot[aá]", Venezuela: "Caracas", Cuba: "Havana", Egypt: "Cairo", Kenya: "Nairobi", Nigeria: "Abuja", Ethiopia: "Addis Ababa", Morocco: "Rabat", Ghana: "Accra", Turkey: "Ankara", Iran: "Tehran", Iraq: "Baghdad", "Saudi Arabia": "Riyadh", Israel: "Jerusalem", Pakistan: "Islamabad", Bangladesh: "Dhaka", Nepal: "Kathmandu", Afghanistan: "Kabul", Iceland: "Reykjav[ií]k", Belgium: "Brussels", Switzerland: "Bern", Czechia: "Prague", Romania: "Bucharest", Bulgaria: "Sofia", Serbia: "Belgrade", Croatia: "Zagreb", Jamaica: "Kingston", Ecuador: "Quito", Uruguay: "Montevideo", Paraguay: "Asunci[oó]n", Algeria: "Algiers", Tunisia: "Tunis", Libya: "Tripoli", Senegal: "Dakar", Angola: "Luanda", Zimbabwe: "Harare", Uganda: "Kampala", Mongolia: "Ulaanbaatar", Cambodia: "Phnom.Penh", Laos: "Vientiane", Qatar: "Doha", Jordan: "Amman", Lebanon: "Beirut", Syria: "Damascus", Estonia: "Tallinn", Latvia: "Riga", Lithuania: "Vilnius", Slovakia: "Bratislava", Slovenia: "Ljubljana", Malta: "Valletta", Cyprus: "Nicosia", Luxembourg: "Luxembourg", Panama: "Panama City", "Costa Rica": "San Jos[eé]", Guatemala: "Guatemala City", Honduras: "Tegucigalpa" };
for (const [c, cap] of Object.entries(capitals)) add("capitals", `capital of ${c.toLowerCase()}`, new RegExp(cap, "i"));
const elements = { hydrogen: ["H", 1], helium: ["He", 2], lithium: ["Li", 3], carbon: ["C", 6], nitrogen: ["N", 7], oxygen: ["O", 8], fluorine: ["F", 9], neon: ["Ne", 10], sodium: ["Na", 11], magnesium: ["Mg", 12], aluminum: ["Al", 13], silicon: ["Si", 14], phosphorus: ["P", 15], sulfur: ["S", 16], chlorine: ["Cl", 17], argon: ["Ar", 18], potassium: ["K", 19], calcium: ["Ca", 20], iron: ["Fe", 26], copper: ["Cu", 29], zinc: ["Zn", 30], silver: ["Ag", 47], tin: ["Sn", 50], gold: ["Au", 79], mercury: ["Hg", 80], lead: ["Pb", 82], uranium: ["U", 92] };
for (const [n, [sym, z]] of Object.entries(elements)) { add("elements", `chemical symbol for ${n}`, new RegExp(`\\b${sym}\\b`)); add("elements", `atomic number of ${n}`, new RegExp(`\\b${z}\\b`)); }
const works = { hamlet: "Shakespeare", macbeth: "Shakespeare", "romeo and juliet": "Shakespeare", "war and peace": "Tolstoy", "anna karenina": "Tolstoy", "crime and punishment": "Dostoevsky", "pride and prejudice": "Austen", emma: "Austen", "great expectations": "Dickens", "oliver twist": "Dickens", "moby dick": "Melville", "the odyssey": "Homer", "the iliad": "Homer", "the divine comedy": "Dante", "don quixote": "Cervantes", "les miserables": "Hugo", "the stranger": "Camus", "the trial": "Kafka", "1984": "Orwell", "animal farm": "Orwell", ulysses: "Joyce", "the great gatsby": "Fitzgerald", "to kill a mockingbird": "Lee", "the catcher in the rye": "Salinger", "brave new world": "Huxley", frankenstein: "Shelley", dracula: "Stoker", "jane eyre": "Bront[eë]", "wuthering heights": "Bront[eë]", "the hobbit": "Tolkien", "the raven": "Poe", walden: "Thoreau", "the origin of species": "Darwin", "the republic": "Plato", "the prince": "Machiavelli", leviathan: "Hobbes", "the wealth of nations": "Smith" };
for (const [w, a] of Object.entries(works)) add("authors", `who wrote ${w}`, new RegExp(a));
const dates = [["the moon landing", "1969"], ["the fall of the berlin wall", "1989"], ["the french revolution", "1789"], ["world war 1 start", "1914"], ["world war 2 end", "1945"], ["the titanic sinking", "1912"], ["the signing of the magna carta", "1215"], ["columbus reaching america", "1492"], ["the declaration of independence", "1776"], ["the american civil war start", "1861"], ["the russian revolution", "1917"], ["the first world wide web page", "199[01]"], ["the iphone release", "2007"], ["the fall of constantinople", "1453"], ["the battle of hastings", "1066"], ["the war of 1812 start", "1812"], ["the great fire of london", "1666"], ["the chernobyl disaster", "1986"], ["the 9/11 attacks", "2001"], ["the dissolution of the soviet union", "1991"]];
for (const [d, y] of dates) add("dates", `when was ${d}`.replace("when was the fall of the berlin wall", "when did the berlin wall fall").replace(/when was (world war \d (start|end))/, "when did $1"), new RegExp(y));
const facts = [["largest planet", "Jupiter"], ["smallest planet", "Mercury"], ["hottest planet", "Venus"], ["closest planet to the sun", "Mercury"], ["largest ocean", "Pacific"], ["longest river in africa", "Nile"], ["tallest mountain on earth", "Everest"], ["largest country by area", "Russia"], ["largest continent", "Asia"], ["smallest continent", "Australia|Oceania"], ["hardest natural substance", "diamond"], ["lightest element", "hydrogen"], ["most abundant gas in the atmosphere", "nitrogen"], ["chemical formula of table salt", "NaCl"], ["chemical formula of carbon dioxide", "CO2|CO₂"], ["number of bones in the human body", "206"], ["number of chromosomes in humans", "46"], ["boiling point of water in fahrenheit", "212"], ["speed of sound", "34[0-4]|76\\d|1,?2\\d\\d"], ["acceleration due to gravity", "9\\.8"], ["who developed the theory of evolution", "Darwin"], ["who discovered gravity", "Newton"], ["who invented the light bulb", "Edison"], ["who painted the starry night", "Van Gogh"], ["who composed the fifth symphony", "Beethoven"], ["who is the author of harry potter", "Rowling"], ["founder of amazon", "Bezos"], ["founder of facebook", "Zuckerberg"], ["who created the world wide web", "Berners-Lee"], ["currency of the united kingdom", "pound"], ["currency of india", "rupee"], ["currency of mexico", "peso"], ["official language of brazil", "Portuguese"], ["official language of egypt", "Arabic"], ["largest city in canada", "Toronto"], ["largest city in australia", "Sydney"], ["longest wall in the world", "Great Wall"], ["the study of earthquakes is called", "seismology"], ["a group of lions is called", "pride"], ["how many sides does a hexagon have", "\\b6\\b|six"]];
for (const [q, a] of facts) add("facts", q, new RegExp(a, "i"));

const AI = Q.filter(([c]) => c !== "math" && c !== "units"), FREE = Q.filter(([c]) => c === "math" || c === "units");
const cap = Number(process.env.CAP || 250), day = Number(process.env.DAY ?? Math.floor(Date.now() / 864e5));
const start = (day * cap) % AI.length, slice = Array.from({ length: Math.min(cap, AI.length) }, (_, i) => AI[(start + i) % AI.length]);
(async () => {
  const run = [...FREE, ...slice]; let pass = 0; const fail = []; const by = {};
  for (const [cat, q, re] of run) {
    if (!E.tryMath(q) && !E.tryConvert(q)) await new Promise((ok) => setTimeout(ok, 3200));
    let r; try { r = await E.answer(q, { ifUnset: "yes" }); } catch (e) { r = { kind: "throw", body: String(e) }; }
    const text = [r.title, r.body, r.value, r.to, r.toUnit, r.big, r.unit, r.sub].filter((x) => x != null).join(" ");
    const ok = re.test(text); ok ? pass++ : fail.push(q);
    (by[cat] ??= [0, 0])[ok ? 0 : 1]++;
    console.log((ok ? "PASS" : "FAIL") + " | " + q + " => " + text.slice(0, 100).replace(/\n/g, " "));
  }
  console.log("\n" + Object.entries(by).map(([c, [p, f]]) => `${c} ${p}/${p + f}`).join("  "));
  console.log(`${pass}/${run.length} pass (${Q.length} questions in the bank). FAIL: ${fail.join(" ; ")}`);
  process.exit(fail.length ? 1 : 0);
})();
