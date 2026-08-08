/* ---------------------------------------------------
   Storage helpers
   ---------------------------------------------------
   Persistenz-Kaskade pro Aufruf: window.storage (falls vorhanden) → IndexedDB
   (eigentlicher primärer Speicher dieser App) → localStorage (Fallback, falls
   IndexedDB in der jeweiligen Browser-Umgebung mal nicht verfügbar ist, z. B.
   manche private/Inkognito-Modi älterer Safari-Versionen).

   IndexedDB statt localStorage, weil localStorage hart auf ca. 5 MB pro Origin
   gedeckelt ist UND synchron arbeitet (jeder Zugriff blockiert kurz den
   Haupt-Thread). Mit eigenen Übungsbildern (Base64 in plan.exercises) und
   Jahren an Trainingshistorie ist dieses Limit real erreichbar; IndexedDB
   erlaubt je nach Browser/Gerät typischerweise mehrere hundert MB bis in den
   GB-Bereich und arbeitet komplett asynchron.
--------------------------------------------------- */
const IDB_NAME = 'eisenprotokoll-db';
const IDB_STORE = 'kv';

// Öffnet (und erstellt bei Bedarf) die IndexedDB-Datenbank genau einmal pro Tab/Ladevorgang;
// alle Storage-Funktionen teilen sich dasselbe Promise, statt bei jedem Zugriff neu zu öffnen.
// Liefert null, wenn IndexedDB in dieser Umgebung nicht verfügbar ist oder das Öffnen
// fehlschlägt (z. B. blockiert) — die Aufrufer weichen dann auf localStorage aus.
let idbOpenPromise = null;
function openIDB(){
  if (idbOpenPromise) return idbOpenPromise;
  idbOpenPromise = new Promise((resolve) => {
    if (!('indexedDB' in window)){ resolve(null); return; }
    try{
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)){
          req.result.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }catch(e){ resolve(null); }
  });
  return idbOpenPromise;
}
function idbGet(db, key){
  return new Promise((resolve) => {
    try{
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => resolve(undefined);
    }catch(e){ resolve(undefined); }
  });
}
// Speichert den Wert direkt (structured clone) statt als JSON-String — spart eine
// Serialisierungsrunde gegenüber localStorage und funktioniert auch für große,
// verschachtelte Objekte (Base64-Bilder, komplette Session-Chunks) ohne String-Overhead.
function idbSet(db, key, value){
  return new Promise((resolve) => {
    try{
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    }catch(e){ resolve(false); }
  });
}
function idbDelete(db, key){
  return new Promise((resolve) => {
    try{
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    }catch(e){ resolve(false); }
  });
}

// Einmalige Migration bestehender localStorage-Daten (Präfix 'eisenprotokoll:') nach
// IndexedDB, damit Bestandsnutzer beim Umstieg nichts verlieren. Ein Key wird erst aus
// localStorage entfernt, NACHDEM er nachweislich erfolgreich in IndexedDB geschrieben wurde —
// bei jedem Fehler (einzelner Key oder Migration insgesamt) bleibt der jeweilige Rest
// unangetastet in localStorage und wird dort von loadJSON() weiterhin gefunden. Der
// Fertig-Marker wird erst ganz am Ende gesetzt, ein Abbruch mittendrin (z. B. Tab
// geschlossen) führt beim nächsten App-Start also einfach zu einem harmlosen zweiten
// Migrationsversuch für die restlichen Keys.
const IDB_MIGRATION_MARKER = 'eisenprotokoll:idbMigrated';
let migrationPromise = null;
async function migrateLocalStorageToIndexedDB(db){
  if (!db || localStorage.getItem(IDB_MIGRATION_MARKER) === '1') return;
  try{
    const prefix = 'eisenprotokoll:';
    const keysToMove = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k !== IDB_MIGRATION_MARKER) keysToMove.push(k);
    }
    for (const k of keysToMove){
      const raw = localStorage.getItem(k);
      if (raw === null) continue;
      try{
        const value = JSON.parse(raw);
        const ok = await idbSet(db, k.slice(prefix.length), value);
        if (ok) localStorage.removeItem(k);
      }catch(e){ /* nicht parsebarer Wert -> sicherheitshalber in localStorage belassen */ }
    }
  }catch(e){ return; /* nichts markieren -> beim naechsten Start erneut versuchen */ }
  localStorage.setItem(IDB_MIGRATION_MARKER, '1');
}
function ensureMigrated(db){
  if (!migrationPromise) migrationPromise = migrateLocalStorageToIndexedDB(db);
  return migrationPromise;
}

// Fordert dauerhaften Speicher an, damit der Browser die Trainingsdaten bei Speicherdruck
// nicht ohne Vorwarnung räumt (kann sonst z. B. auf Android nach längerer Nichtnutzung der
// Seite passieren). Rein informativ/best effort: manche Browser fragen den Nutzer, andere
// entscheiden automatisch anhand von Nutzungssignalen (z. B. Homescreen-Installation); ein
// Ablehnen/Fehlschlagen hier ändert nichts am normalen Verhalten der App.
if (navigator.storage && navigator.storage.persist){
  navigator.storage.persist().catch(() => {});
}

async function loadJSON(key, fallback){
  try{
    if (window.storage){
      const res = await window.storage.get(key, false);
      return res ? JSON.parse(res.value) : fallback;
    }
  }catch(e){ /* window.storage nicht verfügbar hier — auf IndexedDB/localStorage ausweichen */ }
  try{
    const db = await openIDB();
    if (db){
      await ensureMigrated(db);
      const value = await idbGet(db, key);
      if (value !== undefined) return value;
    }
  }catch(e){ /* IndexedDB nicht verfügbar — auf localStorage ausweichen */ }
  try{
    const raw = localStorage.getItem('eisenprotokoll:' + key);
    return raw !== null ? JSON.parse(raw) : fallback;
  }catch(e){
    return fallback;
  }
}
async function saveJSON(key, value){
  try{
    if (window.storage){
      const res = await window.storage.set(key, JSON.stringify(value), false);
      if (res) return;
    }
  }catch(e){ /* window.storage nicht verfügbar hier — auf IndexedDB/localStorage ausweichen */ }
  try{
    const db = await openIDB();
    if (db){
      const ok = await idbSet(db, key, value);
      if (ok) return;
    }
  }catch(e){ /* IndexedDB nicht verfügbar — auf localStorage ausweichen */ }
  try{
    localStorage.setItem('eisenprotokoll:' + key, JSON.stringify(value));
  }catch(e){
    console.error('Speichern fehlgeschlagen', e);
    alert('Speichern hat nicht geklappt: ' + e.message);
  }
}
async function deleteJSON(key){
  try{
    if (window.storage){
      const res = await window.storage.delete(key, false);
      if (res) return;
    }
  }catch(e){ /* window.storage nicht verfuegbar hier, oder Key existierte nicht - auf IndexedDB/localStorage ausweichen */ }
  try{
    const db = await openIDB();
    if (db) await idbDelete(db, key);
  }catch(e){ /* IndexedDB nicht verfügbar — auf localStorage ausweichen */ }
  try{
    localStorage.removeItem('eisenprotokoll:' + key);
  }catch(e){ /* nichts zu tun, Key war ohnehin schon weg */ }
}

/* ---------------------------------------------------
   Sessions-Storage: nach Monat gebündelte Chunks statt ein grosser Blob
   ---------------------------------------------------
   Historisch lag der komplette Trainingsverlauf unter einem einzigen
   Storage-Key ('sessions'). Nach Jahren Training waechst dieses Array auf
   hunderte/tausende Eintraege an - und jede kleinste Aenderung (ein
   geloggter Satz, ein gelöschtes Training) hat dann den KOMPLETTEN Verlauf
   neu serialisiert und weggeschrieben.
   Stattdessen werden Sessions nach Monat gebündelt gespeichert
   ('sessionsChunk:YYYY-MM'), dazu ein schlankes Index-Array
   ('sessionsChunkIndex') mit den vorhandenen Monaten. Speichern/Loeschen
   einer Session betrifft dann nur den Chunk des jeweiligen Monats (typisch
   wenige bis einige Dutzend Sessions) statt der gesamten Historie - und
   auch beim App-Start werden nur so viele Chunks geladen wie es
   Trainingsmonate gibt (z. B. ~60 nach 5 Jahren), nicht ein Request pro
   einzelner Session.
   Alle auswertenden Funktionen (Statistiken, Rekorde, Muskelbalance, ...)
   arbeiten weiterhin ganz normal mit dem kompletten `sessions`-Array im
   Speicher - an denen aendert sich nichts, nur die Persistenz darunter.
--------------------------------------------------- */
function monthKeyOf(session){
  const d = session && session.date;
  if (typeof d === 'string' && d.length >= 7) return d.slice(0, 7);
  return 'unbekannt';
}
async function writeSessionChunks(sessionsArr){
  const groups = {};
  for (const s of sessionsArr){
    if (!s || !s.id) continue;
    const mk = monthKeyOf(s);
    (groups[mk] = groups[mk] || []).push(s);
  }
  const newIndex = Object.keys(groups).sort();
  for (const mk of newIndex){
    groups[mk].sort((a, b) => new Date(a.date) - new Date(b.date));
    await saveJSON('sessionsChunk:' + mk, groups[mk]);
  }
  await saveJSON('sessionsChunkIndex', newIndex);
}
async function loadAllSessions(){
  const chunkIndex = await loadJSON('sessionsChunkIndex', null);
  if (chunkIndex){
    const chunks = await Promise.all(chunkIndex.map(mk => loadJSON('sessionsChunk:' + mk, [])));
    return chunks.flat().filter(Boolean);
  }
  // Migration von der Zwischenversion mit einem Key pro Session.
  const perSessionIndex = await loadJSON('sessionsIndex', null);
  if (perSessionIndex){
    const loaded = await Promise.all(perSessionIndex.map(id => loadJSON('session:' + id, null)));
    const sessionsArr = loaded.filter(Boolean);
    await writeSessionChunks(sessionsArr);
    for (const id of perSessionIndex) await deleteJSON('session:' + id);
    await deleteJSON('sessionsIndex');
    return sessionsArr;
  }
  // Migration von der urspruenglichen Blob-Version (alles unter einem Key 'sessions').
  const legacyBlob = await loadJSON('sessions', []);
  if (Array.isArray(legacyBlob) && legacyBlob.length){
    await writeSessionChunks(legacyBlob);
    await saveJSON('sessions', []);
    return legacyBlob;
  }
  await saveJSON('sessionsChunkIndex', []);
  return [];
}
async function saveSessionAt(session){
  const monthKey = monthKeyOf(session);
  const chunk = await loadJSON('sessionsChunk:' + monthKey, []);
  const idx = chunk.findIndex(s => s.id === session.id);
  if (idx >= 0) chunk[idx] = session; else chunk.push(session);
  chunk.sort((a, b) => new Date(a.date) - new Date(b.date));
  await saveJSON('sessionsChunk:' + monthKey, chunk);
  const index = await loadJSON('sessionsChunkIndex', []);
  if (!index.includes(monthKey)){
    index.push(monthKey);
    index.sort();
    await saveJSON('sessionsChunkIndex', index);
  }
}
async function saveSession(session){
  return saveSessionAt(session);
}
async function deleteSessionStorage(session){
  if (!session) return;
  const monthKey = monthKeyOf(session);
  const chunk = await loadJSON('sessionsChunk:' + monthKey, []);
  const filtered = chunk.filter(s => s.id !== session.id);
  if (filtered.length){
    await saveJSON('sessionsChunk:' + monthKey, filtered);
  } else {
    // Monat ist jetzt leer: Key entfernen und aus dem Index streichen, statt eines leeren Arrays.
    await deleteJSON('sessionsChunk:' + monthKey);
    const index = await loadJSON('sessionsChunkIndex', []);
    await saveJSON('sessionsChunkIndex', index.filter(k => k !== monthKey));
  }
}
async function saveAllSessionsBulk(sessionsArr){
  const oldIndex = await loadJSON('sessionsChunkIndex', []);
  for (const mk of oldIndex){
    await deleteJSON('sessionsChunk:' + mk);
  }
  await writeSessionChunks(sessionsArr);
}

