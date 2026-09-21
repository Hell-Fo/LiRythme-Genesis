# Bibliothèque Motif — Phase C.1 : persistance automatique

Extension [A/T Phase A](AT-PHASE-A-VELOCITY.md) : les motifs v1 peuvent aussi
contenir `velocities`, matrice facultative de 16 × 32 entiers 1–127. Sans ce
champ, la vélocité reste 100. Les valeurs provisoires A/T sont exclues du
snapshot disque jusqu'à COMMIT ; aucun état de transaction n'est sérialisé.

## Emplacement et format

Banque de travail : `path.join(app.getPath("userData"), "motif-bank.json")`.
Sous Windows, Electron utilise normalement `%APPDATA%/lirythme-genesis/` pour
ce projet ; `app.getPath("userData")` reste la référence si son environnement
est personnalisé. Aucun fichier Pad Configuration n'est déplacé ou modifié.

Format JSON : `format: "lirythme-motif-bank"`, `version: 1`, `currentMotifId`
(index 0–15), `motifs` (16 entrées). Chaque entrée contient uniquement `events`
(16 × 32 booléens), `voiceLengths` (16 valeurs null ou entiers 1–32),
`motifLength` (null ou entier 1–32). Le codec valide, sélectionne ces champs et
recrée des tableaux indépendants. Les états globaux et NEXT ne sont pas inclus.

`MotifBankFormat.mjs` est indépendant du disque : un futur Project pourra
embarquer ce même objet versionné. `MotifBankStorage.mjs` porte l'emplacement
et les écritures ; C.1 n'ajoute ni Project, ni dialogue, ni bouton SAVE.

## Autosave et temps réel

Les actions musicales et les changements de longueur signalent une banque
modifiée. Les changements réels de motif courant, y compris une transition
NEXT, signalent aussi l'ID à conserver. La notification ne fait que marquer
l'état et programmer un délai de regroupement de 350 ms. Elle ne sérialise
pas la banque et n'écrit pas dans le tick musical.

Après le délai, le renderer produit un snapshot validé, envoyé par IPC au
processus principal. Celui-ci sérialise et écrit via les API asynchrones du
filesystem, hors du worker MIDI. Les sauvegardes sont ordonnées ; le stockage
ignore un contenu identique à la dernière sauvegarde réussie. Les ticks sans
changement de motif, NEXT armé seul, les LEDs, SOLO/MUTE et les gestes sans
mutation ne produisent pas d'écriture disque.

La fermeture normale de la fenêtre est suspendue le temps de vider l'autosave,
y compris une écriture en cours et les changements arrivés pendant celle-ci.
Après confirmation, la fermeture habituelle reprend ; le contrôle de fermeture
Pad Configuration reste existant. En cas d'échec de sauvegarde à la fermeture,
la fenêtre reste ouverte et un diagnostic est écrit dans la console. Une
nouvelle édition ou fermeture permet de réessayer. Un arrêt forcé du processus
ne peut garantir les modifications encore en mémoire.

## Écriture et récupération

Écriture dans un fichier temporaire unique du même dossier, synchronisation
du fichier, fermeture, puis renommage sur `motif-bank.json`. Un échec avant
renommage laisse la dernière banque officielle intacte ; le temporaire est
nettoyé au mieux. Un temporaire laissé par un arrêt brutal n'est jamais chargé
comme banque officielle. La garantie de durabilité ultime dépend du système
de fichiers et du matériel.

Fichier absent : banque vide normale, Motif 01 courant, sans avertissement ni
écriture initiale inutile. JSON, version ou données invalides : fichier déplacé
vers `motif-bank.json.invalid-<UUID>`, diagnostic console et banque vide sûre.
Si la lecture ou la préservation échoue, les écritures sont bloquées pour ne
pas écraser le fichier problématique ; corriger le problème puis relancer.

Au redémarrage : banque et ID restaurés avant le premier rendu ; position 0,
NEXT null, transport STOP et vue PLAY selon les valeurs de démarrage existantes.
Le BOOK reflète naturellement EMPTY/DATA/ACTIVE lorsque la Bibliothèque est
ouverte. Aucune reprise automatique de lecture.

## Validation

131 tests réussis : codec/version/dimensions/plages, restauration indépendante,
fichier absent, corruption préservée, écriture atomique et échec de renommage,
coalescing, COPY/DELETE, current ID, flush en cours puis nouvelle mutation,
échec réessayable, absence de sauvegarde par tick/LED et rendu BOOK restauré.
Suite musicale existante conservée. Worker MIDI `2086927` inchangé.

Phase C.1 Persistence testée et approuvée sur hardware par Dan avant commit.
