/**
 * ============================================================================
 *  MATTIA & TESSA — Google Apps Script (backend del foglio risposte)
 * ============================================================================
 *
 *  COSA FA
 *  -------
 *  Riceve una richiesta POST (JSON) dalla webapp degli invitati e aggiunge
 *  una riga al foglio "Risposte" con le colonne:
 *      Nome | Cognome | Hotel | Navetta | Brunch | Chi fa più ridere | Timestamp
 *
 *  COME PUBBLICARLO (una volta sola)
 *  ---------------------------------
 *  1. Crea un Google Sheet nuovo.
 *  2. Menu: Estensioni → Apps Script.
 *  3. Incolla questo file (sostituisci tutto il contenuto di Code.gs).
 *  4. Salva. Esegui una volta la funzione "setup" per creare il foglio e
 *     l'intestazione (autorizza i permessi quando richiesto).
 *  5. Menu: Implementa → Nuova implementazione → Tipo: "App web".
 *       - Esegui come: Me stesso
 *       - Chi ha accesso: Chiunque
 *  6. Copia l'URL che termina con ".../exec" e incollalo in app.js alla
 *     costante SHEET_WEBHOOK_URL.
 *
 *  NOTA: la webapp invia in modalità "no-cors", quindi il browser non legge
 *  la risposta. Va benissimo: la riga viene comunque scritta sul foglio.
 * ============================================================================
 */

// Nome del foglio (tab) in cui scrivere le risposte.
var SHEET_NAME = "Risposte";

// Intestazione delle colonne.
var HEADERS = ["Nome", "Cognome", "Hotel", "Navetta", "Brunch", "Chi fa più ridere", "Timestamp"];


/**
 * Crea il foglio "Risposte" con l'intestazione, se non esiste.
 * Eseguila UNA volta a mano dopo aver incollato lo script.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}


/**
 * Riceve il POST dalla webapp e appende una riga.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // evita scritture contemporanee

  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      data.nome || "",
      data.cognome || "",
      data.hotel || "",
      data.navetta || "",
      data.brunch || "",
      data.chiFaRidere || "",
      data.timestamp || new Date().toISOString()
    ]);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}


/**
 * Permette un test rapido aprendo l'URL nel browser (richiesta GET).
 */
function doGet() {
  return jsonResponse({ ok: true, message: "Webapp attiva. Usa POST per inviare le risposte." });
}


/** Helper: risposta JSON. */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
