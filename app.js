/* ============================================================================
   MATTIA & TESSA — Area invitati (webapp)
   ----------------------------------------------------------------------------
   Vanilla JS, nessun framework, nessun backend.
   Le risposte vengono inviate a una Google Apps Script Web App (Google Sheet).

   >>> TUTTO CIÒ CHE PUOI MODIFICARE FACILMENTE È QUI SOTTO, NELLA SEZIONE
       "CONFIGURAZIONE". La logica vera e propria viene dopo: di norma non
       serve toccarla. <<<
   ========================================================================== */


/* ============================================================================
   1) CONFIGURAZIONE — modifica liberamente
   ========================================================================== */

/* --- Contatti WhatsApp ------------------------------------------------------
   Numeri in formato internazionale SENZA "+" e SENZA spazi (es. "39345...").
   Vengono mostrati come pulsanti nei messaggi "non ti troviamo" e
   "quiz fallito". Puoi aggiungerne/toglierne semplicemente modificando
   questa lista.                                                              */
const WHATSAPP_CONTACTS = [
  { nome: "Mattia", numero: "393454463802" },
  { nome: "Tessa",  numero: "393487200087" },
];

/* --- URL della Web App di Google Apps Script -------------------------------
   Si ottiene dal deploy dello script (Pubblica → Implementa come app web).
   Deve terminare con ".../exec".                                            */
const SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwYxD47vZgQdVwUG0LCpTudLX-bJiFY9RIP1BF-ek3Dkj7ITurn-uEe1S7xGG51HESI/exec";

/* --- Data/ora del matrimonio (per il countdown) ---------------------------- */
const WEDDING_DATE = new Date("2026-07-12T19:00:00");

/* --- Tentativi consentiti per superare il quiz ------------------------------
   Dopo questo numero di tentativi sbagliati si finisce sulla schermata di
   blocco con il contatto WhatsApp.                                           */
const QUIZ_MAX_ATTEMPTS = 3;

/* --- Tolleranza ai refusi nel login (distanza di Levenshtein) --------------
   0 = match esatto richiesto. 1-2 = tollera piccoli errori di battitura.
   Vale sia per il nome che per il cognome.                                  */
const FUZZY_THRESHOLD = 2;

/* --- DOMANDE DEL QUIZ ------------------------------------------------------
   Tre domande uguali per tutti. Modifica testo, opzioni e l'indice (0-based)
   della risposta corretta. "rispostaCorretta" è la posizione nell'array
   "opzioni" (0 = prima opzione, 1 = seconda, ecc.).                         */
const QUIZ_QUESTIONS = [
  {
    domanda: "Dove si sono conosciuti Tessa e Mattia?",
    opzioni: ["Pertini", "Julep"],
    rispostaCorretta: 1 // <-- Julep
  },
  {
    domanda: "Chi ha organizzato questo matrimonio?",
    opzioni: ["Tessa", "Mattia"],
    rispostaCorretta: 1 // <-- Mattia
  },
  {
    // Domanda "per gioco": NON ha una risposta giusta o sbagliata
    // (rispostaCorretta: null) e quindi non influisce sul superamento del quiz.
    // Con "registra: true" la risposta scelta viene comunque salvata nel
    // foglio Google (colonna "Chi fa più ridere").
    domanda: "Chi fa più ridere tra Tessa e Mattia?",
    opzioni: ["Tessa", "Mattia"],
    rispostaCorretta: null,
    registra: true
  }
];

/* --- TESTI DEI MESSAGGI ----------------------------------------------------
   Cambia qui i testi senza toccare la logica. Puoi usare HTML semplice
   (es. <strong>, <br>).                                                     */
const MESSAGES = {
  // STEP 0 — nessun match trovato nel login
  loginNotFound:
    "Non troviamo il tuo nome nella lista 🤔<br>Controlla nome e cognome, oppure scrivici su WhatsApp e ti aiutiamo subito.",

  // STEP 1 — quiz superato (saluto in cima al quiz)
  quizHello: (nome) => `Ciao ${nome}!`,

  // STEP 1 — risposta sbagliata, ma con tentativi ancora disponibili.
  // Riceve il numero di risposte sbagliate e i tentativi rimasti.
  quizWrong: (sbagliate, rimasti) => {
    const rispParola = sbagliate === 1 ? "risposta sbagliata" : "risposte sbagliate";
    const tentParola = rimasti === 1 ? "tentativo" : "tentativi";
    return `Hai <strong>${sbagliate} ${rispParola}</strong>. Ti ${rimasti === 1 ? "resta" : "restano"} <strong>${rimasti} ${tentParola}</strong>: dai, riprova! 💪`;
  },

  // STEP 1c — quiz superato: messaggio di congratulazioni (riceve il nome)
  quizCongrats: (nome) =>
    `Bravo ${nome}, le hai azzeccate tutte! 🎉 Sei ufficialmente pronto: ora ti sveliamo dove dormirai e tutti i dettagli della giornata.`,

  // STEP 1 — quiz fallito dopo tutti i tentativi (schermata di blocco)
  quizFailed:
    "Hai esaurito i tentativi! 😅 Niente paura: scrivici su WhatsApp e ti diamo una mano a sbloccare tutte le info.",

  // STEP 2 — messaggio fisso sotto l'alloggio (caso normale)
  hotelCheckin:
    "La cerimonia inizia alle <strong>19:00</strong> e potete arrivare in location dalle <strong>18:00</strong>. Per darvi tempo di rilassarvi e prepararvi, potete fare il check-in in struttura già dalle <strong>15:30</strong>: basta dire il vostro nome alla reception!",

  // STEP 2 — caso "alloggio autonomo" (Massimiliano Facchini, Annalisa Lecca)
  hotelAutonomo:
    "Voi due siete decisamente troppo organizzati per noi! 😄 Avete già il vostro alloggio personale, quindi godetevelo con calma. Vi aspettiamo in location dalle <strong>18:00</strong>, con cerimonia alle <strong>19:00</strong>. Mi raccomando: non arrivate troppo riposati, qui si balla fino a tardi!",

  // STEP 2 — caso ospiti che dormono in location (Ca' Salva)
  hotelLocation:
    "Dormirai direttamente in <strong>location</strong>, comodissimo! La cerimonia inizia alle <strong>19:00</strong> e ci si può sistemare in struttura già dal pomeriggio: per il check-in basta dire il tuo nome alla reception.",

  // STEP 3 — testo navetta (caso normale)
  navettaText:
    "Per raggiungere la location senza pensieri abbiamo organizzato una <strong>navetta</strong> dall'hotel a Ca' Salva, con <strong>andata e ritorno</strong> a fine serata. Così potete brindare in tutta tranquillità!",

  // STEP 3 — testo navetta per chi dorme in location (solo ritorno non serve)
  navettaTextLocation:
    "Dormendo già in location non hai pensieri di spostamento per il rientro 🎉. Se però vuoi raggiungere altri luoghi con il gruppo, facci sapere se preferiresti usare la <strong>navetta</strong> o muoverti con la <strong>tua auto</strong>.",

  // STEP 5 — testo regalo / lista nozze
  giftText:
    "Niente lista nozze: litigheremmo su cosa metterci dentro 😅. Se ti va di farci un regalo, puoi contribuire al nostro viaggio in <strong>Indonesia</strong>, all'arredamento di <strong>casa nuova</strong>, oppure a qualunque <strong>formaggio o vino</strong> improbabile che Tessa vorrà assolutamente assaggiare. Qualsiasi cosa, sarà un pensiero gradito!",

  // STEP 5 — saluto finale
  finalHello: (nome) => `Grazie ${nome}!`,

  // Sincronizzazione con il foglio: errore di rete (non bloccante)
  syncError:
    "Le tue risposte sono salvate su questo dispositivo. Sembra che la connessione faccia i capricci: riproveremo ad inviarle automaticamente. Se hai dubbi, scrivici pure su WhatsApp.",
};

/* --- DATI REGALO / IBAN ----------------------------------------------------
   Usati nello step finale, nell'immagine e nel PDF del riepilogo.           */
const GIFT = {
  iban: "IT53I0503401631000000019468",
  holder: "Mattia Schiavano e Tessa Santagostino",
};

/* --- DATASET OSPITI --------------------------------------------------------
   Aggiungi/modifica gli ospiti qui. Campi:
     nome, cognome           -> usati per il login (con tolleranza refusi)
     hotel, indirizzo        -> info alloggio (null se non applicabile)
     mapsLink (opzionale)    -> link Google Maps; se assente viene generato
     alloggioAutonomo (opz.) -> true per chi ha alloggio proprio             */
const GUESTS = [
  // VILLA DE' GIACOMI - Via Tito Livio, 7, 35037 Teolo PD
  {nome:"Giorgia", cognome:"Facchini", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Gaia", cognome:"Facchini", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Mamdouh", cognome:"Mouhamad Alqudsi", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Giacomo", cognome:"Facchini", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Lucia", cognome:"Terziotti", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Vittorio", cognome:"Clemente", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Marco", cognome:"Frigo", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Sara", cognome:"Clemente", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Angelo", cognome:"Tremolada", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Valeria", cognome:"Dongiovanni", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Daniele", cognome:"Tremolada", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Adriano", cognome:"Casamassima", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Franca", cognome:"Savoldi", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},

  // RESIDENZA TITO LIVIO - Piazza Tito Livio, 27/a, Teolo, Padova
  {nome:"Claudio", cognome:"Schiavano", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Gianni", cognome:"Oleari", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Loris", cognome:"Oleari", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Cristina", cognome:"Oleari", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Giampietro", cognome:"Santagostino", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Matteo", cognome:"De Blasi", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Matilde", cognome:"Piccini", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Nini", cognome:"Simenonidis", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Stelios", cognome:"Alexopoulos", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Alessandra", cognome:"Venezia", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Lamberto", cognome:"Pellegrino", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Sofia", cognome:"Castelli", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Pietro", cognome:"Moltani", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Emanuela", cognome:"De Santis", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},
  {nome:"Andrea", cognome:"Munforte", hotel:"Residenza Tito Livio", indirizzo:"Piazza Tito Livio, 27/a, Teolo, Padova"},

  // AGRITURISMO CA' NOALE - Via Cicogna Pirio n.21, 35037 Teolo, Italia
  {nome:"Christos", cognome:"Simeonidis", hotel:"Agriturismo Ca' Noale", indirizzo:"Via Cicogna Pirio n.21, 35037 Teolo, Italia"},
  {nome:"Massimo", cognome:"Alagona", hotel:"Agriturismo Ca' Noale", indirizzo:"Via Cicogna Pirio n.21, 35037 Teolo, Italia"},
  {nome:"Simone", cognome:"Mattioli", hotel:"Agriturismo Ca' Noale", indirizzo:"Via Cicogna Pirio n.21, 35037 Teolo, Italia"},

  // LOCANDA AL PICCOLO COLLE - Via Euganea Bresseo, 86, 35037 Teolo PD
  {nome:"Ernesto", cognome:"Fabbrocino", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},
  {nome:"Noemi", cognome:"Grano", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},
  {nome:"Mario", cognome:"Geromin", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},
  {nome:"Izaura", cognome:"Gjoka", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},
  {nome:"Marta", cognome:"Carrà", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},
  {nome:"Giovanni", cognome:"Di Luggo", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},

  // AI GRADONI - Via Castelnuovo 19, 35037 Teolo, Italia
  {nome:"Vito", cognome:"Schiavano", hotel:"Ai Gradoni", indirizzo:"Via Castelnuovo 19, 35037 Teolo, Italia"},
  {nome:"Dorotea", cognome:"Lecca", hotel:"Ai Gradoni", indirizzo:"Via Castelnuovo 19, 35037 Teolo, Italia"},
  {nome:"Maurizio", cognome:"Malagnino", hotel:"Ai Gradoni", indirizzo:"Via Castelnuovo 19, 35037 Teolo, Italia"},
  {nome:"Anna", cognome:"Vantaggiato", hotel:"Ai Gradoni", indirizzo:"Via Castelnuovo 19, 35037 Teolo, Italia"},

  // COLLE DEL BARBAROSSA - Via G. Marconi 46, 35037 Teolo, Italia
  {nome:"Anthea", cognome:"Schiavano", hotel:"Colle del Barbarossa", indirizzo:"Via G. Marconi 46, 35037 Teolo, Italia"},
  {nome:"Damiano", cognome:"Valente", hotel:"Colle del Barbarossa", indirizzo:"Via G. Marconi 46, 35037 Teolo, Italia"},
  {nome:"Valentina", cognome:"Lecca", hotel:"Colle del Barbarossa", indirizzo:"Via G. Marconi 46, 35037 Teolo, Italia"},
  {nome:"Francesco", cognome:"Brescia", hotel:"Colle del Barbarossa", indirizzo:"Via G. Marconi 46, 35037 Teolo, Italia"},

  // CA' SALVA (location matrimonio) - Via Venda, 1, 35037 Teolo PD
  {nome:"Iano", cognome:"Santagostino", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Gaia", cognome:"Gasparini", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Stefano", cognome:"Clemente", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Valentina", cognome:"Bertuccio", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Fabio", cognome:"Casamassima", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Federica", cognome:"Scorsone", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Davide", cognome:"Tremolada", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Riccardo", cognome:"Parviero", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Magda", cognome:"Cesana", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Kalliroi", cognome:"Simeonidis", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Giada", cognome:"Versaci", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Gabriele", cognome:"Palermo", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Laura", cognome:"Longoni", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Luca", cognome:"Casamassima", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Giuseppe", cognome:"Bertuccio", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Rosa", cognome:"Visingardi", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},

  // ALLOGGIO AUTONOMO (messaggio scherzoso, no info hotel standard)
  {nome:"Massimiliano", cognome:"Facchini", hotel:null, indirizzo:null, alloggioAutonomo:true},
  {nome:"Annalisa", cognome:"Lecca", hotel:null, indirizzo:null, alloggioAutonomo:true},

  // ===========================================================================
  // OSPITI DI TEST — solo per le prove. RIMUOVERE prima del matrimonio.
  // Tutti con cognome "Test" così sono facili da trovare ed eliminare.
  // Coprono i vari casi: hotel normale, location (Ca' Salva), alloggio autonomo.
  // ===========================================================================
  {nome:"Uno", cognome:"Test", hotel:"Villa de' Giacomi", indirizzo:"Via Tito Livio, 7, 35037 Teolo PD"},
  {nome:"Due", cognome:"Test", hotel:"Locanda al Piccolo Colle", indirizzo:"Via Euganea Bresseo, 86, 35037 Teolo PD"},
  {nome:"Tre", cognome:"Test", hotel:"Ai Gradoni", indirizzo:"Via Castelnuovo 19, 35037 Teolo, Italia"},
  {nome:"Quattro", cognome:"Test", hotel:"Ca' Salva", indirizzo:"Via Venda, 1, 35037 Teolo PD", mapsLink:"https://www.google.com/maps/search/?api=1&query=Via+Venda+1+35037+Teolo+PD"},
  {nome:"Cinque", cognome:"Test", hotel:null, indirizzo:null, alloggioAutonomo:true}
];


/* ============================================================================
   2) UTILITY — normalizzazione testo e matching tollerante (Levenshtein)
   ========================================================================== */

/* Normalizza una stringa: minuscolo, trim, accenti rimossi, spazi compattati. */
function normalize(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")               // separa i diacritici
    .replace(/[\u0300-\u036f]/g, "") // rimuove gli accenti
    .replace(/['’`]/g, " ")          // apostrofi -> spazio
    .replace(/[^a-z0-9\s]/g, " ")    // via la punteggiatura
    .replace(/\s+/g, " ")            // spazi multipli -> singolo
    .trim();
}

/* Distanza di Levenshtein (numero minimo di modifiche tra due stringhe). */
function levenshtein(a, b) {
  a = a || ""; b = b || "";
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* Confronta due termini con tolleranza:
   - match esatto
   - prefisso/accorciamento (es. "ale" -> "alessandra")
   - distanza di Levenshtein entro la soglia                                 */
function fieldMatches(input, target) {
  const a = normalize(input);
  const b = normalize(target);
  if (!a) return { ok: false, dist: 99 };
  if (a === b) return { ok: true, dist: 0 };
  // accorciamento: input è inizio del nome reale (min 3 caratteri)
  if (a.length >= 3 && b.startsWith(a)) return { ok: true, dist: 0.5 };
  const dist = levenshtein(a, b);
  // soglia adattiva: per parole molto corte stringe la tolleranza
  const threshold = Math.min(FUZZY_THRESHOLD, Math.max(1, Math.floor(b.length / 3)));
  return { ok: dist <= threshold, dist };
}

/* Cerca l'ospite con nome+cognome compatibili. Ritorna l'ospite o null. */
function findGuest(nome, cognome) {
  let best = null;
  let bestScore = Infinity;
  for (const g of GUESTS) {
    const mn = fieldMatches(nome, g.nome);
    const mc = fieldMatches(cognome, g.cognome);
    if (mn.ok && mc.ok) {
      const score = mn.dist + mc.dist;
      if (score < bestScore) { bestScore = score; best = g; }
    }
  }
  return best;
}

/* Genera un link Google Maps di ricerca a partire dall'indirizzo. */
function buildMapsLink(guest) {
  if (guest.mapsLink) return guest.mapsLink;
  if (!guest.indirizzo) return null;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(guest.indirizzo);
}

/* Capitalizza la prima lettera (per i saluti). */
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}


/* ============================================================================
   3) STATO + sessionStorage
   ========================================================================== */

const STORE_KEYS = {
  guest: "mt_guest",
  answers: "mt_answers",
  pending: "mt_pending",   // payload in attesa di invio al foglio (sessionStorage)
  donePrefix: "mt_done_",  // completamento per ospite (localStorage, persiste tra sessioni)
};

const state = {
  guest: null,
  navetta: null,       // "navetta" | "auto"
  brunch: null,        // "solo_brunch" | "brunch_piscina" | "no"
  quizAttempts: 0,     // tentativi del quiz già usati
  chiFaRidere: null,   // risposta alla domanda "per gioco" (registra: true)
};

function saveSession() {
  try {
    if (state.guest) sessionStorage.setItem(STORE_KEYS.guest, JSON.stringify(state.guest));
    sessionStorage.setItem(STORE_KEYS.answers, JSON.stringify({
      navetta: state.navetta,
      brunch: state.brunch,
      chiFaRidere: state.chiFaRidere,
    }));
  } catch (e) { /* storage non disponibile: si prosegue comunque */ }
}

function loadSession() {
  try {
    const g = sessionStorage.getItem(STORE_KEYS.guest);
    if (g) state.guest = JSON.parse(g);
    const a = sessionStorage.getItem(STORE_KEYS.answers);
    if (a) {
      const parsed = JSON.parse(a);
      state.navetta = parsed.navetta || null;
      state.brunch = parsed.brunch || null;
      state.chiFaRidere = parsed.chiFaRidere || null;
    }
  } catch (e) { /* ignore */ }
}

/* --- Completamento persistente (localStorage) ------------------------------
   Serve a riportare un ospite che rientra direttamente alla schermata finale,
   se ha già completato il flusso (anche in una sessione/giorno diverso).    */
function guestDoneKey(guest) {
  return STORE_KEYS.donePrefix + normalize(guest.nome) + "__" + normalize(guest.cognome);
}

function markGuestCompleted() {
  if (!state.guest) return;
  try {
    localStorage.setItem(guestDoneKey(state.guest), JSON.stringify({
      navetta: state.navetta,
      brunch: state.brunch,
      chiFaRidere: state.chiFaRidere,
      timestamp: new Date().toISOString(),
    }));
  } catch (e) { /* storage non disponibile */ }
}

function getGuestCompleted(guest) {
  try {
    const raw = localStorage.getItem(guestDoneKey(guest));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}


/* ============================================================================
   4) NAVIGAZIONE TRA GLI STEP
   ========================================================================== */

const appEl = document.getElementById("guest-app");
const progressEl = document.getElementById("app-progress");
const PROGRESS_STEPS = 6; // login, quiz, alloggio, navetta, brunch, finale

let currentStepId = null;

function buildProgressDots() {
  progressEl.innerHTML = "";
  for (let i = 0; i < PROGRESS_STEPS; i++) {
    const d = document.createElement("span");
    d.className = "app-dot";
    progressEl.appendChild(d);
  }
}

function updateProgress(index) {
  const dots = progressEl.querySelectorAll(".app-dot");
  dots.forEach((d, i) => {
    d.classList.toggle("active", i === index);
    d.classList.toggle("done", i < index);
  });
}

/* Mostra uno step con transizione fade. id = "step-xxx" */
function showStep(id) {
  const next = document.getElementById(id);
  if (!next) return;
  const current = currentStepId ? document.getElementById(currentStepId) : null;

  if (current && current !== next) {
    current.classList.remove("active");
  }
  // adatta la topbar (home + dots) al tema dello step: chiaro o scuro
  appEl.classList.toggle("app-light", next.classList.contains("light"));
  // piccolo ritardo per far percepire il cross-fade
  setTimeout(() => {
    next.classList.add("active");
    next.scrollTop = 0;
    const p = next.getAttribute("data-progress");
    if (p !== null) updateProgress(parseInt(p, 10));
  }, current && current !== next ? 220 : 0);

  currentStepId = id;
}

/* Apre l'app dalla home */
function openApp(startId) {
  appEl.classList.add("active", "app-fade-in");
  appEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  showStep(startId || "step-login");
  setTimeout(() => appEl.classList.remove("app-fade-in"), 600);
}

/* Torna alla home */
function closeApp() {
  appEl.classList.remove("active");
  appEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================================
   5) STEP 0 — LOGIN
   ========================================================================== */

function initLogin() {
  const form = document.getElementById("login-form");
  const nomeEl = document.getElementById("login-nome");
  const cognomeEl = document.getElementById("login-cognome");
  const errEl = document.getElementById("login-error");
  const helpEl = document.getElementById("login-help");

  renderWaButtons(
    document.getElementById("login-wa"),
    "Ciao! Non riesco ad accedere all'area invitati del vostro sito 😊"
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errEl.textContent = "";
    helpEl.style.display = "none";

    const nome = nomeEl.value.trim();
    const cognome = cognomeEl.value.trim();

    if (!nome || !cognome) {
      errEl.textContent = "Per favore inserisci sia il nome che il cognome.";
      return;
    }

    const guest = findGuest(nome, cognome);
    if (!guest) {
      errEl.innerHTML = MESSAGES.loginNotFound;
      helpEl.style.display = "block";
      return;
    }

    state.guest = guest;

    // Se questo ospite ha GIÀ completato il flusso in passato, salta tutto
    // e portalo direttamente alla schermata finale con le sue risposte.
    const done = getGuestCompleted(guest);
    if (done) {
      state.navetta = done.navetta || state.navetta;
      state.brunch = done.brunch || state.brunch;
      state.chiFaRidere = done.chiFaRidere || state.chiFaRidere;
      saveSession();
      prepareFinal();
      showStep("step-final");
      return;
    }

    saveSession();
    prepareQuiz();
    showStep("step-quiz");
  });
}


/* ============================================================================
   6) STEP 1 — QUIZ
   ========================================================================== */

function prepareQuiz() {
  state.quizAttempts = 0; // azzera i tentativi a ogni nuovo accesso al quiz

  document.getElementById("quiz-hello").textContent =
    MESSAGES.quizHello(capitalize(state.guest.nome));

  const wrap = document.getElementById("quiz-questions");
  wrap.innerHTML = "";

  QUIZ_QUESTIONS.forEach((q, qi) => {
    const block = document.createElement("div");
    block.className = "quiz-q";
    block.innerHTML = `
      <div class="quiz-q-num">Domanda ${qi + 1} / ${QUIZ_QUESTIONS.length}</div>
      <div class="quiz-q-text">${q.domanda}</div>
    `;
    q.opzioni.forEach((opt, oi) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-option";
      btn.textContent = opt;
      btn.dataset.q = qi;
      btn.dataset.o = oi;
      btn.addEventListener("click", () => {
        // deseleziona le altre opzioni della stessa domanda
        block.querySelectorAll(".app-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        checkQuizComplete();
      });
      block.appendChild(btn);
    });
    wrap.appendChild(block);
  });

  // reset stato bottone
  document.getElementById("quiz-submit").disabled = true;
  document.getElementById("quiz-error").textContent = "";
}

function getQuizSelections() {
  const sel = [];
  for (let qi = 0; qi < QUIZ_QUESTIONS.length; qi++) {
    const chosen = document.querySelector(`#quiz-questions .app-option.selected[data-q="${qi}"]`);
    sel.push(chosen ? parseInt(chosen.dataset.o, 10) : null);
  }
  return sel;
}

function checkQuizComplete() {
  const sel = getQuizSelections();
  const allAnswered = sel.every((s) => s !== null);
  document.getElementById("quiz-submit").disabled = !allAnswered;
}

function initQuiz() {
  const form = document.getElementById("quiz-form");
  const errEl = document.getElementById("quiz-error");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const sel = getQuizSelections();
    // Conta solo le domande VALUTATE (quelle con una risposta corretta).
    // Le domande "per gioco" (rispostaCorretta: null) non incidono.
    const wrongCount = QUIZ_QUESTIONS.reduce(
      (n, q, i) => n + (q.rispostaCorretta == null ? 0 : (sel[i] === q.rispostaCorretta ? 0 : 1)), 0
    );

    if (wrongCount === 0) {
      // Domande valutate tutte corrette -> salva la risposta "per gioco",
      // poi congratulazioni e alloggio.
      captureFunnyAnswer(sel);
      errEl.innerHTML = "";
      prepareCongrats();
      showStep("step-congrats");
      return;
    }

    // Risposta/e sbagliata/e: consuma un tentativo
    state.quizAttempts += 1;
    const remaining = QUIZ_MAX_ATTEMPTS - state.quizAttempts;

    if (remaining > 0) {
      errEl.innerHTML = MESSAGES.quizWrong(wrongCount, remaining);
      // riporta il messaggio in vista
      try { errEl.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
    } else {
      errEl.innerHTML = "";
      prepareLocked();
      showStep("step-locked");
    }
  });
}

/* Salva la risposta delle domande "per gioco" (registra: true) per inviarla
   poi al foglio Google. Gestisce la prima domanda registrata trovata. */
function captureFunnyAnswer(sel) {
  const i = QUIZ_QUESTIONS.findIndex((q) => q.registra);
  if (i >= 0 && sel[i] != null) {
    state.chiFaRidere = QUIZ_QUESTIONS[i].opzioni[sel[i]];
  }
}

function prepareCongrats() {
  document.getElementById("congrats-text").innerHTML =
    MESSAGES.quizCongrats(capitalize(state.guest.nome));
}

function initCongrats() {
  document.getElementById("congrats-continue").addEventListener("click", () => {
    prepareHotel();
    showStep("step-hotel");
  });
}

function prepareLocked() {
  document.getElementById("locked-text").innerHTML = MESSAGES.quizFailed;
  renderWaButtons(
    document.getElementById("locked-wa"),
    "Ciao! Ho sbagliato il quiz sul vostro sito 😅 mi aiutate ad accedere alle info?"
  );
}


/* ============================================================================
   7) STEP 2 — ALLOGGIO
   ========================================================================== */

function prepareHotel() {
  const g = state.guest;
  const wrap = document.getElementById("hotel-content");
  const isLocation = g.hotel === "Ca' Salva";

  if (g.alloggioAutonomo) {
    // Caso speciale: alloggio proprio
    wrap.innerHTML = `<p class="app-text" style="margin-bottom:0;">${MESSAGES.hotelAutonomo}</p>`;
    return;
  }

  const maps = buildMapsLink(g);
  const mapsBtn = maps
    ? `<a class="map-btn" href="${maps}" target="_blank" rel="noopener">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
         Apri su Google Maps
       </a>`
    : "";

  const message = isLocation ? MESSAGES.hotelLocation : MESSAGES.hotelCheckin;

  wrap.innerHTML = `
    <div class="app-box">
      <div class="app-box-name">${g.hotel || ""}</div>
      <div class="app-box-addr">${g.indirizzo || ""}</div>
      ${mapsBtn}
      <div class="app-info-line">${message}</div>
    </div>
  `;
}


/* ============================================================================
   8) STEP 3 — NAVETTA
   ========================================================================== */

function prepareNavetta() {
  const g = state.guest;
  const isLocation = g.hotel === "Ca' Salva";

  document.getElementById("navetta-text").innerHTML =
    isLocation ? MESSAGES.navettaTextLocation : MESSAGES.navettaText;

  const opts = [
    { value: "navetta", label: "Sì, uso la navetta" },
    { value: "auto", label: "No, vengo con la mia auto" },
  ];

  const wrap = document.getElementById("navetta-options");
  wrap.innerHTML = "";
  opts.forEach((o) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-option";
    btn.textContent = o.label;
    btn.dataset.value = o.value;
    if (state.navetta === o.value) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".app-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.navetta = o.value;
      document.getElementById("navetta-continue").disabled = false;
    });
    wrap.appendChild(btn);
  });

  document.getElementById("navetta-continue").disabled = !state.navetta;
}

function initNavetta() {
  document.getElementById("navetta-continue").addEventListener("click", () => {
    if (!state.navetta) return;
    saveSession();
    prepareBrunch();
    showStep("step-brunch");
  });
}


/* ============================================================================
   9) STEP 4 — BRUNCH
   ========================================================================== */

function prepareBrunch() {
  const opts = [
    { value: "solo_brunch", label: "Solo brunch (mi fermo fino a metà giornata)" },
    { value: "brunch_piscina", label: "Brunch + pomeriggio in piscina" },
    { value: "no", label: "Non parteciperò" },
  ];

  const wrap = document.getElementById("brunch-options");
  wrap.innerHTML = "";
  opts.forEach((o) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-option";
    btn.textContent = o.label;
    btn.dataset.value = o.value;
    if (state.brunch === o.value) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".app-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.brunch = o.value;
      document.getElementById("brunch-continue").disabled = false;
    });
    wrap.appendChild(btn);
  });

  document.getElementById("brunch-continue").disabled = !state.brunch;
}

function initBrunch() {
  document.getElementById("brunch-continue").addEventListener("click", () => {
    if (!state.brunch) return;
    saveSession();
    markGuestCompleted(); // ricorda che ha finito (rientro diretto al finale)
    // STEP 4 completato -> invio al foglio Google
    sendToSheet();
    prepareFinal();
    showStep("step-final");
  });
}


/* ============================================================================
   10) STEP 5 — FINALE / REGALO
   ========================================================================== */

const LABELS = {
  navetta: { navetta: "Navetta", auto: "Auto propria" },
  brunch: { solo_brunch: "Solo brunch", brunch_piscina: "Brunch + piscina", no: "Non partecipo" },
};

/* Raccoglie tutti i dati del riepilogo (usato da finale, immagine e PDF). */
function getRecap() {
  const g = state.guest || {};
  const rows = [];
  if (g.hotel) {
    rows.push(["Alloggio", g.hotel]);
    if (g.indirizzo) rows.push(["Indirizzo", g.indirizzo]);
  } else if (g.alloggioAutonomo) {
    rows.push(["Alloggio", "Autonomo"]);
  }
  rows.push(["Navetta", LABELS.navetta[state.navetta] || "—"]);
  rows.push(["Brunch lunedì", LABELS.brunch[state.brunch] || "—"]);
  return {
    name: capitalize(g.nome) + (g.cognome ? " " + capitalize(g.cognome) : ""),
    firstName: capitalize(g.nome),
    rows: rows,
  };
}

function prepareFinal() {
  const g = state.guest;
  document.getElementById("final-hello").textContent = MESSAGES.finalHello(capitalize(g.nome));
  document.getElementById("gift-text").innerHTML = MESSAGES.giftText;

  // IBAN da un'unica fonte (GIFT)
  const ibanEl = document.getElementById("iban-value");
  const holderEl = document.getElementById("iban-holder");
  if (ibanEl) ibanEl.textContent = GIFT.iban;
  if (holderEl) holderEl.textContent = GIFT.holder;

  const recap = getRecap();
  document.getElementById("final-summary").innerHTML = recap.rows
    .map(([k, v]) => `<div class="summary-row"><span class="summary-key">${k}</span><span class="summary-val">${v}</span></div>`)
    .join("");
}

function initFinal() {
  document.getElementById("final-home").addEventListener("click", closeApp);
  document.getElementById("save-image").addEventListener("click", downloadSummaryImage);
  document.getElementById("save-pdf").addEventListener("click", downloadSummaryPDF);

  const copyBtn = document.getElementById("copy-iban");
  copyBtn.addEventListener("click", async () => {
    const iban = document.getElementById("iban-value").textContent.trim();
    try {
      await navigator.clipboard.writeText(iban);
    } catch (e) {
      // fallback per browser/contesti senza clipboard API
      const tmp = document.createElement("textarea");
      tmp.value = iban;
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(tmp);
    }
    copyBtn.classList.add("copied");
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = "✓ Copiato";
    setTimeout(() => { copyBtn.classList.remove("copied"); copyBtn.innerHTML = original; }, 2000);
  });
}


/* ============================================================================
   10b) SALVA RIEPILOGO — immagine PNG (canvas) e PDF (stampa)
   ========================================================================== */

function showSaveHint(text) {
  const el = document.getElementById("save-hint");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

/* Carica i font custom prima di disegnarli sul canvas (altrimenti il browser
   userebbe un fallback). Non blocca se il font non è disponibile.           */
async function ensureFontsLoaded() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load('400 80px "TAN Nimbus"'),
      document.fonts.load('400 16px "Space Mono"'),
      document.fonts.load('700 16px "Space Mono"'),
    ]);
    await document.fonts.ready;
  } catch (e) { /* prosegui con i fallback */ }
}

/* Disegna il riepilogo su un canvas e ritorna il canvas (verticale, in tema). */
function buildSummaryCanvas() {
  const recap = getRecap();
  const scale = 2;                  // nitidezza retina
  const W = 720;                    // larghezza logica
  const pad = 56;
  const cssBlack = "#0b0b0b";
  const cream = "#f0ebe0";
  const dim = "rgba(240,235,224,0.55)";
  const faint = "rgba(240,235,224,0.30)";
  const border = "rgba(240,235,224,0.22)";

  // Canvas temporaneo alto, poi ritaglio all'altezza usata.
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = 1400 * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  // Sfondo
  ctx.fillStyle = cssBlack;
  ctx.fillRect(0, 0, W, 1400);

  let y = pad + 12;

  // Cornice interna
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, W - 40, 1360); // verrà coperta dal ritaglio finale

  // Eyebrow
  ctx.fillStyle = faint;
  ctx.font = '400 13px "Space Mono", monospace';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
  ctx.textAlign = "center";
  ctx.fillText("· SAVE THE DATE ·", W / 2, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += 78;

  // Nomi
  ctx.fillStyle = "#faf8f3";
  ctx.font = '400 64px "TAN Nimbus", serif';
  ctx.fillText("Mattia & Tessa", W / 2, y);
  y += 38;

  // Data + luogo
  ctx.fillStyle = dim;
  ctx.font = '400 14px "Space Mono", monospace';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  ctx.fillText("12 · 07 · 2026   —   CA' SALVA · TEOLO (PD)", W / 2, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += 40;

  // Divider con rombo
  ctx.strokeStyle = border;
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W / 2 - 12, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 + 12, y); ctx.lineTo(W - pad, y); ctx.stroke();
  ctx.save(); ctx.translate(W / 2, y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = faint; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
  y += 50;

  // Saluto
  ctx.fillStyle = "#faf8f3";
  ctx.font = '400 34px "TAN Nimbus", serif';
  ctx.fillText("Ciao " + recap.firstName + "!", W / 2, y);
  y += 34;

  ctx.fillStyle = dim;
  ctx.font = '400 15px "Poppins", sans-serif';
  ctx.fillText("Ecco il tuo riepilogo per il nostro matrimonio", W / 2, y);
  y += 44;

  // Box riepilogo
  ctx.textAlign = "left";
  const boxX = pad, boxW = W - pad * 2;
  const rowH = 60;

  recap.rows.forEach(([k, v]) => {
    // chiave
    ctx.fillStyle = faint;
    ctx.font = '400 12px "Space Mono", monospace';
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText(k.toUpperCase(), boxX, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    y += 22;
    // valore (a capo se lungo)
    ctx.fillStyle = cream;
    ctx.font = '400 17px "Poppins", sans-serif';
    const lines = wrapCanvasText(ctx, v, boxW);
    lines.forEach((ln) => { ctx.fillText(ln, boxX, y); y += 24; });
    y += 12;
    // separatore
    ctx.strokeStyle = border;
    ctx.beginPath(); ctx.moveTo(boxX, y); ctx.lineTo(boxX + boxW, y); ctx.stroke();
    y += 26;
  });

  // Nota orari
  y += 4;
  ctx.fillStyle = dim;
  ctx.font = '400 14px "Poppins", sans-serif';
  const noteLines = wrapCanvasText(ctx, "Cerimonia ore 19:00 · Arrivo in location dalle 18:00 · Check-in in struttura dalle 15:30.", boxW);
  noteLines.forEach((ln) => { ctx.fillText(ln, boxX, y); y += 22; });
  y += 26;

  // Regalo / IBAN
  ctx.textAlign = "center";
  ctx.fillStyle = faint;
  ctx.font = '400 12px "Space Mono", monospace';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  ctx.fillText("· UN REGALO ·", W / 2, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += 30;

  ctx.textAlign = "left";
  ctx.fillStyle = faint;
  ctx.font = '400 12px "Space Mono", monospace';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("IBAN", boxX, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += 24;
  ctx.fillStyle = "#faf8f3";
  ctx.font = '700 18px "Space Mono", monospace';
  ctx.fillText(GIFT.iban, boxX, y);
  y += 30;
  ctx.fillStyle = faint;
  ctx.font = '400 12px "Space Mono", monospace';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("INTESTATO A", boxX, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  y += 24;
  ctx.fillStyle = cream;
  ctx.font = '400 16px "Poppins", sans-serif';
  wrapCanvasText(ctx, GIFT.holder, boxW).forEach((ln) => { ctx.fillText(ln, boxX, y); y += 22; });
  y += 28;

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#faf8f3";
  ctx.font = '400 24px "TAN Nimbus", serif';
  ctx.fillText("Vi aspettiamo!", W / 2, y);
  y += 30;

  const usedH = y + pad;

  // Ritaglia all'altezza effettiva
  const out = document.createElement("canvas");
  out.width = W * scale;
  out.height = usedH * scale;
  const octx = out.getContext("2d");
  octx.fillStyle = cssBlack;
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0);
  // Cornice pulita sull'output
  octx.strokeStyle = border;
  octx.lineWidth = 1 * scale;
  octx.strokeRect(20 * scale, 20 * scale, (W - 40) * scale, (usedH - 40) * scale);

  return out;
}

/* Manda a capo il testo in base alla larghezza disponibile sul canvas. */
function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function downloadSummaryImage() {
  showSaveHint("Preparo l'immagine…");
  await ensureFontsLoaded();
  const canvas = buildSummaryCanvas();

  canvas.toBlob((blob) => {
    if (!blob) { showSaveHint("Non è stato possibile creare l'immagine."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mattia-Tessa-riepilogo.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Su alcuni iPhone il download diretto non parte: apriamo l'immagine così
    // l'utente può tenerla premuta e salvarla nelle Foto.
    setTimeout(() => {
      const opened = window.open(url, "_blank");
      if (opened) {
        showSaveHint("Se il download non parte, tieni premuta l'immagine e scegli «Salva».");
      } else {
        showSaveHint("Immagine salvata. Controlla i tuoi Download.");
      }
      setTimeout(() => URL.revokeObjectURL(url), 8000);
    }, 400);
  }, "image/png");
}

/* Riempie il foglio stampabile e apre la stampa (l'utente sceglie «Salva PDF»). */
function downloadSummaryPDF() {
  const recap = getRecap();
  const rowsHtml = recap.rows
    .map(([k, v]) => `<div class="ps-row"><span class="ps-key">${k}</span><span class="ps-val">${v}</span></div>`)
    .join("");

  document.getElementById("print-sheet").innerHTML = `
    <div class="ps-wrap">
      <div class="ps-sub">· Save the Date ·</div>
      <div class="ps-names">Mattia &amp; Tessa</div>
      <div class="ps-sub">12 · 07 · 2026 — Ca' Salva · Teolo (PD)</div>
      <div class="ps-hello">Ciao ${recap.firstName}!</div>
      ${rowsHtml}
      <div class="ps-note">Cerimonia ore 19:00 · Arrivo in location dalle 18:00 · Check-in in struttura dalle 15:30.<br>Brunch + festa in piscina lunedì, dalle 11:30 alle 19:30.</div>
      <div class="ps-row" style="margin-top:14px;"><span class="ps-key">IBAN</span><span class="ps-val" style="font-family:'Space Mono',monospace;">${GIFT.iban}</span></div>
      <div class="ps-row"><span class="ps-key">Intestato a</span><span class="ps-val">${GIFT.holder}</span></div>
      <div class="ps-foot">Vi aspettiamo!</div>
    </div>`;

  showSaveHint("Si apre la finestra di stampa: scegli «Salva come PDF».");
  setTimeout(() => window.print(), 150);
}


/* ============================================================================
   11) INVIO DATI AL GOOGLE SHEET (con retry da sessionStorage)
   ========================================================================== */

function buildPayload() {
  const g = state.guest || {};
  return {
    nome: g.nome || "",
    cognome: g.cognome || "",
    hotel: g.hotel || (g.alloggioAutonomo ? "Autonomo" : ""),
    quizSuperato: true,
    navetta: state.navetta === "navetta" ? "navetta" : "auto",
    brunch: state.brunch || "no",
    chiFaRidere: state.chiFaRidere || "", // risposta alla domanda "per gioco"
    timestamp: new Date().toISOString(),
  };
}

function sendToSheet() {
  const payload = buildPayload();
  // memorizza come "in attesa" finché l'invio non riesce
  try { sessionStorage.setItem(STORE_KEYS.pending, JSON.stringify(payload)); } catch (e) {}
  postPayload(payload);
}

function postPayload(payload) {
  const note = document.getElementById("final-sync-note");

  if (!SHEET_WEBHOOK_URL || SHEET_WEBHOOK_URL === "INSERIRE_URL_APPS_SCRIPT") {
    // URL non ancora configurato: non blocchiamo l'utente.
    console.warn("[mt] SHEET_WEBHOOK_URL non configurato: invio saltato.", payload);
    return;
  }

  fetch(SHEET_WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors", // Apps Script: risposta opaca, evita errori CORS
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  })
    .then(() => {
      // Con no-cors la risposta è opaca: consideriamo l'invio riuscito se
      // non c'è stato un errore di rete.
      try { sessionStorage.removeItem(STORE_KEYS.pending); } catch (e) {}
      if (note) note.style.display = "none";
    })
    .catch(() => {
      if (note) {
        note.textContent = MESSAGES.syncError;
        note.style.display = "block";
      }
    });
}

/* Riprova l'invio di un payload eventualmente rimasto in sospeso. */
function retryPending() {
  try {
    const raw = sessionStorage.getItem(STORE_KEYS.pending);
    if (raw) postPayload(JSON.parse(raw));
  } catch (e) {}
}


/* ============================================================================
   12) COUNTDOWN (riusato in home + finale, via classi)
   ========================================================================== */

function pad(n) { return String(n).padStart(2, "0"); }

function updateCountdown() {
  const diff = WEDDING_DATE - new Date();
  let d = 0, h = 0, m = 0, s = 0;
  if (diff > 0) {
    d = Math.floor(diff / 86400000);
    h = Math.floor((diff % 86400000) / 3600000);
    m = Math.floor((diff % 3600000) / 60000);
    s = Math.floor((diff % 60000) / 1000);
  }
  const set = (cls, val) => document.querySelectorAll(cls).forEach((el) => (el.textContent = pad(val)));
  set(".js-cd-days", d);
  set(".js-cd-hours", h);
  set(".js-cd-mins", m);
  set(".js-cd-secs", s);
}


/* ============================================================================
   13) HELPER WHATSAPP
   ========================================================================== */

function waLink(numero, text) {
  return "https://wa.me/" + encodeURIComponent(numero) + "?text=" + encodeURIComponent(text || "");
}

// Icona WhatsApp (riusata nei pulsanti generati dinamicamente)
const WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

/* Riempie un contenitore con un pulsante WhatsApp per ogni contatto. */
function renderWaButtons(container, text) {
  if (!container) return;
  container.innerHTML = WHATSAPP_CONTACTS.map((c) =>
    `<a class="app-wa-btn" href="${waLink(c.numero, text)}" target="_blank" rel="noopener">${WA_SVG} Scrivi a ${c.nome}</a>`
  ).join("");
}


/* ============================================================================
   14) BOOTSTRAP
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  loadSession();

  buildProgressDots();

  // Home -> apri l'app
  document.getElementById("enter-app").addEventListener("click", () => openApp("step-login"));
  document.getElementById("app-home-btn").addEventListener("click", closeApp);

  initLogin();
  initQuiz();
  initCongrats();
  initNavetta();
  initBrunch();
  initFinal();

  // I bottoni "Continua" che non hanno logica dedicata di selezione
  document.getElementById("hotel-continue").addEventListener("click", () => {
    prepareNavetta();
    showStep("step-navetta");
  });

  // Countdown
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Se c'è un invio rimasto in sospeso da una sessione precedente, riprova.
  retryPending();
});
