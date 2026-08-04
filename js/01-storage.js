/* ---------------------------------------------------
   Storage helpers
--------------------------------------------------- */
async function loadJSON(key, fallback){
  try{
    if (window.storage){
      const res = await window.storage.get(key, false);
      return res ? JSON.parse(res.value) : fallback;
    }
  }catch(e){ /* window.storage nicht verfügbar hier — auf localStorage ausweichen */ }
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
  }catch(e){ /* window.storage nicht verfügbar hier — auf localStorage ausweichen */ }
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
  }catch(e){ /* window.storage nicht verfuegbar hier, oder Key existierte nicht - auf localStorage ausweichen */ }
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

