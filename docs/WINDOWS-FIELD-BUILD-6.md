# Windows Field Build #6 — 21 octobre 2026

Version portable Windows x64 de LiRythme Genesis.

Cette livraison inclut FLAM dans Motif et Modulation : A–H donnent 100, 75,
50, 35, 20, 10, 5 et 0 ms. Appliquer à tout le Motif ou sélectionner des Voices
et des Steps. Les Voices simultanées participantes sont décalées dans leur ordre.
La limite d'étalement utilise maintenant l'espace restant dans le Step, avec
une marge de 2 ms ; deux Voices à 100 ms, 120 BPM, résolution 16, sans SWING ni
RATCHET jouent à 0 et +100 ms. Modulation peut remplacer le FLAM du Motif,
y compris par 0. Les anciennes valeurs sauvegardées restent lisibles.

Inclut aussi CYCLE, les Voices MIDI CC, les corrections d'édition/Chain et
les optimisations de sauvegarde, de routage A/T et de livraison. Le registre
Note Off commun et l'ordre de livraison du worker corrigent les notes
suspendues signalées avec KEY GROUP, Chain et Modulation.

Construction : `npm.cmd run build:windows-portable -- 6`.

Validation : `npm.cmd run validate:release -- "dist/LiRythme-Genesis-1.0.0-field6-win32-x64"`.
Cette commande vérifie les empreintes des sources/assets, exécute la suite
logicielle et teste le portable avec un profil isolé. Avant cette livraison,
la suite logicielle comporte 712 tests réussis. Les mesures de timing des tests
ne constituent pas une mesure physique MIDI.

Copier tout le dossier `LiRythme-Genesis-1.0.0-field6-win32-x64` et lancer
`LiRythme-Genesis.exe`. Tous les fichiers du dossier sont nécessaires.
BUILD-MANIFEST.json indique le commit source, son état Git et les empreintes
SHA-256. Electron et les addons natifs installés sont réutilisés.

Les données utilisateur restent dans le profil habituel et ne sont pas incluses
dans la distribution. Les samples WAV restent externes.

À vérifier au studio : FLAM appliqué au Motif entier avec deux Voices au même
Step, puis avec SWING/RATCHET et les horloges habituelles ; KEY GROUP à GATE
100 % en Chain avec Modulation ; restauration et fermeture pendant sauvegarde.
