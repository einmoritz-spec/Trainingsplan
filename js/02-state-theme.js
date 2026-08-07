
let freeSelected = new Set();

let plan = null;
let sessions = [];
let lastPerformance = {}; // { [exerciseId]: [{reps, weight}, ...] } — letzter geloggter Stand je Übung

// Baut lastPerformance komplett neu aus dem aktuellen sessions-Array auf (gleiche Struktur/
// Reihenfolge wie in endSession() beim Anhängen: pro Übung die letzten bis zu 3 Sessions,
// neueste zuerst). Wird nach dem Löschen einer Trainingseinheit aufgerufen, damit dort
// eingetragene Gewichte/Wdh. NICHT mehr als "letztes Mal"-Referenz bzw. Vorbelegung
// (buildEntry()) oder für Steigerungs-Vorschläge (checkPerformanceSuggestion()) verwendet
// werden — inkl. des Falls, dass eine Übung ausschließlich in der gelöschten Einheit
// vorkam: dann bleibt für ihre exerciseId schlicht kein Eintrag übrig, sie gilt also wieder
// als noch nie durchgeführt. Muss nach jeder Änderung an "sessions" (Löschen, Undo-Wieder-
// herstellen, Import) aufgerufen und anschließend gespeichert werden.
function rebuildLastPerformance(){
  const rebuilt = {};
  // sessions liegt chronologisch aufsteigend vor (siehe endSession(): sessions.push(...)),
  // daher rückwärts iterieren, um "neueste zuerst" pro Übung aufzubauen.
  for (let i = sessions.length - 1; i >= 0; i--){
    const session = sessions[i];
    if (!session || !session.entries) continue;
    session.entries.forEach(e => {
      if (!e.exerciseId || !e.sets || !e.sets.length) return;
      const list = rebuilt[e.exerciseId] || (rebuilt[e.exerciseId] = []);
      if (list.length < 3) list.push(e.sets.map(s => ({ ...s })));
    });
  }
  lastPerformance = rebuilt;
}
let active = null;      // { startedAt, entries: [{exerciseId, name, target, sets:[{reps,weight}]}] }
// Steuert, was in der letzten Spalte pro Satz während des aktiven Trainings angezeigt wird —
// per Klick auf den Spaltenkopf ("VOL"/"10RM"/"1RM") umschaltbar, siehe renderActive().
// 'vol' = Wdh × effektives Gewicht dieses einen Satzes (bisheriges Standardverhalten).
// '10rm'/'1rm' = aus Wdh+Gewicht dieses Satzes geschätztes Maximalgewicht (Epley-Formel).
let activeSetMetricMode = 'vol';
let timerHandle = null;
let viewingSessionId = null;

const app = document.getElementById('app');

/* ---------------------------------------------------
   Init
--------------------------------------------------- */
/* ---------------------------------------------------
   THEME (Akzentfarbe + Hell-/Dunkelmodus)
--------------------------------------------------- */
// Auswahl an Akzentfarben zur freien Wahl in den Einstellungen (jeweils Name + Hex-Wert,
// dient als Ersatz für das bisher feste Gelb). Bewusst eine überschaubare, aber bunte
// Auswahl statt eines freien Farbwählers, damit jede Option auf dunklem UND hellem
// Hintergrund gut lesbar bleibt (siehe Kontrast-Check unten).
const ACCENT_COLORS = [
  { id: 'yellow', name: 'Gelb',    hex: '#d9c74a' },
  { id: 'mustard', name: 'Senfgelb', hex: '#c9982e' },
  { id: 'orange', name: 'Orange',  hex: '#e08a3e' },
  { id: 'rust',    name: 'Rostrotbraun', hex: '#b0603f' },
  { id: 'red',     name: 'Rot',     hex: '#d9534f' },
  { id: 'maroon',  name: 'Bordeaux', hex: '#8c3b4a' },
  { id: 'pink',    name: 'Pink',    hex: '#d9678c' },
  { id: 'purple',  name: 'Lila',    hex: '#9b7fd4' },
  { id: 'navy',    name: 'Marineblau', hex: '#3d5a8a' },
  { id: 'blue',    name: 'Blau',    hex: '#5b9bd5' },
  { id: 'cyan',    name: 'Zyan',    hex: '#4bb8c4' },
  { id: 'teal',    name: 'Türkis',  hex: '#4fb3a9' },
  { id: 'mint',    name: 'Mint',    hex: '#5fbf8f' },
  { id: 'green',   name: 'Grün',    hex: '#6bb35c' },
  { id: 'khaki',   name: 'Khaki',   hex: '#57662D' },
  { id: 'beige',   name: 'Beige',   hex: '#FFE4C4' },
];

// Über den Farbwähler per Stern als Favorit gespeicherte eigene Farbtöne — persistiert in
// plan.favoriteAccentColors (Array aus Hex-Strings), werden zusätzlich zur festen
// ACCENT_COLORS-Palette im Swatch-Grid angezeigt (siehe allAccentSwatches()). Jeder Favorit
// bekommt eine stabile id nach dem Muster 'fav-<hex ohne #>', damit er wie ein normaler
// Swatch per data-accent-id auswählbar ist.
function favoriteAccentColors(){
  return Array.isArray(plan && plan.favoriteAccentColors) ? plan.favoriteAccentColors : [];
}
function allAccentSwatches(){
  const favs = favoriteAccentColors().map(hex => ({ id: `fav-${hex.replace('#','')}`, name: hex.toUpperCase(), hex, isFavorite: true }));
  return [...ACCENT_COLORS, ...favs];
}

function currentAccentColor(){
  // Ein individuell auf der Farbpalette gewählter Ton (plan.accentColorId === 'custom')
  // hat Vorrang vor den festen Swatches — der Hex-Wert selbst steckt dann in
  // plan.accentCustomHex statt in ACCENT_COLORS nachgeschlagen zu werden.
  if (plan && plan.accentColorId === 'custom' && plan.accentCustomHex){
    return { id: 'custom', name: 'Eigene Farbe', hex: plan.accentCustomHex };
  }
  const id = plan && plan.accentColorId;
  return allAccentSwatches().find(c => c.id === id) || ACCENT_COLORS[0];
}
// Eigene Hintergrundfarbe (Darstellung → Einstellungen), unabhängig von der Akzentfarbe.
// Anders als die Akzentfarbe NICHT aus der bunten ACCENT_COLORS-Palette wählbar (knallige
// Akzenttöne eignen sich schlecht als Fläche für den ganzen Bildschirm) — stattdessen eine
// kleine, bewusst zurückhaltende Auswahl neutraler Töne, passend zum jeweils aktiven Hell-/
// Dunkelmodus (siehe bgSwatchesForCurrentMode()), plus die eigenen Favoriten (geteilt mit dem
// Akzentfarben-Picker, siehe favoriteAccentColors()) und die freie Farbauswahl (HSV-Picker).
const BG_NEUTRAL_COLORS = {
  dark: [
    { id: 'bg-dark-1', name: 'Anthrazit',   hex: '#16181c' },
    { id: 'bg-dark-2', name: 'Schwarz',     hex: '#1a1a1a' },
    { id: 'bg-dark-3', name: 'Blaugrau',    hex: '#0F131C' },
    { id: 'bg-dark-4', name: 'Warmgrau',    hex: '#1a1613' },
    { id: 'bg-dark-5', name: 'Waldgrün',    hex: '#141a17' },
    { id: 'bg-dark-6', name: 'Weinrot',     hex: '#1a1416' },
    { id: 'bg-dark-7', name: 'Violettgrau', hex: '#16141c' },
  ],
  light: [
    { id: 'bg-light-1', name: 'Weiß',        hex: '#ffffff' },
    { id: 'bg-light-2', name: 'Neutralgrau', hex: '#f2f2f2' },
    { id: 'bg-light-3', name: 'Warmweiß',    hex: '#f7f3ec' },
    { id: 'bg-light-4', name: 'Kühlweiß',    hex: '#eef1f4' },
    { id: 'bg-light-5', name: 'Mintweiß',    hex: '#eef4f0' },
    { id: 'bg-light-6', name: 'Roséweiß',    hex: '#f7eef0' },
    { id: 'bg-light-7', name: 'Lavendel',    hex: '#f0eef7' },
  ],
};
// Swatches für das Grid: NUR die 4 zum aktuell aktiven Modus passenden Neutraltöne + Favoriten
// (wechselt live mit, sobald oben der Hell-/Dunkelmodus umgeschaltet wird).
function bgSwatchesForCurrentMode(){
  const neutrals = currentThemeMode() === 'light' ? BG_NEUTRAL_COLORS.light : BG_NEUTRAL_COLORS.dark;
  const favs = favoriteAccentColors().map(hex => ({ id: `fav-${hex.replace('#','')}`, name: hex.toUpperCase(), hex, isFavorite: true }));
  return [...neutrals, ...favs];
}
// Für das Auflösen einer gespeicherten plan.bgColorId (siehe currentBgColor()) ALLE Neutraltöne
// beider Modi durchsuchen, nicht nur die des aktuell aktiven — eine z.B. im Dunkelmodus gewählte
// eigene Hintergrundfarbe soll auch nach einem Wechsel zu Hell weiterhin korrekt aufgelöst
// werden (bewusste, bereits gewählte Übersteuerung bleibt bestehen, wie bei anderen Overrides
// in der App üblich) statt auf "nicht gefunden" zu laufen.
function allBgSwatches(){
  const favs = favoriteAccentColors().map(hex => ({ id: `fav-${hex.replace('#','')}`, name: hex.toUpperCase(), hex, isFavorite: true }));
  return [...BG_NEUTRAL_COLORS.dark, ...BG_NEUTRAL_COLORS.light, ...favs];
}
// plan.bgColorId === 'default' (oder gar nicht gesetzt) bedeutet: kein eigener Hintergrund, es
// gilt der normale Hell-/Dunkelmodus-Standard aus dem CSS (:root / html[data-theme="light"]) —
// daher hier null zurück, damit applyTheme() die Inline-Override wieder entfernen kann statt
// eine Farbe zu erzwingen.
function currentBgColor(){
  if (plan && plan.bgColorId === 'custom' && plan.bgCustomHex){
    return { id: 'custom', name: 'Eigene Farbe', hex: plan.bgCustomHex };
  }
  if (plan && plan.bgColorId && plan.bgColorId !== 'default'){
    return allBgSwatches().find(c => c.id === plan.bgColorId) || null;
  }
  return null;
}
function currentThemeMode(){
  return (plan && plan.themeMode === 'light') ? 'light' : 'dark';
}
// Ab welcher Helligkeit (Luminanz 0..1) auf einer Akzentfarbe dunkler statt weißer Text
// verwendet wird — per Regler in den Einstellungen (Darstellung) einstellbar, siehe
// renderSettings(). Höherer Wert = Text wird erst bei helleren Farben dunkel, bleibt also bei
// mittleren/dunkleren Tönen länger weiß. Niedrigerer Wert = Text wird schon bei dunkleren
// Farben dunkel, wird also seltener/"langsamer" weiß. Standard 0.45.
function currentAccentContrastThreshold(){
  const v = plan && plan.accentContrastThreshold;
  return (typeof v === 'number' && v >= 0 && v <= 1) ? v : 0.45;
}

// Eigene Rahmenfarbe pro Trainings-Kachel (Kategorie), unabhängig vom globalen App-Akzent —
// per Long-Press auf eine Kachel erreichbar (siehe wireModeLongPress() / openModeSettingsPrompt()).
// Nutzt dieselbe Farbpalette + Favoriten wie der Akzentfarben-Picker in den Einstellungen.
function currentTileColor(mode){
  const ms = plan && plan.modeSettings && plan.modeSettings[mode];
  if (!ms || !ms.tileColorId) return null; // kein eigener Rahmen gesetzt -> Standard-Rahmenfarbe
  if (ms.tileColorId === 'custom' && ms.tileColorHex) return { id: 'custom', name: 'Eigene Farbe', hex: ms.tileColorHex };
  return allAccentSwatches().find(c => c.id === ms.tileColorId) || null;
}

// Wendet die aktuell gespeicherte Akzentfarbe + Hell-/Dunkelmodus auf das Dokument an —
// aufgerufen einmal beim Start (vor dem ersten Render) und jedes Mal, wenn eine der beiden
// Einstellungen geändert wird (siehe renderSettings()). Setzt --accent per Inline-Style auf
// <html>, das überschreibt den Default aus dem :root-Selektor mit höherer Spezifität, ohne
// dass irgendeine andere Stelle im CSS angefasst werden muss (alles nutzt bereits var(--accent)).
// Liest eine CSS-Variable (z. B. '--accent', '--accent-3') als aktuell berechneten Wert vom
// <html>-Element aus — gebraucht für die SVG/Chart-Funktionen weiter unten, die als reine
// JS-Strings arbeiten und daher nicht automatisch von var(--accent) im CSS profitieren.
// Dadurch ziehen Diagrammfarben bei Akzentfarben-/Theme-Wechsel korrekt mit.
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// HSV↔Hex-Umrechnung für die freie Farbpalette (siehe wireAccentColorPicker) — die Palette
// selbst arbeitet mit Sättigung(x)/Helligkeit(y) bei festem Farbton (Hue), daher wird HSV
// statt RGB direkt manipuliert.
function hsvToHex(h, s, v){
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r=0,g=0,b=0;
  if (h < 60){ r=c; g=x; b=0; }
  else if (h < 120){ r=x; g=c; b=0; }
  else if (h < 180){ r=0; g=c; b=x; }
  else if (h < 240){ r=0; g=x; b=c; }
  else if (h < 300){ r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function hexToHsv(hex){
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  let h = 0;
  if (d !== 0){
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

// Ermittelt anhand der relativen Luminanz eines Hex-Farbtons, ob heller oder dunkler Text
// darauf besser lesbar ist — wird für --accent-contrast gebraucht, weil die Akzentfarbe frei
// wählbar ist (Farbpalette in den Einstellungen) und dabei auch sehr dunkle Töne annehmen
// kann, auf denen fest verdrahteter schwarzer Text (z. B. bei "Training starten") sonst
// unlesbar wäre.
function contrastTextColor(hex){
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > currentAccentContrastThreshold() ? '#121316' : '#ffffff';
}

// Leitet aus einer frei gewählten Hintergrundfarbe eine dazu passende Karten-/Rahmenfarben-
// Palette ab (Farbton + gedeckelte Sättigung der Basis beibehalten, nur die Helligkeit stufen-
// weise verschieben) — dieselben Helligkeits-Abstände wie zwischen den fest verdrahteten
// :root/html[data-theme="light"]-Werten (bg→surface→surface-2→border), nur eben ausgehend von
// der gewählten Basisfarbe statt von #121316/#f5f4f1. Dadurch wirken bei einer eigenen
// Hintergrundfarbe auch Karten, Buttons und Trennlinien wie aus einem Guss statt wie zufällig
// über die Standardfarbe gelegt. Sättigung ist gedeckelt (max. 22%), damit die abgeleiteten
// Flächen dezent bleiben und nicht bunt wirken — NUR die Akzentfarbe bleibt komplett unangetastet
// (siehe applyTheme(), --text/--muted bleiben ebenfalls unverändert für verlässlichen Kontrast).
function deriveSurfaceColors(bgHex){
  const { h, s, v } = hexToHsv(bgHex);
  const cappedS = Math.min(s, 22);
  const clampV = x => Math.max(0, Math.min(100, x));
  if (v < 50){
    return {
      surface:  hsvToHex(h, cappedS, clampV(v + 5)),
      surface2: hsvToHex(h, cappedS, clampV(v + 9)),
      border:   hsvToHex(h, cappedS, clampV(v + 15)),
    };
  }
  return {
    surface:  hsvToHex(h, Math.min(cappedS, 8), clampV(Math.max(v + 4, 99))),
    surface2: hsvToHex(h, cappedS, clampV(v - 4)),
    border:   hsvToHex(h, cappedS, clampV(v - 10)),
  };
}
// Kuratierte Liste vorinstallierter Schriftarten für den Schriftart-Picker in den Einstellungen
// (Design → Schriftart, siehe renderSettings()). "family" ist der komplette CSS-font-family-
// Stapel inkl. sinnvoller Fallbacks — bei den über Google Fonts geladenen (siehe <head>-Link)
// reicht ein einzelner Name plus generischer Fallback, bei reinen System-/Geräteschriften
// mehrere Alternativnamen, da nicht jedes Betriebssystem dieselben mitbringt.
const BUILTIN_FONTS = [
  { id: 'default', name: 'Standard (App)', family: `'Inter', system-ui, sans-serif` },
  { id: 'system', name: 'Systemschrift', family: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` },
  { id: 'poppins', name: 'Poppins', family: `'Poppins', sans-serif` },
  { id: 'montserrat', name: 'Montserrat', family: `'Montserrat', sans-serif` },
  { id: 'roboto', name: 'Roboto', family: `'Roboto', sans-serif` },
  { id: 'lato', name: 'Lato', family: `'Lato', sans-serif` },
  { id: 'opensans', name: 'Open Sans', family: `'Open Sans', sans-serif` },
  { id: 'nunito', name: 'Nunito', family: `'Nunito', sans-serif` },
  { id: 'raleway', name: 'Raleway', family: `'Raleway', sans-serif` },
  { id: 'worksans', name: 'Work Sans', family: `'Work Sans', sans-serif` },
  { id: 'dmsans', name: 'DM Sans', family: `'DM Sans', sans-serif` },
  { id: 'spacegrotesk', name: 'Space Grotesk', family: `'Space Grotesk', sans-serif` },
  { id: 'manrope', name: 'Manrope', family: `'Manrope', sans-serif` },
  { id: 'rubik', name: 'Rubik', family: `'Rubik', sans-serif` },
  { id: 'karla', name: 'Karla', family: `'Karla', sans-serif` },
  { id: 'sourcesans', name: 'Source Sans 3', family: `'Source Sans 3', sans-serif` },
  { id: 'ibmplexsans', name: 'IBM Plex Sans', family: `'IBM Plex Sans', sans-serif` },
  { id: 'arial', name: 'Arial', family: `Arial, Helvetica, sans-serif` },
  { id: 'helvetica', name: 'Helvetica', family: `'Helvetica Neue', Helvetica, Arial, sans-serif` },
  { id: 'verdana', name: 'Verdana', family: `Verdana, Geneva, sans-serif` },
  { id: 'tahoma', name: 'Tahoma', family: `Tahoma, Geneva, sans-serif` },
  { id: 'trebuchet', name: 'Trebuchet MS', family: `'Trebuchet MS', sans-serif` },
  { id: 'segoe', name: 'Segoe UI', family: `'Segoe UI', sans-serif` },
  { id: 'centurygothic', name: 'Century Gothic', family: `'Century Gothic', sans-serif` },
  { id: 'georgia', name: 'Georgia', family: `Georgia, serif` },
  { id: 'timesnewroman', name: 'Times New Roman', family: `'Times New Roman', Times, serif` },
  { id: 'palatino', name: 'Palatino', family: `'Palatino Linotype', Palatino, serif` },
  { id: 'garamond', name: 'Garamond', family: `Garamond, serif` },
  { id: 'playfair', name: 'Playfair Display', family: `'Playfair Display', serif` },
  { id: 'merriweather', name: 'Merriweather', family: `'Merriweather', serif` },
  { id: 'lora', name: 'Lora', family: `'Lora', serif` },
  { id: 'oswald', name: 'Oswald', family: `'Oswald', sans-serif` },
  { id: 'anton', name: 'Anton', family: `'Anton', sans-serif` },
  { id: 'archivoblack', name: 'Archivo Black', family: `'Archivo Black', sans-serif` },
  { id: 'comfortaa', name: 'Comfortaa', family: `'Comfortaa', sans-serif` },
  { id: 'quicksand', name: 'Quicksand', family: `'Quicksand', sans-serif` },
  { id: 'caveat', name: 'Caveat', family: `'Caveat', cursive` },
  { id: 'dancingscript', name: 'Dancing Script', family: `'Dancing Script', cursive` },
  { id: 'pacifico', name: 'Pacifico', family: `'Pacifico', cursive` },
  { id: 'courier', name: 'Courier New', family: `'Courier New', Courier, monospace` },
  { id: 'consolas', name: 'Consolas', family: `Consolas, Menlo, monospace` },
  { id: 'menlo', name: 'Menlo', family: `Menlo, Consolas, monospace` },
  { id: 'firacode', name: 'Fira Code', family: `'Fira Code', monospace` },
  { id: 'robotomono', name: 'Roboto Mono', family: `'Roboto Mono', monospace` },
  { id: 'ibmplexmono', name: 'IBM Plex Mono', family: `'IBM Plex Mono', monospace` },
  { id: 'jetbrainsmono', name: 'JetBrains Mono', family: `'JetBrains Mono', monospace` },
  { id: 'specialelite', name: 'Special Elite', family: `'Special Elite', monospace` },
  { id: 'comicsans', name: 'Comic Sans MS', family: `'Comic Sans MS', 'Comic Sans', cursive` },
];

// Eigene, per Datei-Upload hinzugefügte Schriftarten (Design → Schriftart → Eigene Schriftart
// hochladen) — siehe registerCustomFontFaces()/wireFontUpload(). Wird beim Start aus dem
// persistenten Storage geladen, unter einem EIGENEN Schlüssel statt als Teil von "plan": die
// Schriftdateien stecken komplett als Base64 im dataUrl-Feld und wären als Teil von plan bei
// jeder kleinen Planänderung unnötig mitgespeichert worden.
let customFonts = [];

// Alle wählbaren Schriftarten zusammen: die feste BUILTIN_FONTS-Liste plus alle eigenen,
// hochgeladenen Schriften (deren id-Präfix "custom:" sie eindeutig von den eingebauten trennt).
function allFontOptions(){
  return [...BUILTIN_FONTS, ...customFonts.map(f => ({ id: `custom:${f.id}`, name: f.name, family: `'${f.cssName}', sans-serif`, custom: true }))];
}
// Aktuell gewählte Schriftart (plan.fontId) — fällt auf "Standard (App)" zurück, wenn nichts
// gewählt wurde oder die gespeicherte id nicht mehr existiert (z. B. eigene Schrift gelöscht).
function currentFontOption(){
  const id = plan && plan.fontId;
  return allFontOptions().find(f => f.id === id) || BUILTIN_FONTS[0];
}
// Fügt für jede eigene, hochgeladene Schriftart eine @font-face-Regel ein (einmal pro Font,
// per eindeutigem <style>-Tag erkennbar, damit ein erneuter Aufruf sie nicht doppelt einfügt).
// Die Schriftdaten stecken direkt als Base64-Data-URL in f.dataUrl, es muss also nichts
// nachgeladen werden — funktioniert dadurch auch offline, sobald einmal hochgeladen.
function registerCustomFontFaces(){
  customFonts.forEach(f => {
    const styleId = `customFontFace-${f.id}`;
    if (document.getElementById(styleId)) return; // schon registriert
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face{ font-family:'${f.cssName}'; src:url(${f.dataUrl}) format('${f.formatHint}'); font-display:swap; }`;
    document.head.appendChild(style);
  });
}
// Wendet die aktuell gewählte Schriftart global an: --font-app wird gesetzt UND (sobald eine
// andere als die Standardschrift gewählt ist) die Klasse "font-override" auf <html> gesetzt.
// Diese Klasse aktiviert eine sehr breite CSS-Regel (siehe "html.font-override :not(...)"
// weiter oben im <style>), die die gewählte Schrift wirklich überall erzwingt — auch dort, wo
// einzelne Elemente fest JetBrains Mono (Zahlen) oder Bebas Neue (große Überschriften) nutzen.
// Ohne eigene Auswahl (id "default") bleibt die Klasse weg, damit das ursprüngliche Design
// unangetastet bleibt. Die Ausnahmen (.scroll-wheel-item-text/.font-preview-item) sorgen dafür,
// dass die Schriftart-Vorschauen im Auswahl-Rad bzw. in der Liste eigener Schriften weiterhin
// jeweils in IHRER EIGENEN Schrift angezeigt werden, statt selbst überschrieben zu werden.
function applyFontFamily(){
  const font = currentFontOption();
  document.documentElement.style.setProperty('--font-app', font.family);
  document.documentElement.classList.toggle('font-override', font.id !== 'default');
}

function applyTheme(){
  document.documentElement.setAttribute('data-theme', currentThemeMode());
  const accentHex = currentAccentColor().hex;
  document.documentElement.style.setProperty('--accent', accentHex);
  document.documentElement.style.setProperty('--accent-contrast', contrastTextColor(accentHex));
  const bgColor = currentBgColor();
  const root = document.documentElement.style;
  if (bgColor){
    root.setProperty('--bg', bgColor.hex);
    const derived = deriveSurfaceColors(bgColor.hex);
    root.setProperty('--surface', derived.surface);
    root.setProperty('--surface-2', derived.surface2);
    root.setProperty('--border', derived.border);
  } else {
    root.removeProperty('--bg');
    root.removeProperty('--surface');
    root.removeProperty('--surface-2');
    root.removeProperty('--border');
  }
  applyFontFamily();
}

async function init(){

  plan = await loadJSON('plan', DEFAULT_PLAN);
  sessions = await loadAllSessions();
  lastPerformance = await loadJSON('lastPerformance', {});
  customFonts = await loadJSON('customFonts', []);
  registerCustomFontFaces();
  applyTheme();

  let planChanged = false;
  // Übungen, die bewusst über hideExerciseFromPlan() ausgeblendet wurden, sollen beim nächsten
  // App-Start NICHT automatisch wieder auftauchen — auch wenn sie Teil von
  // DEFAULT_PLAN.exercises sind (sonst würde die Migration unten sie sofort erneut hinzufügen).
  const hiddenIds = new Set((Array.isArray(plan.removedExercises) ? plan.removedExercises : []).map(e => e.id));
  DEFAULT_PLAN.exercises.forEach(defEx => {
    if (hiddenIds.has(defEx.id)) return;
    if (!plan.exercises.some(e => e.id === defEx.id)){
      plan.exercises.push({ ...defEx });
      planChanged = true;
    }
  });
  plan.exercises.forEach(ex => {
    if (!ex.muscleGroup){
      const def = DEFAULT_PLAN.exercises.find(d => d.id === ex.id);
      ex.muscleGroup = def ? def.muscleGroup : 'Sonstige';
      planChanged = true;
    }
    if (!ex.mainMuscle){
      const def = DEFAULT_PLAN.exercises.find(d => d.id === ex.id);
      ex.mainMuscle = def ? def.mainMuscle : (ex.muscleGroup || '');
      planChanged = true;
    }
  });
  if (plan.bodyWeight === undefined) plan.bodyWeight = null;
  if (!plan._assistedFlagMigration){
    const assistedIds = new Set(['e1']); // Klimmzugmaschine: unterstützt, Volumen = Körpergewicht - eingestelltes Gewicht
    assistedIds.forEach(id => {
      const ex = plan.exercises.find(e => e.id === id);
      if (ex && !ex.assisted){
        ex.assisted = true;
        planChanged = true;
      }
    });
    plan._assistedFlagMigration = true;
    planChanged = true;
  }
  if (!plan._catFixCoreLowerBody){
    ['e6', 'e7', 'e8', 'e14', 'e20'].forEach(id => {
      const ex = plan.exercises.find(e => e.id === id);
      if (ex && ex.category !== 'unterkoerper'){
        ex.category = 'unterkoerper';
        planChanged = true;
      }
    });
    plan._catFixCoreLowerBody = true;
    planChanged = true;
  }
  // Kardio-Übung "Stepper" (e22) wurde in "Crosstrainer" umbenannt. Wer die Übung schon vor
  // der Umbenennung ins eigene plan.exercises übernommen hatte, behält sonst dauerhaft den
  // alten Namen, weil der Eintrag beim Hinzufügen als eigene Kopie abgelegt wurde und nicht
  // mehr automatisch mit DEFAULT_PLAN/EXERCISE_LIBRARY synchronisiert wird. Einmalige Migration
  // überschreibt daher den alten Namen, lässt einen eventuell selbst vergebenen anderen Namen
  // aber unangetastet.
  if (!plan._renameStepperToCrosstrainer){
    const ex = plan.exercises.find(e => e.id === 'e22');
    if (ex && ex.name === 'Stepper'){
      ex.name = 'Crosstrainer';
      planChanged = true;
    }
    if (Array.isArray(plan.removedExercises)){
      const removedEx = plan.removedExercises.find(e => e.id === 'e22');
      if (removedEx && removedEx.name === 'Stepper'){
        removedEx.name = 'Crosstrainer';
        planChanged = true;
      }
    }
    plan._renameStepperToCrosstrainer = true;
    planChanged = true;
  }
  // Situps, Rückenstrecker, Klimmzüge, Enger Klimmzug und Trizeps Dips (Bank) sollen ein
  // optionales Zusatzgewicht zum Körpergewicht erlauben (bodyweightExercise: true) — bei
  // Plänen, die diese Übungen schon VOR Einführung dieses Flags gespeichert hatten, fehlte es
  // in der eigenen Kopie und blieb dauerhaft weg (die "neue Übung aus DEFAULT_PLAN nachtragen"-
  // Migration oben greift nur, wenn die Übung komplett fehlt, nicht bei schon vorhandenen
  // Übungen). Dadurch wirkte das kg-Feld bei diesen Übungen wie deaktiviert/nicht vorgesehen,
  // obwohl ein Bonusgewicht möglich sein soll. Einmalige Migration trägt das Flag nach und
  // entfernt ein eventuell fälschlich gesetztes noWeight, das dasselbe Feld sonst hart sperrt.
  if (!plan._bodyweightExerciseFlagMigration){
    const bodyweightIds = new Set(['e6', 'e14', 'e35', 'e36', 'e53', 'e44']);
    bodyweightIds.forEach(id => {
      const ex = plan.exercises.find(e => e.id === id);
      if (ex && !ex.bodyweightExercise){
        ex.bodyweightExercise = true;
        if (ex.noWeight) delete ex.noWeight;
        planChanged = true;
      }
    });
    plan._bodyweightExerciseFlagMigration = true;
    planChanged = true;
  }
  // Situps und Rückenstrecker bewegen nicht annähernd das ganze Körpergewicht (anders als
  // Klimmzüge/Dips), sondern im Wesentlichen nur den Rumpf — biomechanische Schätzungen dafür
  // liegen bei ca. 40–65 % des Körpergewichts. Bisher floss bei diesen beiden Übungen fälschlich
  // das VOLLE Körpergewicht in die VOL-Berechnung ein. Migration trägt für schon gespeicherte
  // Pläne den realistischeren Faktor 0,5 nach (siehe effectiveSetWeight()); ein eingetragenes
  // Zusatzgewicht bleibt davon unberührt und zählt weiterhin zu 100 %.
  if (!plan._bodyWeightFactorMigration){
    const factorIds = { e6: 0.5, e14: 0.5 };
    Object.keys(factorIds).forEach(id => {
      const ex = plan.exercises.find(e => e.id === id);
      if (ex && ex.bodyWeightFactor == null){
        ex.bodyWeightFactor = factorIds[id];
        planChanged = true;
      }
    });
    plan._bodyWeightFactorMigration = true;
    planChanged = true;
  }
  // Liegestütze war bisher komplett ohne Gewichts-/VOL-Tracking (noWeight: true). Biomechanische
  // Analysen von Push-up-Varianten (u. a. Ebben et al.) beziffern den auf die Arme wirkenden
  // Anteil des Körpergewichts auf ca. 64-70 % (Rest liegt über die Füße am Boden auf) — Faktor
  // 0,65 ist als realistischere Schätzung hinterlegt, inkl. optionalem Zusatzgewicht (z. B.
  // Gewichtsweste). Migration stellt bereits gespeicherte Pläne von noWeight auf
  // bodyweightExercise + Faktor um.
  // "Rudern (Langhantel)" (e75) war inhaltlich ein Duplikat von "Langhantelrudern vorgebeugt"
  // (e37) — dieselbe Bewegung, zwei Vorlagen. e75 wurde wieder entfernt; falls sie bei jemandem
  // schon im aktiven Plan war, wird sie hier einmalig sauber rausgenommen.
  if (!plan._removeDuplicateRudernLanghantel){
    const idx = plan.exercises.findIndex(e => e.id === 'e75');
    if (idx !== -1){
      plan.exercises.splice(idx, 1);
      planChanged = true;
    }
    plan._removeDuplicateRudernLanghantel = true;
    planChanged = true;
  }
  if (!plan._pushupBodyWeightFactorMigration){
    const ex = plan.exercises.find(e => e.id === 'e44');
    if (ex){
      ex.bodyweightExercise = true;
      if (ex.bodyWeightFactor == null) ex.bodyWeightFactor = 0.65;
      if (ex.noWeight) delete ex.noWeight;
      planChanged = true;
    }
    plan._pushupBodyWeightFactorMigration = true;
    planChanged = true;
  }
  if (!plan._stripCoreFromOberkoerperList){
    const reclassified = new Set(['e6', 'e7', 'e8', 'e14', 'e20']);
    const stored = plan.modeLists && plan.modeLists.oberkoerper;
    if (stored){
      if (Array.isArray(stored)){
        const filtered = stored.filter(id => !reclassified.has(id));
        if (filtered.length !== stored.length){
          plan.modeLists.oberkoerper = filtered;
          planChanged = true;
        }
      } else if (typeof stored === 'object'){
        ['A', 'B'].forEach(k => {
          if (Array.isArray(stored[k])){
            const filtered = stored[k].filter(id => !reclassified.has(id));
            if (filtered.length !== stored[k].length){
              stored[k] = filtered;
              planChanged = true;
            }
          }
        });
      }
    }
    plan._stripCoreFromOberkoerperList = true;
    planChanged = true;
  }
  if (!plan._defaultModeListsMigration){
    // Setzt die Standard-Übungslisten für Ganzkörper A/B und Oberkörper A/B (siehe
    // DEFAULT_PLAN.modeLists) einmalig auch bei Bestandsnutzer:innen — aber NUR für
    // Modus/Variante-Kombinationen, die noch komplett leer/unbelegt sind. Wurde für einen
    // Modus bereits (auch nur teilweise) manuell etwas eingerichtet, bleibt das unangetastet.
    if (!plan.modeLists) plan.modeLists = {};
    ['ganzkoerper', 'oberkoerper', 'unterkoerper'].forEach(mode => {
      const def = DEFAULT_PLAN.modeLists[mode];
      const stored = plan.modeLists[mode];
      const isEmpty = !stored || (typeof stored === 'object' && !Array.isArray(stored)
        && (!stored.A || !stored.A.length) && (!stored.B || !stored.B.length));
      if (isEmpty && def){
        plan.modeLists[mode] = { A: [...def.A], B: [...def.B] };
        planChanged = true;
      }
    });
    plan._defaultModeListsMigration = true;
    planChanged = true;
  }
  if (!plan._fixUnterkoerperDefaultOrder){
    // Die ursprüngliche Standard-Reihenfolge für Unterkörper A/B begann fälschlich mit den
    // Bauchübungen statt mit den Beinübungen (siehe DEFAULT_PLAN.modeLists.unterkoerper,
    // mittlerweile korrigiert). Bereits gespeicherte Listen, die noch exakt dieser alten
    // fehlerhaften Reihenfolge entsprechen (also nie manuell umsortiert wurden), werden
    // einmalig auf die neue Reihenfolge (Beine, dann Rücken, dann Bauch) korrigiert. Eine
    // tatsächlich per Drag&Drop selbst angepasste Liste weicht von der alten Standardliste ab
    // und bleibt dadurch unangetastet.
    const oldDefault = {
      A: ['e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12', 'e13', 'e14'],
      B: ['e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12', 'e13', 'e20']
    };
    const sameArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
    const stored = plan.modeLists && plan.modeLists.unterkoerper;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)){
      ['A', 'B'].forEach(k => {
        if (sameArray(stored[k], oldDefault[k])){
          stored[k] = [...DEFAULT_PLAN.modeLists.unterkoerper[k]];
          planChanged = true;
        }
      });
    }
    plan._fixUnterkoerperDefaultOrder = true;
    planChanged = true;
  }
  if (!plan._bodyPartMigration){
    // Trägt bei bereits vorhandenen Standardübungen (Abgleich über id mit
    // DEFAULT_PLAN.exercises) nachträglich die Push/Pull/Legs-Zuordnung (ex.bodyPart) nach,
    // falls sie dort noch fehlt — betrifft alle, die ihren Plan bereits vor Einführung dieses
    // Felds gespeichert hatten. Selbst angelegte Übungen ohne passende Standard-id bleiben
    // unangetastet (weiterhin "keine Zuordnung", manuell im Editor setzbar).
    const defaultBodyParts = {};
    DEFAULT_PLAN.exercises.forEach(e => { defaultBodyParts[e.id] = e.bodyPart; });
    plan.exercises.forEach(ex => {
      if (!ex.bodyPart && defaultBodyParts[ex.id]){
        ex.bodyPart = defaultBodyParts[ex.id];
        planChanged = true;
      }
    });
    plan._bodyPartMigration = true;
    planChanged = true;
  }
  if (!plan._fixAbdAddImages){
    // Die Standardbilder für "Abduktoren" (e12) und "Adduktoren" (e13) waren ursprünglich
    // vertauscht (das bei e12 hinterlegte Foto zeigte tatsächlich die Adduktoren-Übung und
    // umgekehrt) — mittlerweile in DEFAULT_PLAN korrigiert. Bereits gespeicherte Übungen, die
    // noch exakt das alte (falsche) Bild tragen, also nie manuell durch ein eigenes Foto
    // ersetzt wurden, werden hier einmalig auf das jeweils richtige Bild umgestellt. Ein
    // selbst hochgeladenes Bild weicht vom alten alten Bild ab und bleibt unangetastet.
    const OLD_E12_IMG = 'data:image/jpeg;base64,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';
    const OLD_E13_IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAwICQsJCAwLCgsODQwOEh4UEhEREiUbHBYeLCcuLisnKyoxN0Y7MTRCNCorPVM+QkhKTk9OLztWXFVMW0ZNTkv/2wBDAQ0ODhIQEiQUFCRLMisyS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0v/wAARCADcANwDASIAAhEBAxEB/8QAGwAAAQUBAQAAAAAAAAAAAAAAAAMEBQYHAQL/xABFEAABAwIDBAYGBwcDAwUAAAABAAIDBBEFEiEGMUFREyJhcZGxFDJygaHBBxUzQlJisiM1Y3OC0eEmNkMWJVM0VGSiwv/EABgBAQEBAQEAAAAAAAAAAAAAAAABAwIE/8QAHhEBAQACAwEBAQEAAAAAAAAAAAECEQMhMRJBE1H/2gAMAwEAAhEDEQA/ANUQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhVfGcVfPXPpIXlsUZyut948Vzll8za4zdWTp4s2XpWX5ZglFS7WUhg2KOjqmUsri5khs2/3Ss8eTd1Xd49RZEIQtmYQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAQhCAWa1rDTYrK+KpLmGRxv71pSoGOdFT43Vh5ja3OHZbAXuAs+Txpx+lPSGujBDsxtrZeMMa+oxamDL3E9/wCkakqO9OZMXRUwFrau4BTOxz2RYgTM8lz48kZcd2u5ZYztplel2QhC9LzhCEIBcc5rGlziGtGpJO5dUfjkE1Rh744Gl7y4aDiLoG9dtHR0rXGPNM4fh0HioSm2xqq+qdDRwUziNbPeRcd5sFUsVxySISMpqeOQNuC50wHZuVaixepgmzNijBHMkoNeO1YhOWsa2B3sFw8QUtHtTSP3VlJ/VnHyWPyY5VykAsjueQKndlNoK+GpdGG05ab3zxZtwvzQaVFjscv2c9E7umI+S9S49FT26Z0DuyKXM7wsm0T/AK02X9MnZE2Z0Tn3YwCxF93gqdtFWTzMpWveMuW+jQPJBqDHiRjXtN2uAIPYvSRpGdHSQsvfLG0X9yWQCEIQCEIQCEIQCEIQCEIQCiNpGYf9X1D62KB8nRODM7QXXtpbjvTjG611Dh8krPtDZrO88VRagmpJMri97t7nG5WeeeuneOO+0fRMcYT0TNHi19wAUlTsbTgOc67nbl7iiAY1jBYAWATPFJ2w1tNDfUsKw9beJ2mq54rOile33qx4TiQrmOY+wmZvA4jmqfQTB8WU7+ClNnSTi9gdBG6/wXWFsunOclm1sQhC9LAIQi6DBa9v/qL/AIneZULob27FO4g27ajvd5lQbrtmPJ2vcg7ALzsHaFP4GMlZ4+ShoB+1Z3hTWGdWrB7fkg0zA3D/AKJFzuhkHxKpGNOuym9hPBQYtU7GTdE8y05mzCFpsco368geCr5jqI4o+mBa3LoC69kG2UxvTRHmweSVSFEb0cB5xt8gl0AhcQg6hcQg6hcXUAhCEAhCEFR2vrM1ZFTA9WNuYjtP+PNQDXgi/NPNtYailxR9Q5hdFUWyPA0BA3Ht0UCJJWWAaXDmDuXmyndb4+J1s8dPAZHncqjiL6irxEVFy0Nd1Qp5gvGHz6vPqtUXN65PIpit7WDDYs0N72cFIUMpw6rjnvfXr9oO9MsNcC1oHEJ5O20d+S43qrrpaqXF8PrDlp6yCR34Q8ZvDenqx3DIBV7SU8Vrh1QB7gbrYl7HmC4uoO5BhleAWz33Xd5lQMg/aO7QFYq31ZyfzeZUDM0XNt+XreJQcpwelaATfMLKbodJI1Cw3EsbhvuL9imaM2exBo2zjr7FVHYJAqPXm8UXcVcdmn/6Nrh+Ev8AJUurN4mdyDYcP1oKY/wmeQThNcLN8NpD/BZ+kJ0gEIQgEIQgEIQgEIQgEIQgre3TXHC4XNAs2YXPLQqkNDQMxcSR4LQ9rWF+z9VYAkBpF+HWCzaNrrHMRbkFjyetcPEtLII6RromtzkbzqoOrYYSGk5nO1KmKAdLTusNdwJCicW6r3Am7hpdcR3T3Cq3JlDjq0qdqpQ6mzN4qgYfVk42yO9mdGRbmVejGfRGAHeVMpol2j9hqfptpmvIuIg9/wAvmtQVG+j2ly1+IzEWyWYPeSfkryvVGFC4dyEHcURiVaOrNpf1lAyaP13ZRbuVgq/+W35lBSNu4W/B4alB5hs2Vt9W5h7ypal9ZvYouAZntbxB0UnS3zNB5fNBeNnZLbKYm2+4qp1GsbVP4JLlwPEGc7KAm1YEGvYQb4VRH+Az9ITxMcDN8GoT/AZ5J6g6hcQg6hcSVVUw0kD56mVkUTBdz3mwCBZCrp23wMOINW4Afe6J1k5i2qwWW2XEYQTwdcFBMoTE4vQBgcKphB3ZdU1k2io2GzWyP7hbzXNykX5qYQq+/aiMerSvPe8JM7UyW6uHkntlA+Sn9MV+MnvbaubT4Sab79Uco7ALElUBjTE0kuBB4W3KUxmsxTG6hj5sPjgEQytAqLg679yjqqjrKaB0rYY5CNS1rySPhqs8rutMZqJXDWAQOA3jioHaAGMk8eKbDaGuYwtj6Fl/yX+aYVeL1M9xUCN9xvDbJMKXOGmHPAxqGR24PAWlxuvR68Fl1F+0xBgGnXv4arTaOUTYcHcbC6vLPE46sOxkOSjqprayzn4ABWFRmzkXQ4NTAixcC8+8kqSWs8Z311cduK6uO9U9yqMUqhcSjndQcgPSE2tca9qnKm1pL7tbqJmJzNB1s2wI46oE2MuQQbG+qkaXV47tPFR8bXNc0tF9VI0l+k1/D80E9hsmXD6tvMKNkHVTykdlgmHMJq5uiDVNnDmwGgP8BnkpJRezBvs/h/8AJapRAIQhAKl/ShO6PC6KFps2Wou7tytJHxt4K6KifSsbUWHfz3foKDOqh92ZRvJA+Kt2GRxRRsZCxrXAdZ5bqfeqrQM6bEYgRdrDnPu3fFWQGbKTCAL8VlyX8aYT9PcQrvRKZ0gyl9wBfXeo2XFqutiyukyRN0yxjLc9p3qIxCWQ1RjkdchtzbvTqjF4D7XyC6wkkTK9lmzzM9WaUf1lKsr6pj2np3kA6h1jdIled1l1ZElq0RSiVoLWk3Q+4TGmxDLEAGrrq3NvFl5LHoVzHqNtPV5owAyUZgOR4qEnbZWTaOQGGA8cx8lWZn3Xqwu8Xnymq94W0fWTfZJWgYT+7n9yoWFMzVjZCbCMH3kq94UbYa4niVzy+R1x+tGpYxHSwsG5rGj4JVeITeJhG4tHkva0ZuLjvVPcvS8v9U9yDFZ/+T3qJlaM4sdC2/dqpabe+3MqMlN3jq5SB4lAlGcsgLxcclIUOso7W/NMo3C4uL6+KcYY/NiTx/C//SCbh0Y8cwkyNEqwb1wt0RWkbLf7eoP5Q+alVFbK/wC36H+X8ypZEcQuoQcVD+lrSgw0/wAd36Cr6oLbHADtDg5po3tjnjeJInO3XGlj2EEoMmwNl3SzHmGj5qf6cRUxPGyi6WnNFCIHlpewkOLTcE31sV4rqrKzLfXgFhe62nUMJX9JWyneWMA8SpCKUw0hcN2c38AlMU2XrsAibUVssDzVHqiIk2trrcDmm8n7tcfznyC2nUZX12lkqq1pkghDow6184Ccljxq8ZC0XIvdd2VF8Md/McnVSyzXHmwqhtBi1OG26dhXqbFomtuyOSU8o2EqFpo7RNO7TdZXLBdj6jE8Lp62OsijEzScjoibakb79iz/AJx191R8SrK2tkB9CmaxvqiyTwuiFbXxw1sxoISetLJG53uAA3960Cq2KxaAPMLqecNbcBtwXG+4ApvW7GYhS0UtbUz0oihjMj2tc8OAAuQNN60k05t2rOEUjDWyRdZjOmdk6QWcWjd4hXaRrYqJkegIG4KoVefFa6KriaKfRgyi/VA43udVZKRuI4lKI4KVz2ghhk3NaLbyseSW1phZI0Wmdmp4nc2A/BKKNwpuJRvdHWiEwtaAws3qTWzILy/1HdxXVx/qO7igxSU6u96YVAtkuQTlOo5XT6Q6u96YzMGYFo0I4oEgWgi++6WwUD6zeCLExnzCQI1tdLYEP+6uH8M+YQWEDVesui92XoN0RV+2V/2/R9jT+oqWURsqb4DS9mYf/YqWRHULiEHVGbR131fg9TMDaQtyR+0dB/f3KSJDQS42A3krP9scYjr66OlgeHU8AzFw3Of/AI/uucrqOpN1WKgthizOKhHPdLIXnsI8U+xN/TUssokaA1wYGX6xvfW3L+4SHRa6fhCmEXK/jQ9vmek+h04PqxF3vuP7KhVMxjidRljnPc4Zcovc7reSvu0D+nxWW5u2GNkfwufNROylAJ8TxHFn2EdBE7onHcJCDr7h5qTLvRZ1tG7LxOjw1zHesJHXsrJh+HU9VhmJ1E7C59PA4x9bQHKdbcdyhNnruo5HP1c6Qknt0SONY3NhjRSx1D4WTgl4aLh4sW2PZqtHKKp2D0dnshazsYLbMUA/If1FYw2rkAZ0YBYBbfvWm7H7UYfHhFLRVDnwyxMs5zm3ZvJ3hEXRV7b6fodlawA9abLEP6nD5XUpWYth9CYRV1kEJn+yzvAz7t3iFWfpLmPoNBSjfNUZj3NH+UFUw+DK0abgtA2Qh6PDpH29eTyCptJHZgWgYDF0WE044ubmPvN0VIIQhEC8yeo7uK9LzJ9m7uKDE373d5TWqc/OA4AWCcv3lIVOWzAw3te5QMyNbcUtgH77cOHQu8wvAF9SUrgAtjnfG75ILRZew3RdIXsDRFXPZI3wKDsc/wDUVMKrYbPUU+xVRPSECeJsr2aX3OJ3LM8R2nxSvB6esmcw/dzWHgNERpO0Upo55KmDH2QOOvo8smncLXt7wquNsKmRtnV8zDxF7fEKkskmncbAntCcRUksjg0MzOPDefBc3HbqVaKjHPS2Fk1c+QHg55I8FHSVd2OY2N2c6BxGll4pdisbr5GmOjcyMj15Bkt4qdbsfjFFCYpaNtUA0u6SGcX7rHiubjp3MlMd0TnuMklhfcNSpADqtLRfcAOadMwvDKsMja+WCUOObMRc9nIKXioqSgaJBdxGgc83S5yJMLSuI1ThTSzSaSTOLj2XVs2Uw8UWyzBIwZ6hjppARvzDQeFlnuKVzJo3MF3EnRo3lWBm1VfUULY4rxOc3L0YiALeFlOOfpn/AIitmDmw4n87kw2mhjlqYxIdSzqj3p/hjWYTCIHvzkm+VupF+aabQ29OpyToY/mtXCJbgVc+lZLHTVAhIzCQxnJbnfclaXD65sTWxyMIvwkB+atFD9fv2dl6GN7aBsDwHOeAHMsb2G/mq7s/Cx4jsBpIPNESmIYJjGKVkUsjp6t0LycrxpGdNAOA0Gik9rJq2euwwYhE2N4jkIA46jW3BaPbf2qh7ei+PYf2U7/1BAxhHU9y0akaG0sLRuDGj4LOovV9y0an+wj9keSKUQhCIF5l+zf7JXpeJfsn+yUGJu3mySqmZS1xbYuB0SpNybJKpa7RxdmBvqga8TYaJTAf382/4HJN29KYCf8Av8Y5tfbwQW+y9gaFFl0+oe5FWnY8Nl2fY1wu1z5ARzBJVdj+jcyPkbPVxsgJIaGMJcW30ve1lYdh7/UTQeErx8VPois0GwmC0bWh0L5yP/I/TwFlPUtDS0bctNTxQj8jAEq6WNvrPaO8hJPr6Rnr1ULe+QIHCFC4vtRhuF0EtUZ2TmMC0cbgXOJNrKLw76RcHrXsjcyqildoG9FnuezLdAx+kfBKqZtPU4PhvTTOe70h8TesRbS448dd+iokBxt0/oppJmPAu4SsLA0cyTuC1XFdp4oWllMM0nEnTL38vPsVSqcQqcRmOUmZ1/WPqN7ualkqy1HU9BFSvjqaiUOmZq1zbhrT+Ubz3myeRtnqb9CDFGd73es5KtpYoP21U/pH83bgndHUUkrg6qdKIhujibq7vN9B8VZNFNIvRqWYQx2dLa73E7h2qGxiUT4m0wkSdHHl6uut7qyVMezlFhlXVU8czqljXOZDMSS93AXsdPeqPNtLWSykw2po7D9nG0aHjrvQWaKoxqpw1tEyaZkIjLBGwBtweB4nemuzWBSOxKGniq2iTpLvaDcDLqQTz0UzsbtvH6CKSopHPqIdOkZYF7eBN95ve6bbKV0cGLSVj2OLTPKbDfqSiNQVC28P+oKEf/Gd+pWUbSUZ3smH9IPzVH21xenqdoaOSIuyNpi1xc0ixzXQKxer7lpEP2LPZHkswpZ2TMvG9rh2FahF9mz2QivSEIRAvE32L/ZPku5knO8dDJ7J8kGKAi51XisceoC3KBewXpgLn2aC4ngF6xGCVjIy9pt+I8SgY8b+5dwJ3+oYO54+C8kowPTH6ftzeRQXhd+6V5XbopGCrnpw+GOeRjQ6+VryBuC9Gokf60r3d7iqrtBXSU+Lua1kZDWBzXObcgkf4Uc7HsTdunDe5gRF3IB3rmQcvgqOcSxSXdUzH2f8LmXFZvv1bve5BdpY2PaWSNaWneHDQqDNT9U4wW0YbHFKxrXhml79vDXkoT6rxCT12yn2j/dKw4VVxfc433goLlHROfZ1U4Bo3Rt3JKtxuiw8dGJGNI0sOHgo3EqrEawGOBphj3F17Od/ZQ/1JOWZXFgbe+rxvRUo/H6OZ/WmueZabLyMZgY79nOO7mo2PB2wTRukdG9pcAWNfqbqOfJJTzyQscGta8gEtBI152RFuhxRtSwi2vPgVGSQ3mlysNjyCiOnmI0rZB3C3kkXSTudYzyvHPMUF1wu8MYNmtNgCXaJlS1r8KgdPMwPb05uGngSdyqxiDj1zJ4XT5rwcJFO0HN0gO7hdBo1BJT1lrVdJHf/AMk7AfC6hNryyjxilhgminzwZnSN1t1iLb1EMhlqGgSZXAAb2grkmFufUNebus22Vg6xKCXw7qt7StcZ6je4LI8LwfFSAI6YRs4Gea58AFqVPUZmNzCxtqgeISbX3Xu6Bs6RISyXa4HcRYr29NZQUFJxJkeESuiijAbvaQN4URUzdMLPAcORVyxvDRW05FrPbq09qp1RRzxEh8Th7kETPEY3X1Lb8tyQwc2x+lP5iPgVIvaRv0TKjaG45THjnPkUFzzILkiHoL9EVC4u9ra4k0zZSWjrFoPmmzaiUepAxncGj5KXkw99bMXt3AWS8Wz8jrXKIhPSKo8bf1n5Lmad29w+J+as8ezfMp1Hsyzigp1pfx+DAu5JXf8AJIrwzZ2EfdThmAxD7gQZ8aeV27pD7ykpMPncNGv8StNZgsI+4EszCYh9wIMeGEVsMvSta5xG643JMUjGkidlQJL6gRE/FbSMLi/AEo3DI/whBjMdE1+kVJWSnhZlvkpCDAah9rYbJ/VItabh8Y+6Eo2iYPuhBmEWzNY/1aKJvtOJTyHZPEHEX9GjHZHdaQ2laOCUEAHBBSKXZB2hqah7/wArdAp6iwSCmADIwLcTvU4IgvQYEDKOkDeAThkQCWDV3Kg8tbZegF6siyBsWXSbor8E6IXCEDF9OCNRdR9ThEUxJLSD2KdyhcLRyQU+o2ca4HK4+8KGr8Blo2mojhdKWG9o2XctGLG8lwxt5IMr9Kf/AO2q78vR3/2SsYrp9IMMrX35xZR4lagI28l0Rt5IKhs9hVY2GR1bAIS512tzZja3GysMdCG8FIho5LoaEDRtMBwXsQAcE6sEWQN+hHJd6EckvZdQIdEOS9CMckqiyBPo10MSlkIPGTsRlXtCDzZdsvSEHLIXUIBCEIBCEIP/2Q==';
    const exE12 = plan.exercises.find(e => e.id === 'e12');
    const exE13 = plan.exercises.find(e => e.id === 'e13');
    const defE12 = DEFAULT_PLAN.exercises.find(e => e.id === 'e12');
    const defE13 = DEFAULT_PLAN.exercises.find(e => e.id === 'e13');
    if (exE12 && exE12.imageData === OLD_E12_IMG && defE12){
      exE12.imageData = defE12.imageData;
      planChanged = true;
    }
    if (exE13 && exE13.imageData === OLD_E13_IMG && defE13){
      exE13.imageData = defE13.imageData;
      planChanged = true;
    }
    plan._fixAbdAddImages = true;
    planChanged = true;
  }
  if (!plan._addSeithebenImage){
    // "Seitheben" (e19) hatte ursprünglich noch gar kein Bild hinterlegt — trägt es hier
    // einmalig nach, aber nur, falls bislang wirklich keines gesetzt wurde (ein zwischenzeitlich
    // selbst hochgeladenes Bild bleibt unangetastet).
    const exE19 = plan.exercises.find(e => e.id === 'e19');
    const defE19 = DEFAULT_PLAN.exercises.find(e => e.id === 'e19');
    if (exE19 && !exE19.imageData && defE19 && defE19.imageData){
      exE19.imageData = defE19.imageData;
      planChanged = true;
    }
    plan._addSeithebenImage = true;
    planChanged = true;
  }
  if (planChanged) await saveJSON('plan', plan);

  active = await loadJSON('activeSession', null);
  if (active){
    restState = null;
    addExerciseOpen = false;
    replaceView('active');
    renderActive();
    timerHandle = setInterval(updateTimerDisplay, 1000);
  } else {
    // Bei einem versehentlichen Browser-Reload (oder erneutem Öffnen desselben Tabs) auf der
    // zuletzt offenen Seite bleiben statt immer zur Startseite zu springen — history.state
    // überlebt einen Reload für den aktuellen Verlaufseintrag (siehe pushView()/replaceView()
    // sowie renderViewByState()). War zuletzt nur ein Popup offen ("__overlay__") oder gibt
    // es aus irgendeinem Grund keinen brauchbaren State, bleibt es beim gewohnten Verhalten
    // (Startseite) — ein einzelnes Popup lässt sich beim Neuladen ohnehin nicht sinnvoll
    // rekonstruieren.
    const restoredState = history.state;
    if (restoredState && restoredState.view){
      renderViewByState(restoredState);
      updateMiniPlayer();
    } else {
      replaceView('home');
      renderHome();
    }
    if (plan.bodyWeight === null || plan.bodyWeight === undefined) openBodyWeightPrompt();
  }
}

// Zeigt beim allerersten Öffnen (bzw. solange kein Körpergewicht hinterlegt ist) einmalig ein
// Popup zum Eintragen an — Körpergewicht wird für die Volumen-Berechnung bei unterstützten
// Übungen (z. B. Klimmzugmaschine) und Eigenkörpergewicht-Übungen gebraucht (effectiveSetWeight()),
// ohne es zeigt die App sonst nur das rohe Gerätegewicht statt des tatsächlich bewegten Gewichts.
// Erscheint nur auf der Startseite direkt nach dem Laden, nicht bei jedem View-Wechsel.
// Ersetzt den nativen prompt() für den Reset-Bestätigungscode durch ein eigenes Popup mit
// echtem Zahlenfeld (inputmode="numeric" + type="tel", damit die numerische Tastatur direkt
// aufgeht statt der vollen Buchstabentastatur) — prompt() bietet dafür keine Kontrolle über
// den Tastaturtyp. onConfirm wird nur aufgerufen, wenn der eingegebene Code exakt "0000" ist.
// Popup für eine frei eingegebene Pausendauer — per Long-Press auf einen der drei
// Pausen-Buttons erreichbar (siehe wireRestButtonLongPress() in renderActive()). Mit dem
// grünen Haken bestätigen startet die Pause direkt mit der eingegebenen Sekundenzahl,
// genau wie ein Tap auf einen der festen 30s/60s/90s-Buttons.
function openCustomRestPrompt(){
  const existing = document.getElementById('customRestOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'customRestOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Eigene Pause</div>
        <button class="add-exercise-modal-close" id="customRestClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <label class="justify-text" style="display:block; font-size:13px; color:var(--muted); margin-bottom:10px;">
          Pausendauer in Sekunden eingeben.
        </label>
        <input type="number" inputmode="numeric" id="customRestSeconds" min="1" placeholder="z. B. 45" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:18px; text-align:center;">
      </div>
      <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; justify-content:center;">
        <button class="perf-suggest-btn perf-suggest-btn-confirm" id="customRestSubmit" type="button" aria-label="Pause starten" style="width:56px; height:44px; font-size:20px;">✓</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('customRestOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };

  const input = document.getElementById('customRestSeconds');
  input.focus();
  let submitted = false;
  const submit = () => {
    if (submitted) return; // verhindert doppeltes Starten, falls Enter/change kurz hintereinander feuern
    const seconds = Math.round(Number(input.value));
    if (!input.value || isNaN(seconds) || seconds <= 0){
      alert('Bitte eine gültige Anzahl Sekunden eingeben.');
      return;
    }
    submitted = true;
    close();
    startRest(seconds);
  };
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter'){
      ev.preventDefault();
      input.blur(); // löst "change" aus, siehe unten
    }
  };
  // Bestätigt man die Eingabe direkt im Zahlen-Rad/Ziffernblock über deren eigenen Haken
  // (bzw. verlässt das Feld nach Eingabe über die normale Tastatur), startet die Pause sofort
  // — ganz ohne zusätzliche Bestätigung über den Haken hier im Popup. Sowohl das Scroll-Rad
  // als auch der Ziffernblock lösen beim Bestätigen ein natives "change"-Event auf dem Feld
  // aus (siehe openScrollWheelForInput()/openKeypadForInput()), ebenso ein normaler Blur.
  input.addEventListener('change', () => {
    if (input.value) submit();
  });
  document.getElementById('customRestSubmit').onclick = submit;
  document.getElementById('customRestClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
}

// Eigene Dauer für den STANDARD-Pausetimer (Trainingstools-Popup, 4. Feld neben Aus/30/60/
// 90) — im Unterschied zu openCustomRestPrompt() oben wird hier KEINE Pause gestartet,
// sondern nur plan.defaultRestSeconds dauerhaft gesetzt (die Pause läuft dann automatisch
// beim nächsten abgehakten Satz). type="text" statt "number", damit garantiert die normale
// Systemtastatur erscheint statt des app-eigenen Scroll-Rads/Ziffernblocks (der reagiert nur
// auf type="number", siehe isSystemKeyboardOnlyField()).
function openDefaultRestCustomPrompt(onSaved){
  const existing = document.getElementById('defaultRestCustomOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'defaultRestCustomOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Eigene Pausenlänge</div>
        <button class="add-exercise-modal-close" id="defaultRestCustomClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <label class="justify-text" style="display:block; font-size:13px; color:var(--muted); margin-bottom:10px;">
          Pausendauer in Sekunden eingeben.
        </label>
        <input type="text" inputmode="numeric" id="defaultRestCustomSeconds" placeholder="z. B. 45" enterkeyhint="done" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:18px; text-align:center;">
      </div>
      <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; justify-content:center;">
        <button class="perf-suggest-btn perf-suggest-btn-confirm" id="defaultRestCustomSubmit" type="button" aria-label="Speichern" style="width:56px; height:44px; font-size:20px;">✓</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('defaultRestCustomOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };

  const input = document.getElementById('defaultRestCustomSeconds');
  input.focus();
  let submitted = false;
  const submit = async () => {
    if (submitted) return;
    const seconds = Math.round(parseGermanNumber(input.value));
    if (!input.value || isNaN(seconds) || seconds <= 0){
      alert('Bitte eine gültige Anzahl Sekunden eingeben.');
      return;
    }
    submitted = true;
    plan.defaultRestSeconds = seconds;
    await saveJSON('plan', plan);
    close();
    onSaved(seconds);
  };
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter'){ ev.preventDefault(); input.blur(); }
  };
  input.addEventListener('change', () => { if (input.value) submit(); });
  document.getElementById('defaultRestCustomSubmit').onclick = submit;
  document.getElementById('defaultRestCustomClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
}


// Verfügbare Hantelscheiben (kg) für den Plattenrechner, größte zuerst — Standard-
// Olympia-Satz. Das Stangengewicht ist NICHT mehr fest verdrahtet, sondern über
// plan.barWeightKg einstellbar (siehe barWeightKg() unten) — Standard weiterhin 20kg
// (üblicher Standard für eine olympische Langhantel), aber z. B. bei einer 15kg-Frauen-
// stange oder einer festen Kurzhantel (0kg) anpassbar.
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_WEIGHT_KG_DEFAULT = 20;
function barWeightKg(){
  return Number.isFinite(plan.barWeightKg) ? plan.barWeightKg : BAR_WEIGHT_KG_DEFAULT;
}

// Berechnet, welche Scheiben PRO SEITE nötig sind, um `totalWeight` zu erreichen (inkl.
// Stange). Rein greedy (größte Scheibe zuerst, so oft wie möglich) — für Standard-
// Scheibensätze immer optimal/eindeutig. Gibt null zurück, wenn das Zielgewicht die
// Stange unterschreitet oder sich mit den vorhandenen Scheiben nicht exakt (auf 1g genau)
// erreichen lässt.
function calcPlatesPerSide(totalWeight){
  const perSide = (totalWeight - barWeightKg()) / 2;
  if (perSide < 0) return null;
  let remaining = Math.round(perSide * 100); // in Gramm×10, um Rundungsfehler zu vermeiden
  const plates = [];
  for (const size of PLATE_SIZES){
    const sizeUnits = Math.round(size * 100);
    let count = 0;
    while (remaining >= sizeUnits){
      remaining -= sizeUnits;
      count++;
    }
    if (count > 0) plates.push({ size, count });
  }
  if (remaining > 0) return { plates, remainder: remaining / 100 };
  return { plates, remainder: 0 };
}

// Deload-Schalter (siehe openTrainingToolsPrompt() → Abschnitt "Deload"): senkt für ALLE
// Übungen der laufenden Einheit die tatsächliche Anstrengung (Trainingsvolumen) um ca. 50% —
// über eine Kombination aus weniger Gewicht UND weniger Wiederholungen, damit die Wdh-Zahl in
// einem normalen Trainingsbereich bleibt (8-12) statt z. B. bei gleichbleibenden Wdh nur
// das Gewicht drastisch zu halbieren. Gewicht wird dabei immer auf 5kg-Schritte gerundet.
// WICHTIG bei unterstützten Übungen (planEx.assisted, z. B. Klimmzugmaschine): dort ist es
// GENAU UMGEKEHRT — weniger eingestelltes Gewicht bedeutet MEHR eigene Anstrengung (das
// Gerät nimmt einem weniger ab), siehe effectiveSetWeight()/computeProgressionSuggestion().
// Ein "leichteres" Deload muss das Gewicht bei assistierten Übungen daher ERHÖHEN statt
// senken, sonst würde der Schalter das Training versehentlich verschärfen statt entlasten.
// Zeitbasierte Einträge (Kardio) werden von beiden Funktionen bewusst nicht angefasst,
// siehe Aufruf im Klick-Handler unten.
// Die ECHTEN Originalwerte jedes Satzes werden einmalig in set._preDeload gesichert (beim
// allerersten Einschalten in dieser Einheit) und bleiben dort unangetastet liegen, solange
// die Einheit läuft — dadurch lässt sich der Schalter beliebig oft aus- und wieder
// einschalten, ohne dass sich die Werte bei jedem Zyklus weiter reduzieren ("Drift").
// Rundet ein Gewicht auf das für diese Übung gültige Raster: normalerweise 5kg-Schritte ab 0,
// aber pro Übung überschreibbar über planEx.weightStep/planEx.weightBase (z. B. Beinpresse:
// 8kg-Schritte ab 5kg, weil die Maschine so bestückt ist — wichtig für Warm-up, Deload UND
// Performancemodus, die alle über diese Helper laufen). mode: 'round' (kaufmännisch, Standard),
// 'floor' (abrunden — Warm-ups sollen bewusst eher leichter als zu schwer ausfallen).
function weightStepFor(planEx){ return (planEx && planEx.weightStep > 0) ? planEx.weightStep : 5; }
function weightBaseFor(planEx){ return (planEx && planEx.weightBase != null) ? planEx.weightBase : 0; }
function roundToWeightGrid(value, planEx, mode){
  const step = weightStepFor(planEx);
  const base = weightBaseFor(planEx);
  const n = (value - base) / step;
  const rounded = mode === 'floor' ? Math.floor(n) : Math.round(n);
  return base + rounded * step;
}
function applyDeloadToEntry(entry){
  const planEx = plan.exercises.find(x => x.id === entry.exerciseId);
  const assisted = !!(planEx && planEx.assisted);
  const bw = plan.bodyWeight;
  entry.sets.forEach(set => {
    if (set.weight == null || set.reps == null || set.weight === '' || set.reps === '') return;
    if (!set._preDeload) set._preDeload = { weight: set.weight, reps: set.reps };
    const origWeight = Number(set._preDeload.weight);
    const origReps = Number(set._preDeload.reps);
    const targetReps = Math.min(12, Math.max(8, Math.round(origReps)));
    let newWeight;
    if (assisted){
      // Unterstützte Übungen: weniger Anstrengung = MEHR Unterstützung = höheres
      // Gerätegewicht. Direkt am Gewicht selbst gerechnet (NICHT über Körpergewicht minus
      // Gewicht), damit das auch ohne hinterlegtes Körpergewicht korrekt funktioniert:
      // +40 %, auf das Gewicht-Raster der Übung gerundet (z. B. 20kg → 28 → 30kg bei 5kg-Schritten).
      newWeight = roundToWeightGrid(origWeight * 1.4, planEx, 'round');
      if (bw != null) newWeight = Math.min(newWeight, roundToWeightGrid(bw, planEx, 'round')); // nie über das eigene Körpergewicht hinaus, falls bekannt
    } else {
      const targetVolume = origWeight * origReps * 0.5;
      newWeight = roundToWeightGrid(targetVolume / targetReps, planEx, 'round');
      if (newWeight <= 0) newWeight = weightBaseFor(planEx) > 0 ? weightBaseFor(planEx) : weightStepFor(planEx);
    }
    set.weight = newWeight;
    set.reps = targetReps;
  });
}
// Stellt die per applyDeloadToEntry() gesicherten Originalwerte wieder her (Schalter
// ausschalten) — Sätze ohne _preDeload (z. B. erst nach dem Deload hinzugefügt) bleiben
// unberührt.
function revertDeloadFromEntry(entry){
  entry.sets.forEach(set => {
    if (set._preDeload){
      set.weight = set._preDeload.weight;
      set.reps = set._preDeload.reps;
    }
  });
}

// Berechnet das Warm-up-Gewicht für EINEN Entry — ausgelagert, damit dieselbe Logik sowohl im
// Trainingstools-Popup als auch beim automatischen Anwenden auf ALLE Übungen der Einheit
// (siehe active.warmupEnabled unten) genutzt werden kann. Gibt null zurück, wenn kein
// Warm-up möglich/sinnvoll ist (Zeit-Übung, "Ohne Gewichte", kein oder 0 kg Gewicht bekannt).
//
// Zwei verschiedene Reduktionsarten je nach Gewichtsbereich:
// - Bei NIEDRIGEN Gewichten (<= 20 kg) wäre 60% oft kein sauberer 5kg-Schritt mehr bzw. würde
//   kaum spürbar entlasten (z. B. 10kg → 6kg) — dort wird stattdessen einfach EIN 5kg-Schritt
//   abgezogen: 10kg → 5kg, 15kg → 10kg, 20kg → 15kg.
// - Bei allem darüber gilt weiterhin ~60% des Gewichts, dabei aber bewusst AUF die nächsten
//   5kg ABgerundet (nicht kaufmännisch gerundet) — ein Warm-up soll eher etwas leichter als
//   zu schwer ausfallen.
function reduceEffortForWarmup(effort, planEx){
  const step = weightStepFor(planEx);
  if (effort <= step * 4) return Math.max(0, effort - step);
  return roundToWeightGrid(effort * 0.6, planEx, 'floor');
}
function computeWarmupWeight(entry, planEx){
  if (!entry || entry.type === 'time' || (planEx && planEx.noWeight)) return null;
  let lastWeight = null;
  for (let i = entry.sets.length - 1; i >= 0; i--){
    if (entry.sets[i].weight != null && entry.sets[i].weight !== '' && !entry.sets[i].warmup){
      lastWeight = Number(entry.sets[i].weight);
      break;
    }
  }
  if (lastWeight == null && entry.target && entry.target.weight != null) lastWeight = Number(entry.target.weight);
  if (lastWeight == null || lastWeight <= 0) return null; // kein bekanntes Gewicht -> Feld soll leer bleiben statt 0
  // Bei unterstützten Übungen (z. B. Klimmzugmaschine) bedeutet ein leichterer Warm-up-Satz
  // MEHR Unterstützung, also ein HÖHERES Gerätegewicht — genau umgekehrt zu normalen
  // Übungen (siehe applyDeloadToEntry() für dieselbe Logik beim Deload-Schalter). Direkt am
  // Gewicht selbst gerechnet (NICHT über Körpergewicht minus Gewicht), damit das auch ohne
  // hinterlegtes Körpergewicht korrekt funktioniert: derselbe Betrag, um den eine normale
  // Übung reduziert würde (reduceEffortForWarmup()), wird hier stattdessen AUFGESCHLAGEN.
  if (planEx && planEx.assisted){
    const reducedAsIfNormal = reduceEffortForWarmup(lastWeight, planEx);
    const delta = lastWeight - reducedAsIfNormal;
    let newWeight = roundToWeightGrid(lastWeight + delta, planEx, 'round');
    if (plan.bodyWeight != null) newWeight = Math.min(newWeight, roundToWeightGrid(plan.bodyWeight, planEx, 'round')); // nie über das eigene Körpergewicht hinaus, falls bekannt
    return newWeight;
  }
  const reduced = reduceEffortForWarmup(lastWeight, planEx);
  return reduced > 0 ? reduced : null;
}
// Fügt (falls noch nicht vorhanden und berechenbar) einen Warm-up-Satz in einen Entry ein —
// gemeinsam genutzt vom Trainingstools-Schalter UND vom automatischen Anwenden auf neu
// hinzukommende Übungen, siehe active.warmupEnabled.
function applyWarmupToEntry(entry, planEx){
  if (!entry || entry.sets.some(s => s.warmup)) return;
  const weight = computeWarmupWeight(entry, planEx);
  if (weight == null) return;
  entry.sets.unshift({ weight, reps: entry.sets[0] ? entry.sets[0].reps : null, done: false, warmup: true, autoFilled: true });
}
function removeWarmupFromEntry(entry){
  if (!entry) return;
  entry.sets = entry.sets.filter(s => !s.warmup);
}

// Popup "Trainingstools" (Zahnrad oben rechts im laufenden Training, siehe
// renderActive()) — bündelt drei kleine, voneinander unabhängige Hilfsmittel:
// Warm-up-Satz, Standard-Pausetimer, Plattenrechner. Über Einstellungen → Training →
// "Trainingstools" komplett ausblendbar (dann erscheint auch das Zahnrad nicht mehr).
function openTrainingToolsPrompt(entry, planEx){
  const existing = document.getElementById('trainingToolsOverlay');
  if (existing) existing.remove();

  // Warm-up ist EIN Schalter für die GANZE Trainingseinheit (active.warmupEnabled), nicht mehr
  // pro Übung einzeln — einmal einschalten genügt, danach bekommt jede Übung (auch später
  // hinzugefügte) automatisch ihren Warm-up-Satz, siehe die buildEntry()-Aufrufe in
  // startSession()/"Übung hinzufügen".
  const warmupAlreadyAdded = !!active.warmupEnabled;

  const restOptions = [30, 60, 90];

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'trainingToolsOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Trainingstools</div>
        <button class="add-exercise-modal-close" id="toolsClose" aria-label="Schließen">✕</button>
      </div>
      <div class="new-exercise-modal-body" style="padding:0;">

        <div class="tools-section">
          <div class="tools-section-title-row">
            <div class="tools-section-title" style="margin-bottom:0;">Warm-up-Satz</div>
            <button class="toggle-switch ${warmupAlreadyAdded ? 'on' : ''}" id="toolsWarmupToggle" type="button" role="switch" aria-checked="${warmupAlreadyAdded}" aria-label="Warm-up-Satz">
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-section-title">Standard-Pausetimer</div>
          <div class="tools-rest-row">
            <button class="tools-rest-btn ${!plan.defaultRestSeconds ? 'is-active' : ''}" data-default-rest="">Aus</button>
            ${restOptions.map(s => `<button class="tools-rest-btn ${plan.defaultRestSeconds === s ? 'is-active' : ''}" data-default-rest="${s}">${s}s</button>`).join('')}
            <button class="tools-rest-btn ${plan.defaultRestSeconds && !restOptions.includes(plan.defaultRestSeconds) ? 'is-active' : ''}" id="toolsDefaultRestCustomBtn" type="button" aria-label="Eigene Pausenlänge">${plan.defaultRestSeconds && !restOptions.includes(plan.defaultRestSeconds) ? `${plan.defaultRestSeconds}s` : '<span class="tools-rest-btn-plus">+</span>'}</button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-section-title">Plattenrechner</div>
          <div class="plate-calc-barweight-row">
            <span class="plate-calc-barweight-label">Stange</span>
            <input type="text" inputmode="decimal" id="plateCalcBarWeightInput" enterkeyhint="done" value="${formatGermanNumber(barWeightKg())}">
            <span class="plate-calc-barweight-unit">kg</span>
          </div>
          <div class="plate-calc-input-row">
            <input type="text" inputmode="decimal" id="plateCalcInput" placeholder="z. B. 100" enterkeyhint="done">
            <button class="btn btn-ghost btn-small" id="plateCalcSubmit">Berechnen</button>
          </div>
          <div id="plateCalcResult" style="margin-top:10px;"></div>
        </div>

        <div class="tools-section">
          <div class="tools-section-title-row">
            <div class="tools-section-title" style="margin-bottom:0;">Performancemodus</div>
            <button class="toggle-switch ${plan.performanceMode ? 'on' : ''}" id="toolsPerfModeToggle" type="button" role="switch" aria-checked="${!!plan.performanceMode}" aria-label="Performancemodus">
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-section-title-row">
            <div class="tools-section-title-group">
              <span class="tools-section-title" style="margin-bottom:0;">Deload</span>
              <span class="tools-section-title-hint">Entlastung zur Erholung</span>
            </div>
            <button class="toggle-switch ${active.deloadActive ? 'on' : ''}" id="toolsDeloadToggle" type="button" role="switch" aria-checked="${!!active.deloadActive}" aria-label="Deload">
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-section-title-row">
            <div class="tools-section-title-group">
              <span class="tools-section-title" style="margin-bottom:0;">Supersätze</span>
              <span class="tools-section-title-hint">Kacheln per Ziehen &amp; Halten verbinden</span>
            </div>
            <button class="toggle-switch ${plan.supersetsEnabled !== false ? 'on' : ''}" id="toolsSupersetsToggle" type="button" role="switch" aria-checked="${plan.supersetsEnabled !== false}" aria-label="Supersätze">
              <span class="toggle-knob"></span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('trainingToolsOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };

  document.getElementById('toolsClose').onclick = close;
  overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

  const warmupToggleEl = document.getElementById('toolsWarmupToggle');
  if (warmupToggleEl) warmupToggleEl.onclick = () => {
    // Schalter gilt für die GANZE Trainingseinheit (active.warmupEnabled), nicht mehr nur für
    // die aktuell geöffnete Übung: einschalten fügt bei ALLEN Übungen mit Gewicht einen
    // Warm-up-Satz ein (60% des letzten Gewichts bzw. umgekehrt bei assistierten Übungen,
    // siehe computeWarmupWeight()), ausschalten entfernt sie wieder überall. Neu während der
    // Einheit hinzugefügte Übungen bekommen ihren Warm-up-Satz automatisch mit dazu, siehe die
    // buildEntry()-Aufrufe in startSession()/"Übung hinzufügen".
    active.warmupEnabled = !active.warmupEnabled;
    if (active.warmupEnabled){
      active.entries.forEach(e => applyWarmupToEntry(e, plan.exercises.find(x => x.id === e.exerciseId)));
    } else {
      active.entries.forEach(e => removeWarmupFromEntry(e));
    }
    close();
    renderActive();
  };

  overlay.querySelectorAll('[data-default-rest]').forEach(btn => {
    btn.onclick = async () => {
      const val = btn.dataset.defaultRest;
      plan.defaultRestSeconds = val ? Number(val) : null;
      await saveJSON('plan', plan);
      overlay.querySelectorAll('[data-default-rest]').forEach(b => b.classList.toggle('is-active', b === btn));
      const customBtnEl = document.getElementById('toolsDefaultRestCustomBtn');
      if (customBtnEl){
        customBtnEl.classList.remove('is-active');
        customBtnEl.innerHTML = '<span class="tools-rest-btn-plus">+</span>';
      }
    };
  });

  const defaultRestCustomBtnEl = document.getElementById('toolsDefaultRestCustomBtn');
  if (defaultRestCustomBtnEl) defaultRestCustomBtnEl.onclick = () => {
    openDefaultRestCustomPrompt((seconds) => {
      defaultRestCustomBtnEl.textContent = `${seconds}s`;
      defaultRestCustomBtnEl.classList.add('is-active');
      overlay.querySelectorAll('[data-default-rest]').forEach(b => b.classList.remove('is-active'));
    });
  };

  const toolsPerfModeToggleEl = document.getElementById('toolsPerfModeToggle');
  if (toolsPerfModeToggleEl) toolsPerfModeToggleEl.onclick = async () => {
    // Dieselbe plan.performanceMode-Einstellung wie in den Einstellungen selbst (siehe
    // renderSettings() → perfModeToggle) — kein eigener Zustand, daher automatisch immer
    // synchron mit dem dortigen Schalter, egal wo zuletzt umgeschaltet wurde.
    plan.performanceMode = !plan.performanceMode;
    await saveJSON('plan', plan);
    toolsPerfModeToggleEl.classList.toggle('on', plan.performanceMode);
    toolsPerfModeToggleEl.setAttribute('aria-checked', String(!!plan.performanceMode));
  };

  const toolsDeloadToggleEl = document.getElementById('toolsDeloadToggle');
  if (toolsDeloadToggleEl) toolsDeloadToggleEl.onclick = () => {
    active.deloadActive = !active.deloadActive;
    // Ein-/Ausschalten wendet die Volumen-Reduzierung jetzt jedes Mal an bzw. macht sie
    // rückgängig (statt nur einmalig zu wirken) — applyDeloadToEntry()/revertDeloadFromEntry()
    // rechnen dabei immer von den in set._preDeload gesicherten ECHTEN Originalwerten aus,
    // beliebig oft wiederholbar ohne Drift. Gilt bewusst NUR für diese laufende Einheit:
    // `active` wird bei jedem neuen Trainingsstart komplett neu aufgebaut (siehe
    // startSession()), wodurch deloadActive danach automatisch wieder fehlt (= aus) und
    // auch die _preDeload-Marker der (dann verworfenen) Sätze mit verschwinden.
    active.entries.forEach(e => {
      if (e.type === 'time') return;
      if (active.deloadActive) applyDeloadToEntry(e); else revertDeloadFromEntry(e);
    });
    close();
    renderActive();
  };

  const toolsSupersetsToggleEl = document.getElementById('toolsSupersetsToggle');
  if (toolsSupersetsToggleEl) toolsSupersetsToggleEl.onclick = async () => {
    // Schaltet NUR die Möglichkeit ab, im laufenden Training per Ziehen&Halten NEUE Supersätze
    // zu bilden (siehe wireThumbDrag() → canCreateSuperset / supersetsFeatureEnabled()) sowie
    // das automatische Wiederherstellen gespeicherter Kopplungen beim nächsten Trainingsstart
    // (siehe applyStoredSupersetsToActive()). Bereits gespeicherte Kopplungen in
    // plan.supersetPairs werden dabei NICHT gelöscht — beim Wiedereinschalten greifen sie
    // einfach wieder wie gewohnt.
    plan.supersetsEnabled = plan.supersetsEnabled === false ? true : false;
    await saveJSON('plan', plan);
    const isOn = plan.supersetsEnabled !== false;
    toolsSupersetsToggleEl.classList.toggle('on', isOn);
    toolsSupersetsToggleEl.setAttribute('aria-checked', String(isOn));
  };

  const barWeightInputEl = document.getElementById('plateCalcBarWeightInput');
  if (barWeightInputEl){
    const saveBarWeight = async () => {
      const val = parseGermanNumber(barWeightInputEl.value);
      plan.barWeightKg = (barWeightInputEl.value && !isNaN(val) && val >= 0) ? val : BAR_WEIGHT_KG_DEFAULT;
      await saveJSON('plan', plan);
      barWeightInputEl.value = formatGermanNumber(barWeightKg());
    };
    barWeightInputEl.onkeydown = (ev) => {
      if (ev.key === 'Enter'){ ev.preventDefault(); barWeightInputEl.blur(); }
    };
    barWeightInputEl.onchange = saveBarWeight;
  }

  const plateInput = document.getElementById('plateCalcInput');
  const plateResult = document.getElementById('plateCalcResult');
  if (plateInput && plateResult){
    const runPlateCalc = () => {
      const weight = parseGermanNumber(plateInput.value);
      if (!plateInput.value || isNaN(weight) || weight <= 0){
        plateResult.innerHTML = `<div class="tools-section-hint">Bitte ein gültiges Gewicht eingeben.</div>`;
        return;
      }
      const result = calcPlatesPerSide(weight);
      if (!result || !result.plates.length){
        plateResult.innerHTML = `<div class="tools-section-hint">Gewicht liegt unter dem Stangengewicht (${formatGermanNumber(barWeightKg())}kg) oder lässt sich nicht abbilden.</div>`;
        return;
      }
      plateResult.innerHTML = `
        <div class="plate-result-side">Pro Seite:</div>
        ${result.plates.map(p => `
          <div class="plate-result-row">
            <span>${formatGermanNumber(p.size)} kg</span>
            <span>× ${p.count}</span>
          </div>
        `).join('')}
        ${result.remainder > 0 ? `<div class="tools-section-hint" style="margin-top:8px; margin-bottom:0;">Rest ${formatGermanNumber(result.remainder)} kg pro Seite lässt sich mit den verfügbaren Scheiben nicht exakt abbilden.</div>` : ''}
      `;
    };
    document.getElementById('plateCalcSubmit').onclick = runPlateCalc;
    plateInput.onkeydown = (ev) => {
      if (ev.key === 'Enter'){ ev.preventDefault(); plateInput.blur(); runPlateCalc(); }
    };
  }
}

function openResetConfirmPrompt(onConfirm){
  const existing = document.getElementById('resetConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'add-exercise-overlay centered-overlay';
  overlay.id = 'resetConfirmOverlay';
  overlay.innerHTML = `
    <div class="add-exercise-modal" style="max-height:none;">
      <div class="add-exercise-modal-header">
        <div class="add-exercise-modal-title">Wirklich zurücksetzen?</div>
        <button class="add-exercise-modal-close" id="resetConfirmClose" aria-label="Abbrechen">✕</button>
      </div>
      <div class="new-exercise-modal-body">
        <div style="display:flex; justify-content:center; margin-bottom:14px;">
          <span style="background:var(--surface-2); color:var(--text); padding:6px 14px; border-radius:8px; font-family:monospace; font-size:16px; letter-spacing:4px;">0000</span>
        </div>
        <input type="tel" inputmode="numeric" id="resetConfirmInput" placeholder="Code" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:16px; letter-spacing:4px; text-align:center;">
      </div>
      <div class="add-exercise-modal-header" style="border-top:1px solid var(--border); border-bottom:none; gap:10px;">
        <button class="btn btn-ghost" id="resetConfirmCancel" style="flex:1;">Abbrechen</button>
        <button class="btn btn-danger" id="resetConfirmSubmit" style="flex:1;">Zurücksetzen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  pushOverlayState(remove);

  function remove(){ const el = document.getElementById('resetConfirmOverlay'); if (el) el.remove(); }
  const close = () => { popOverlayStateIfOpen(); remove(); };
  const input = document.getElementById('resetConfirmInput');
  input.focus();
  const submit = () => {
    if (input.value !== '0000'){
      alert('Falscher Code. Zurücksetzen abgebrochen.');
      close();
      return;
    }
    close();
    onConfirm();
  };
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter'){
      ev.preventDefault();
      input.blur();
      submit();
    }
  };
  document.getElementById('resetConfirmSubmit').onclick = submit;
  document.getElementById('resetConfirmCancel').onclick = close;
  document.getElementById('resetConfirmClose').onclick = close;
}

