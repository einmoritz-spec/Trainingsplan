/*
 * Service Worker für "Trainingsplan"
 * Strategie: Network-first für den App-Shell (HTML/CSS/JS), damit Updates nach
 * einem Deploy sofort ankommen, sobald Netz verfügbar ist. Fällt nur bei
 * fehlendem Netz auf den zuletzt gecachten Stand zurück (Offline-Fähigkeit
 * bleibt erhalten). Icons/Bilder bleiben cache-first, da sie sich praktisch
 * nie ändern und so weiterhin blitzschnell laden.
 * Alle Pfade sind relativ, damit das auch unter einem GitHub-Pages-Projektpfad
 * (https://user.github.io/repo/) funktioniert.
 *
 * WICHTIG: CACHE_NAME bei jeder inhaltlichen Änderung an sw.js selbst
 * hochzählen (v2, v3, ...) — nur dann erkennt der Browser ein Update dieser
 * Datei und installiert den neuen Service Worker (der dann automatisch alle
 * App-Shell-Dateien frisch vom Netz holt). Für Änderungen an styles.css/js/*
 * ist das dank der Network-first-Strategie unten NICHT mehr nötig.
 *
 * v3: jsPDF liegt nicht mehr auf cdnjs, sondern lokal unter js/vendor/ (siehe
 * index.html) und wird wie der Rest der App-Shell vorab gecacht — der
 * PDF-Export funktioniert dadurch jetzt auch komplett offline.
 * Zusätzlich: der Cache-Filter unten akzeptierte bisher nur response.type
 * === 'basic' (= gleiche Origin). Cross-Origin-Antworten mit CORS-Headern
 * (response.type === 'cors', z. B. von Google Fonts) fielen dadurch IMMER
 * durch den Filter und wurden nie gecacht, selbst wenn sie schon einmal
 * erfolgreich geladen wurden. Google Fonts läuft daher jetzt über eine
 * eigene Cache-first-Route (siehe FONT_HOSTS unten) statt über die generische
 * Network-first-Route der App-Shell.
 * v4: reiner Cache-Versionsbump, weil 01-storage.js/02-state-theme.js/
 * 07-home.js/10-plan-settings.js sich inhaltlich geändert haben (IndexedDB-
 * Speicher, Backup-Erinnerung) — dank Network-first für JS wäre das zwar auch
 * ohne Bump beim nächsten Online-Laden angekommen, ein Versionssprung stellt
 * aber sicher, dass auch rein offline installierte Instanzen beim nächsten
 * Update-Zyklus sauber alles neu holen, sobald wieder Netz da ist.
 * v85: BUGFIX — weiterer Absturz nach dem Essenstracker-Lazy-Loading (v81), diesmal beim
 * direkten Neuladen der Seite MITTEN im Essenstracker ("ReferenceError: renderFoodTracker is
 * not defined", 06-navigation.js:303). Subtilere Ursache als der v84-Fix: `.then(renderFood
 * Tracker)` (bare Funktionsreferenz statt Arrow-Funktion) wertet den Bezeichner
 * "renderFoodTracker" SOFORT aus — im selben Moment, in dem ftEnsureLoaded() aufgerufen wird,
 * nicht erst nachdem dessen Promise aufgelöst hat. renderFoodTracker existiert zu diesem frühen
 * Zeitpunkt aber noch nicht (liegt im noch nicht geladenen Essenstracker-Modul) — das wirft den
 * Fehler, BEVOR ftEnsureLoaded() überhaupt die Chance hatte, das Modul zu laden. Betraf die drei
 * bare Referenzen case 'foodTracker'/'foodStats'/'foodCalendar' (renderViewByState(),
 * 06-navigation.js) — jetzt alle auf () => renderXY() umgestellt (verzögert den Namens-Lookup
 * bis zur tatsächlichen Ausführung nach dem Laden). Die bare Referenzen bei den (nicht lazy
 * geladenen) Statistik-Funktionen (renderProgressList etc.) waren davon nicht betroffen und
 * blieben unverändert.
 * Beim selben Durchgang zwei weitere, unabhängig davon gefundene Fälle derselben Fehlerklasse
 * (unbedingter Zugriff auf eine Essenstracker-Funktion von AUSSERHALB des Moduls) behoben:
 * (1) renderKcalStats() (08c-stats-progress-list.js) rief bei aktiviertem Essenstracker
 * computeTrainingVsRestDayIntake() unbedingt auf, unabhängig davon, ob das Modul in dieser
 * Sitzung je geladen wurde — goKcalStats() lädt es jetzt bei Bedarf zuerst nach (nur wenn das
 * Feature aktiviert ist, sonst wie bisher ohne Essenstracker-Bezug). (2) Der Sessions-
 * Vergleich auf der Startseite (renderHome(), 07-home.js) nutzte ftEscapeHTML() als
 * allgemeine Escape-Funktion für Übungsnamen, obwohl das Feature nichts mit dem Essenstracker
 * zu tun hat — jetzt esc() (04-utils.js, ohnehin die dafür vorgesehene, immer verfügbare
 * zentrale Variante, siehe v83).
 * v84: BUGFIX — regelrechter Absturz beim Start (renderHome() warf "ReferenceError:
 * foodTrackerLoaded is not defined", weißer Fehlerbildschirm "Etwas ist schiefgelaufen"),
 * eingeschleppt durch das Essenstracker-Lazy-Loading in v81: foodTrackerLoaded ist eine
 * Variable AUS dem Essenstracker-Modul (15a-food-core.js) und existiert im globalen Scope erst,
 * sobald dieses geladen wurde — seit v81 ist das aber nicht mehr automatisch der Fall
 * (ensureFoodTrackerScriptsLoaded(), 04-utils.js). renderHome() griff an drei Stellen
 * (homeMealsAccordionBodyHTML(), die "Mahlzeiten"-Kopfzeile, der Akkordeon-Öffnen-Handler)
 * direkt (ohne typeof) auf foodTrackerLoaded zu — traf JEDEN Start, bei dem der Essenstracker
 * aktiviert war (isFoodTrackerEnabled()), unabhängig davon, ob das Akkordeon je geöffnet wurde.
 * Neue Funktion isFoodTrackerDataLoaded() (07-home.js, direkt neben isFoodTrackerEnabled())
 * prüft das jetzt sicher per typeof; alle drei Stellen nutzen sie statt der rohen Variable.
 * Beim Lazy-Loading-Umbau selbst (v81) wurden Funktions-AUFRUFE aus dem Essenstracker-Modul
 * heraus systematisch abgesichert (ftEnsureLoaded()/typeof-Guards) — diese drei rohen
 * Variablen-LESEZUGRIFFE (kein Funktionsaufruf, daher beim damaligen Audit übersehen) waren die
 * einzige verbliebene Lücke; eine erneute Suche nach allen anderen Modul-Variablen
 * (ftDays/ftCurrentDate/ftAutoMealBuilder/...) ergab keine weiteren.
 * v83: Einseitige/wechselseitige Übungen (Ausfallschritte, einarmiges Rudern/Curls) zählten im
 * Trainingsvolumen bisher nur die halbe tatsächlich geleistete Arbeit — die eingetragene
 * Wiederholungszahl steht bei diesen Übungen für EINE Seite, im selben Satz wird aber mit
 * derselben Wiederholungs-/Gewichtszahl auch die andere Seite bewegt. Neues Feld
 * planEx.unilateral (Checkbox "Einseitig/wechselseitig" im Übungs-Editor, direkt unter
 * "Eigenkörpergewicht") verdoppelt jetzt gezielt NUR das Volumen (setVolumeKg(), neu in
 * 04-utils.js) — 1RM/10RM-Schätzung und Gewichts-Rekorde bleiben unverdoppelt, weil die die
 * Kraftfähigkeit bzw. das tatsächlich gehobene Gewicht auf EINER Seite beschreiben, nicht die
 * Gesamtarbeit. Alle ~9 Stellen, die bisher einzeln "Wdh × effectiveSetWeight()" gerechnet
 * hatten (Gesamtvolumen, Monatsbericht, Muskelbalance nach Gewicht, Session-Zusammenfassung,
 * PDF-Export, Live-Anzeige während des Trainings, ...), laufen jetzt über diese eine Funktion.
 * Automatisch vorbelegt (unilateral:true) für die sechs eingebauten Übungen, bei denen der Name
 * es schon sagt oder es aus der Bewegung eindeutig hervorgeht: Ausfallschritte (Kurzhanteln/
 * Multipresse), Bulgarian Split Squats, Kurzhantelrudern einarmig, Bizeps Curls Kabelturm
 * (einarmig), Trizeps Extension Kabelturm (einarmig). Bewusst NICHT automatisch gesetzt:
 * bilaterale Kurzhantel-Übungen (z. B. Bizeps Curls Kurzhantel, Hammer Curls — beide Arme
 * bewegen sich dort meist gleichzeitig, das ist ein anderer, hier nicht angefasster Fall) und
 * die Dualbeinpresse (laut Beschreibung nur "unilateral belastbar", nicht zwingend so genutzt)
 * — dafür lässt sich das neue Kontrollkästchen manuell setzen. Für BESTANDSNUTZER übernimmt das
 * (wie schon beim Kniebeugen-Fix in v82) eine neue Migrationsstufe (plan.schemaVersion < 17).
 * v82: Kniebeugen zählten bisher nur das aufgelegte Gewicht, nicht das eigene Körpergewicht,
 * das bei einer Kniebeuge (anders als z. B. bei Bankdrücken) ja ebenfalls die ganze Bewegung
 * über mitgetragen wird — Volumen, 1RM-Schätzung und Rekorde waren dadurch bei "Kniebeuge
 * (Langhantel)", "Frontkniebeuge" und "Kniebeugen (Multipresse)" durchgehend zu niedrig. Alle
 * drei haben jetzt bodyweightExercise:true (siehe effectiveSetWeight(), 04-utils.js) — das
 * Gewichtsfeld wird dadurch automatisch optional und dezent ausgegraut angezeigt (exakt
 * dieselbe .weight-input-optional-Optik wie beim Rückenstrecker), man trägt weiterhin ganz
 * normal das aufgelegte Gewicht ein, Körpergewicht wird automatisch addiert. Neu:
 * machineWeightKg (nur bei der Multipresse mit 15kg vorbelegt, als "Ungefähres Gerätegewicht
 * (kg)" pro Übung im Editor änderbar) addiert zusätzlich einen groben Näherungswert für das
 * Eigengewicht der Multipresse-Stange selbst — bei der freien Langhantel unnötig, weil das
 * eingetragene Gewicht dort schon die komplette Stange einschließt. Für BESTANDSNUTZER (bei
 * denen diese drei Übungen schon in plan.exercises stehen, sodass die reine Datenänderung in
 * data/app-data.js sie nicht erreicht hätte) übernimmt das eine neue Migrationsstufe
 * (plan.schemaVersion < 16, 02-state-theme.js) — patcht nur die drei Übungen anhand ihrer
 * festen IDs (e26/e30/e61) und nur, falls bodyweightExercise dort noch nicht gesetzt war.
 * v81: Eigene Kardiogeräte. Die Geräteauswahl beim Anlegen einer Kardio-Übung ("Welches
 * Gerät?") und das Kardiogerät-Feld im Übungs-Editor bestehender Übungen waren auf die fünf
 * fest einprogrammierten CARDIO_MACHINES (Laufband/Crosstrainer/Fahrrad/Rudern/Stairmaster)
 * beschränkt — für z. B. ein Assault Bike oder SkiErg gab es keine Möglichkeit, ein passendes
 * Gerät auszuwählen. Neu: "+ Eigenes Gerät hinzufügen" (Wizard) bzw. "+ Eigenes Gerät
 * hinzufügen…" (Editor-Dropdown, als letzte <option>) öffnen einen kleinen Namens-Prompt
 * (openAddCustomCardioMachinePrompt(), 03-input-widgets.js) und legen ein neues Gerät in
 * plan.customCardioMachines an, mit den zwei generischen Feldern "Widerstand"/"Tempo" (gleiches
 * Muster wie die eingebaute Stepper-Vorlage — passt nicht zu jedem Gerät exakt, aber ein nicht
 * benötigtes Feld lässt sich einfach leer lassen). Eigene Geräte werden einmal angelegt und
 * stehen danach bei JEDER künftigen Kardio-Übung zur Auswahl (wie plan.customCategories/
 * customFonts). Damit das an allen ~10 bestehenden CARDIO_MACHINES[key]-Zugriffsstellen
 * (Sätze-Tabelle, kcal-Schätzung, Label-Anzeige, PDF-Export, ...) automatisch mitläuft, gibt es
 * jetzt einen zentralen Umweg cardioMachineConfig(key) (js/data/app-data.js), der zuerst in
 * CARDIO_MACHINES und dann in plan.customCardioMachines nachschlägt — nur cardioFieldsFor()
 * und die Label-Auflösung in kcalCategoryLabel() (04-utils.js) mussten darauf umgestellt
 * werden, alle anderen Stellen griffen ohnehin schon nur über diese beiden Funktionen zu.
 * Verwalten/Löschen eigener Geräte ist (noch) nicht möglich — bewusst nicht Teil dieser
 * Änderung, siehe Kommentar in der Antwort an den Nutzer.
 * v80: Löschen-Buttons in den Lebensmittel-Listen (Suchergebnisse, "Eigene Lebensmittel",
 * gespeicherte Mahlzeiten) standen nicht untereinander, sondern wanderten je nach Länge des
 * Lebensmittelnamens horizontal hin und her — die Sterne rechts daneben bildeten dagegen
 * korrekt eine Spalte. Ursache: .result-main hatte kein flex-grow und schrumpfte damit auf
 * seine Inhaltsbreite; das justify-content:space-between auf .result-row verteilte den
 * verbleibenden freien Platz gleichmäßig ZWISCHEN allen drei Kindern (Text | Löschen | Stern),
 * statt die Buttons geschlossen nach rechts zu schieben. Der Stern war davon nur deshalb nicht
 * betroffen, weil er als letztes Kind ohnehin am rechten Rand endete. Behoben durch flex:1 auf
 * .result-main (schiebt beide Buttons nach rechts) und gap:6px auf .result-row statt
 * space-between (sorgt für den Abstand zwischen Text, Löschen-Button und Stern). Betrifft alle
 * vier Stellen mit dieser Zeilenstruktur gemeinsam, da sie sich dieselben CSS-Regeln teilen.
 * v79: Kennzahlen-Raster im Monatsbericht (2×2-Karte oben: Workouts/Ø Dauer/Gesamtvolumen/
 * Neue Rekorde) lief rechts aus der Karte heraus — die rechte Spalte war abgeschnitten
 * ("1:10:1…", "Neue Rekorde") und das Delta "+1.508 kg" überlagerte den Rekord-Wert.
 * Ursache: .month-report-stat-cell sind Grid-Items und haben damit per Default
 * min-width:auto, dürfen also nie schmaler werden als ihr Inhalt. Da .month-report-stat-value
 * white-space:nowrap trägt, erzwang ein langes Volumen ("141.754,25 kg") eine Mindestbreite
 * über 1fr hinaus, wodurch Spalte 1 wuchs und Spalte 2 aus der Karte schob. Behoben durch
 * min-width:0 auf den Zellen (1fr greift wieder), flex-wrap auf dem Wert (Delta rutscht bei
 * Platzmangel in die nächste Zeile statt überzulaufen), margin-top:auto auf der Beschriftung
 * (hält die Labels beider Zellen einer Zeile trotz umbrochenem Delta auf gleicher Höhe),
 * column-gap sowie einer mitskalierenden Schriftgröße per clamp(). Zusätzlich wird das
 * Gesamtvolumen jetzt auf ganze Kilogramm gerundet angezeigt (zwei Nachkommastellen sind bei
 * sechsstelligen Werten reines Rauschen und kosteten drei Zeichen Breite) — der Delta-Wert
 * daneben war ohnehin schon gerundet.
 * v78: Sicherheits-/Performance-Durchgang. (1) Zentrale esc()-Funktion (04-utils.js) für
 * HTML-Escaping eingeführt und an rund 20 Stellen auf der Trainings-Seite nachgerüstet, die
 * Nutzertext (Übungsname, Notiz, Kategorie-/Split-Name, eigene Schriftart) bisher ungeschützt in
 * innerHTML einsetzten — u. a. exerciseNameHTML() (11a-active-session.js) und die neue
 * modeDisplayLabelHTML() (09a-start-select.js) escapen jetzt zentral, was vorher an jeder
 * einzelnen Aufrufstelle hätte einzeln passieren müssen. Zwei alte Ad-hoc-Fixes, die nur "
 * escapten (nicht aber < / >), wurden durch esc() ersetzt. ftEscapeHTML() (Essenstracker)
 * delegiert jetzt ebenfalls an esc() — die vorherige Implementierung escapte kein "/', wodurch
 * value="${ftEscapeHTML(...)}" an mehreren Stellen aus dem Attribut ausbrechen ließ.
 * (2) Google Fonts: nur noch Bebas Neue/Inter/JetBrains Mono (immer benötigt) laufen statisch in
 * index.html, die übrigen ~30 wählbaren Familien laden jetzt erst bei Bedarf nach
 * (ensureGoogleFontsLoaded(), 02-state-theme.js) statt bei JEDEM Start als ein einziger,
 * render-blockierender Request mit allen Gewichtungen.
 * (3) Essenstracker (js/data/food-data.js + js/15a-d, ~339 KB) und Perioden-PDF-Export
 * (js/16-period-pdf.js) werden nicht mehr statisch in index.html geladen, sondern erst beim
 * ersten tatsächlichen Bedarf per Skript-Injection nachgeladen (ensureFoodTrackerScriptsLoaded()/
 * ensurePeriodPdfLoaded(), 04-utils.js) — analog zum bestehenden Muster für jsPDF selbst. Beide
 * bleiben Teil des App-Shell-Precache unten (Offline-Nutzung unverändert).
 * (4) init() (02-state-theme.js): die 5 unabhängigen Storage-Ladeaufrufe laufen jetzt über
 * Promise.all parallel statt sequenziell. Die bisher 15 einzelnen _xyzMigration-Booleans im
 * plan-Objekt sind einem einzigen plan.schemaVersion-Zähler gewichen (siehe Kommentar dort).
 * (5) Trainingshistorie/Essenstracker-Tage laden beim Start jetzt nur noch die letzten 3 Monate
 * synchron (schnellerer erster Paint), der Rest lädt anschließend im Hintergrund nach (siehe
 * loadRecentSessions()/loadAllSessions(), 01-storage.js).
 * v31: 15-food-tracker.js (2083 Zeilen, eine einzige Datei für das komplette
 * Essenstracker-Feature) aufgeteilt in 15a-food-core.js/15b-food-day.js/
 * 15c-food-add.js/15d-food-stats.js (siehe Kopfkommentar in 15a-food-core.js) —
 * reine Architektur-Änderung, kein Funktionsverlust. Dabei zugleich drei
 * Bugfixes: (1) Fremd-Origin-Antworten (Open-Food-Facts-Barcode-Abfragen,
 * Online-Textsuche) wurden bisher versehentlich über die generische
 * Network-first-Route mitgecacht und blähten CACHE_NAME unbegrenzt auf —
 * neuer expliziter Origin-Filter im fetch-Handler lässt Fremd-Origins jetzt
 * unangetastet durch (siehe Kommentar dort). (2) ftOffByBarcode() (jetzt
 * 15a-food-core.js) hatte kein try/catch um fetch()/json() — offline oder bei
 * API-Ausfall blieb der Scan-Vorgang beim Toast "Suche Produkt …" stumm
 * hängen, ohne dass der Nutzer je eine Rückmeldung bekam; liefert jetzt immer
 * ein Ergebnisobjekt inkl. Fehlergrund. (3) Essenstracker-Suche fand bisher
 * nur Ein-Wort-Treffer ("Hähnchen Brust" fand kein "Hähnchenbrust, paniert")
 * — durchsucht Suchbegriffe jetzt Wort für Wort. Zusätzlich: Essenstracker-
 * Tageshistorie liegt jetzt (wie der Trainingsverlauf) in Monats-Chunks statt
 * einem einzigen Blob (siehe loadAllFoodDays()/saveFoodDayChunk(),
 * 01-storage.js) — ein einzelner geloggter Bissen serialisiert nicht mehr
 * die komplette Ernährungshistorie neu.
 * v30: Essenstracker-Suche priorisiert jetzt bereits getrackte Lebensmittel (ftFoodUsageCount,
 * food:usageCount, hochgezählt in ftAddEntryToMeal()/ftApplySavedMeal()) — sie erscheinen bei
 * einer Suche immer vor noch nie getrackten Treffern, sortiert nach Häufigkeit, auch wenn ein
 * anderer Treffer textlich besser zum Suchbegriff passen würde (ftRankFoods(), gilt auch für
 * Online-Suchergebnisse). lastAmounts/usageCount jetzt zusätzlich Teil von Export/Import.
 * v29: Essenstracker merkt sich jetzt pro Lebensmittel die zuletzt verwendete Menge
 * (ftLastAmounts, food:lastAmounts) und schlägt sie beim nächsten Hinzufügen als Vorbelegung
 * im Mengen-Modal vor, statt immer starr 100 g bzw. 1 Stück — funktioniert für Gramm- UND
 * Stück-Mengen (z. B. "1 Scoop"), aktualisiert sich bei jedem erneuten Hinzufügen/Bearbeiten
 * auf den zuletzt eingegebenen Wert.
 * v28: Essenstracker — unbekannter Barcode öffnet jetzt direkt das Formular für ein eigenes
 * Lebensmittel (mit Hinweistext + Barcode vorbelegt) statt nur "Produkt nicht gefunden" zu
 * melden; beim nächsten Scan desselben Codes wird er automatisch erkannt (food.barcode-Feld,
 * ftHandleScannedCode() prüft zuerst lokal). Dabei außerdem einen Wettlauf im Overlay-System
 * gefixt: wird ein neues Overlay sehr kurz nach dem Schließen des vorherigen geöffnet (genau
 * der Fall beim sofortigen Erkennen eines bekannten Barcodes), konnte der verzögerte Aufräum-
 * Timer des alten Overlays das neue kurz danach wieder löschen — neuer Generationszähler
 * (ftOverlayGeneration) verhindert das.
 * v27: Essenstracker-Bugfixes — (1) CSS-Kommentar enthielt versehentlich einen Kommentar-
 * Endemarker mitten im Text, wodurch der Kommentar vorzeitig endete und .date-row samt Folgeregeln vom Browser verworfen
 * wurden (Datumszeile lief nicht mehr als Flexbox, Kreise in der Kalenderansicht sahen kaputt
 * aus). (2) Sheet-Positionierung bei geöffneter Tastatur auf dieselbe Höhe/Top-Technik wie
 * wireViewportAwareOverlays() umgestellt (vorher bottom/max-height-Neuberechnung, die bei der
 * Android-Tastatur-Animation sichtbar nachfederte). (3) Essenstracker-Zahlenfelder von der
 * globalen Scroll-Rad/Ziffernblock-Umschaltung ausgenommen, bekommen jetzt immer die normale
 * System-Tastatur. (4) ftOffSearch() (Online-Textsuche) cachte Ergebnisse bisher nicht in
 * ftOffCache — Klick auf ein Online-Suchergebnis oder dessen Favoriten-Stern tat dadurch
 * nichts, da ftGetFoodById() das Lebensmittel nicht wiederfand.
 * v26: Essenstracker-Statistiken ergänzt (Tippen auf die kcal-Zahl → renderFoodStats() in
 * 15-food-tracker.js) — Balkendiagramm kcal/Tag (Woche/Monat/Quartal/Jahr), interaktiver
 * Makro-Donut mit Lebensmittel-Aufschlüsselung, Monatsübersicht-Karte unter "Monat".
 * v25: Bugfix Essenstracker-Mengen-Modal — .qty-input hatte kein min-width:0, wodurch der
 * Zahlen-Input in der Gramm/Stück-Zeile nicht unter seine Browser-Mindestbreite schrumpfen
 * konnte und den "+"-Button rechts aus der Sheet-Karte herausdrückte (musste gescrollt
 * werden). Zusätzlich: Mengenfeld leert sich jetzt beim Antippen statt den vorbelegten Wert
 * stehen zu lassen, Suchfeld im "+"-Sheet wird beim Öffnen automatisch fokussiert.
 * v24: Essenstracker-Feature ergänzt (js/data/food-data.js, js/15-food-tracker.js neu in der
 * Precache-Liste) — standardmäßig ausgeblendet (Einstellungen → Allgemein), siehe
 * isFoodTrackerEnabled() in 07-home.js.
 * v11: Icon-Dateien bereinigt (icon-192.png, icon-512.png, icon-512-maskable.png) — die
 * gestrichelten Führungslinien, die versehentlich mit ins finale PNG exportiert wurden (sichtbar
 * z. B. in icon-512-maskable.png), sind entfernt. icon-512-maskable.png ist jetzt außerdem
 * echt randlos (voller Bleed bis zum Rand, keine abgerundeten Ecken mehr eingebacken — das ist
 * für "purpose: maskable" Pflicht, siehe manifest.json), icon-192.png/icon-512.png haben jetzt
 * echte Transparenz an den abgerundeten Ecken statt der vorherigen festen weißen Füllung.
 * Da sich die Bilddaten unter gleichem Dateinamen geändert haben, MUSS CACHE_NAME hier
 * hochgezählt werden — sonst bliebe der Service Worker für immer bei den alten, fehlerhaften
 * Icon-Bytes (Cache-Storage vergleicht keine Inhalte, nur ob der Precache-Schritt bereits lief).
 * v10: install() cacht die App-Shell jetzt fehlertolerant (Promise.allSettled statt
 * cache.addAll()) — vorher hätte eine einzelne fehlende/falsch benannte Datei (z. B. beim
 * Hochladen vergessen) die KOMPLETTE Installation des neuen Service Workers zum Scheitern
 * gebracht: kein Update-Banner, keine Fehlermeldung, der Nutzer sieht einfach weiterhin den
 * alten (oder im schlimmsten Fall gar keinen funktionierenden) Stand. Jetzt wird jede Datei
 * einzeln geholt; eine einzelne fehlgeschlagene Datei verhindert nicht mehr, dass der Rest
 * der App-Shell gecacht wird und das Update ankommt.
 * v9: Übungsbilder liegen nicht mehr als Base64 inline in js/data/app-data.js, sondern als
 * eigene WebP-Dateien unter assets/exercises/ (js/vendor/jspdf.umd.min.js bleibt ebenfalls
 * im Precache, wird in index.html aber nur noch bei Bedarf per <script> nachgeladen statt bei
 * jedem Start geparst, siehe ensureJsPdfLoaded() in 04-utils.js) — app-data.js schrumpft
 * dadurch von ~690 KB auf ~130 KB, was den allerersten Parse/Boot spürbar beschleunigt. Die
 * neuen Bild-Dateien werden unten in der Precache-Liste geführt, damit sie wie bisher auch
 * offline verfügbar sind (zusätzlich ohnehin cache-first dank .webp in
 * CACHE_FIRST_EXTENSIONS).
 * v8: Versionsbump (Wochen-Bucket-Fix Monatsbericht/-übersicht: 05-calendar.js).
 * v7: Versionsbump (Zurück-Stack-Fix beim Farbwähler: 09a/09b/10).
 * v6: Versionsbump für das "Aktualisieren"-Banner (index.html, 04-utils.js). Dieser
 * Wert MUSS bei jedem Deploy hochgezählt werden — der Browser erkennt einen neuen
 * Service Worker ausschliesslich an einer byteweisen Änderung von sw.js, und ohne
 * neuen Worker erscheint das Update-Banner in der App nie.
 * v5: 08-stats-progress.js, 09-start-select.js und 11-active-session.js waren
 * an der Größengrenze für vollständige Datei-Downloads und wurden je in drei
 * Teildateien gesplittet (08a/08b/08c, 09a/09b/09c, 11a/11b/11c) — inhaltlich
 * unverändert, nur andere Dateinamen/mehr Dateien in der Precache-Liste.
 */

const CACHE_NAME = 'trainingsplan-cache-v85';
const FONT_CACHE_NAME = 'trainingsplan-fonts-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/data/app-data.js',
  './js/01-storage.js',
  './js/02-state-theme.js',
  './js/03-input-widgets.js',
  './js/04-utils.js',
  './js/05-calendar.js',
  './js/06-navigation.js',
  './js/07-home.js',
  './js/08a-stats-progress-charts.js',
  './js/08b-stats-muscle-balance.js',
  './js/08c-stats-progress-list.js',
  './js/09a-start-select.js',
  './js/09b-start-select-mode-settings.js',
  './js/09c-start-select-tiles.js',
  './js/10-plan-settings.js',
  './js/11a-active-session.js',
  './js/11b-active-session-render.js',
  './js/11c-active-session-rest.js',
  './js/12-session-summary.js',
  './js/13-session-detail-pdf.js',
  './js/data/food-data.js',
  './js/15a-food-core.js',
  './js/15b-food-day.js',
  './js/15c-food-add.js',
  './js/15d-food-stats.js',
  './js/16-period-pdf.js',
  './js/14-app-init.js',
  './js/vendor/jspdf.umd.min.js',
  './assets/icons/favicon.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/fork-knife.png',
  './assets/exercises/e1.webp',
  './assets/exercises/e2.webp',
  './assets/exercises/e3.webp',
  './assets/exercises/e4.webp',
  './assets/exercises/e5.webp',
  './assets/exercises/e6.webp',
  './assets/exercises/e7.webp',
  './assets/exercises/e8.webp',
  './assets/exercises/e9.webp',
  './assets/exercises/e10.webp',
  './assets/exercises/e11.webp',
  './assets/exercises/e12.webp',
  './assets/exercises/e13.webp',
  './assets/exercises/e14.webp',
  './assets/exercises/e15.webp',
  './assets/exercises/e16.webp',
  './assets/exercises/e17.webp',
  './assets/exercises/e18.webp',
  './assets/exercises/e19.webp',
  './assets/exercises/e20.webp',
  './assets/exercises/e21.webp',
  './assets/exercises/e26.webp',
  './assets/exercises/e28.webp',
  './assets/exercises/e30.webp',
  './assets/exercises/e35.webp',
  './assets/exercises/e38.webp',
  './assets/exercises/e41.webp',
  './assets/exercises/e45.webp',
  './assets/exercises/e47.webp',
  './assets/exercises/e52.webp',
  './assets/exercises/e53.webp',
  './assets/exercises/e54.webp',
  './assets/exercises/e60.webp',
  './assets/exercises/e61.webp',
  './assets/exercises/e62.webp',
  './assets/exercises/e66.webp',
  './assets/exercises/e69.webp',
  './assets/exercises/e71.webp',
  './assets/exercises/e72.webp',
  './assets/exercises/e73.webp',
  './assets/exercises/e76.webp',
  './assets/exercises/e77.webp',
];

// Google Fonts: eigene Domains für das CSS (googleapis.com, liefert je nach
// User-Agent unterschiedliche @font-face-Regeln) und die eigentlichen
// Font-Dateien (gstatic.com). Beide senden korrekte CORS-Header, die
// Responses kommen also mit type "cors" an (nicht "opaque") und lassen sich
// wie normale Same-Origin-Antworten cachen.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Dateitypen, die sich praktisch nie ändern (Icons/Bilder) — für die bleibt
// cache-first sinnvoll (maximale Geschwindigkeit + Offline).
const CACHE_FIRST_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'];
function isCacheFirstAsset(url){
  return CACHE_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

// Eine Antwort gilt als cachefähig, wenn sie entweder von der eigenen Origin
// kommt (type "basic") oder von einer bekannten Cross-Origin-Quelle mit
// funktionierendem CORS (type "cors", z. B. Google Fonts). "opaque"
// (Cross-Origin ohne CORS) bleibt bewusst ausgeschlossen, da sich deren
// Status/Erfolg nicht prüfen lässt — ein Fehler würde sonst als "Erfolg"
// gecacht.
function isCacheableResponse(res){
  return !!res && res.status === 200 && (res.type === 'basic' || res.type === 'cors');
}

// Installation: App-Shell vorab cachen.
// BEWUSST NICHT cache.addAll() (atomar: EIN 404 wirft die komplette Installation weg, der
// neue Service Worker landet dann als "redundant" — kein Update-Banner, keine Fehlermeldung,
// einfach stille Nichtinstallation). Stattdessen wird jede Datei einzeln geholt; eine
// einzelne fehlende/fehlerhafte Datei (z. B. ein vergessenes Bild beim Hochladen) verhindert
// nicht mehr, dass der Rest der App-Shell gecacht wird und das Update trotzdem ankommt.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Precache fehlgeschlagen, wird übersprungen:', url, err);
          })
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// Aktivierung: alte Cache-Versionen aufräumen (App-Shell- UND Font-Cache)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== FONT_CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch:
// - Google Fonts (CSS + Dateien): Cache-first in eigenem, dauerhaftem Cache —
//   ändert sich praktisch nie, muss also nicht bei jedem Laden neu vom Netz
//   geholt werden, und bleibt so garantiert offline verfügbar.
// - Icons/Bilder: Cache-first (unverändert, für Geschwindigkeit + Offline).
// - Alles andere (HTML/CSS/JS): Network-first, damit ein neues Deploy sofort
//   sichtbar wird, sobald Netz da ist — nur ohne Netz greift der zuletzt
//   gecachte Stand (Offline-Fallback, inkl. index.html bei Navigationen).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Fremd-Origins (außer den bekannten Font-Hosts unten) lässt der Service Worker komplett
  // unangetastet durch den Browser laufen, statt sie abzufangen — Bugfix: vorher griff für
  // ALLES, was nicht auf einen Cache-first-Dateityp (Bild) endete, die generische
  // Network-first-Route weiter unten, die jede erfolgreiche Antwort in CACHE_NAME schreibt.
  // Damit landete jede Open-Food-Facts-Barcode-Abfrage und jede Online-Textsuche (Essenstracker,
  // 15a-food-core.js) dauerhaft im App-Shell-Cache und wurde erst beim nächsten CACHE_NAME-Bump
  // wieder gelöscht — der Cache wuchs so unbegrenzt mit Fremd-API-Antworten statt nur die
  // eigene App-Shell zu enthalten.
  if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) return;

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) => {
            if (isCacheableResponse(networkResponse)) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);
        })
      )
    );
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (isCacheableResponse(networkResponse)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });
      })
  );
});

/* ---------------------------------------------------
   Sperrbildschirm-/Statusleisten-Benachrichtigung bei laufendem Training
--------------------------------------------------- */
// Die Benachrichtigung selbst wird von der Seite aus erzeugt/aktualisiert
// (showActiveTrainingNotification() in js/11a-active-session.js) — sie MUSS über
// registration.showNotification() laufen, da der Konstruktor "new Notification()" auf Android
// nicht erlaubt ist. Hier steckt nur die Reaktion auf einen Tap darauf.
//
// Verhalten: Läuft die App noch irgendwo (Tab/PWA-Fenster, evtl. nur im Hintergrund), wird
// dieses Fenster in den Vordergrund geholt statt ein zweites zu öffnen — sonst gäbe es zwei
// Instanzen und die laufende Trainings-Session (nur im Speicher der einen Seite) wäre in der
// neuen nicht sichtbar. Erst wenn gar kein Fenster mehr existiert, wird eines geöffnet; der
// Query-Parameter ?resume=training signalisiert der frisch startenden App, direkt zur aktiven
// Trainingsseite zu springen (siehe Auswertung in js/14-app-init.js).
self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== 'training-active') return;
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients){
      if ('focus' in client){
        // Der Seite mitteilen, dass sie zur Trainingsansicht wechseln soll — ein reines
        // focus() würde nur den letzten Bildschirm zeigen, nicht zwingend das Training.
        client.postMessage({ type: 'open-active-training' });
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow('./?resume=training');
  })());
});
