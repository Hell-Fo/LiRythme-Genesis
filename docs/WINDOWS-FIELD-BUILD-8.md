# Windows Field Build #8 — 26 octobre 2026

Version portable Windows x64 de LiRythme Genesis.

La page PLAY organise les quatre cases du pied de page ainsi :
1. Nom du projet et description.
2. États actifs : Solo, Mute, Freeze, Lock, Copy, Delete, Mutation, Groove Morph et Euclidien.
3. Book actif.
4. Root note, Scale et clavier d'une octave (C à B).

Le clavier suit la gamme sélectionnée : fondamentale orange, autres notes de
la gamme bleues. La description du projet est visible dans le pied de page.
Le guide HELP inclut le mémo HotKeys et combinaisons.

Construction : `npm.cmd run build:windows-portable -- 8`
Validation : `npm.cmd run validate:release -- "dist/LiRythme-Genesis-1.0.0-field8-win32-x64"`

Extraire l'archive entière, puis lancer `LiRythme-Genesis.exe`.
Tous les fichiers du dossier sont nécessaires. `BUILD-MANIFEST.json` identifie
le commit source et les empreintes SHA-256 des fichiers livrés.
Les données utilisateur ne sont pas incluses ; les samples WAV restent externes.

À vérifier au studio : les quatre cases du pied de page, le changement de
projet et de description, les états Copy/Delete/Mutation et les notes colorées
après changement de fondamentale ou de gamme dans SETTINGS.
