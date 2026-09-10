# PLAY — Live Status Foundation

Flux : `LiRythmeState / LiRythmeClock / MidiManager → PlayStatusUI → texte DOM`.
La vue ne reçoit aucune action musicale et ne modifie aucun état moteur.

- SELECTED : cible des prochaines opérations, selon `state.selectedInstrument`.
  Une Voice affiche uniquement son nom dans `state.padConfiguration.voices`
  (repli `VOICE xx` si elle est sans nom). Sans Voice sélectionnée, la cible
  implicite est le Motif courant, affiché « Motif 01 » pour l’unique Motif actuel.
  Ce libellé n’ajoute aucun état de sélection ou de numérotation des Motifs.
  La sélection locale de l’éditeur SETTINGS n’intervient pas.
- STATE : `state.transportState` (PLAY / PAUSE / STOP).
- BPM interne : `clock.state.tempo`, également consommé par la clock interne.
- CLOCK SOURCE : `clock.source` ; MIDI devient EXTERNAL et le nom provient de
  `midiManager.clockInput.name`, le port connecté, jamais d’un choix sauvegardé.
  Sans nom exposé, la vue affiche EXTERNAL — MIDI.

`readPlayStatus` produit une projection éphémère ; `initializePlayStatusUI`
actualise uniquement les textes modifiés à chaque `requestAnimationFrame`.
Il n’existe pas de bus général de notification pour sélection/tempo/source :
cette observation couvre leurs mutations sans modifier les moteurs ni leurs setters.
Le callback de transport existant dans `app.js` appelle aussi `render()` avant
ses branches musicales, pour propager synchroniquement PLAY / PAUSE / STOP.
La boucle visuelle est annulée à `pagehide`. Elle ne cadence ni MIDI ni playback ;
les trames peuvent être suspendues lorsque la fenêtre est masquée, puis reprennent.

## Limites réelles

Le moteur d’entrée MIDI compte les pulses, sans mesurer ni exposer de BPM externe.
En EXTERNAL, BPM affiche « XXX » : aucun calcul UI et aucune réutilisation
du tempo interne. Le nom de port décrit l’entrée connectée, pas une détection
de pulses actifs ni une nouvelle surveillance de déconnexion hardware.

Le dépôt ne contient aucun MockUp PLAY retrouvé : `index.html` contenait une page
provisoire. Les quatre indicateurs utilisent le style existant, sans contrôle dans
la section PLAY. La navigation globale SETTINGS / PLAY / Help existante est conservée.
La validation visuelle et hardware a été confirmée par Daniel le 10 septembre 2026,
incluant les trois ajustements de libellés SELECTED et BPM.
Aucun Focus/Solo/Mute, motif, Chain, transform ou horloge graphique n’est ajouté.

## Vérification

`npm test` inclut les 59 tests existants et six tests PLAY : projection réelle,
transitions transport LOCAL/MIDI, propagation visuelle, lecture seule et absence
de contrôles. Les tests utilisent les classes moteur réelles et un DOM minimal.

Résultat validé : 65/65 tests réussis, contrôles syntaxiques et `git diff --check` OK.
