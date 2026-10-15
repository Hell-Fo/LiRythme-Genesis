# Windows Field Build #5 — 15 octobre 2026

Version portable Windows x64 de LiRythme Genesis.

Cette version ajoute le Book Projets accessible par SHIFT + SWITCH : 16 projets,
banques Motif et Modulation, Chains, réglages KeyGroup et configuration complète
des pads sauvegardés automatiquement. Un nouveau projet conserve les pads chargés.
Le nom et la description se modifient dans Settings. La description apparaît
en bas de la colonne Sélection de Play uniquement en mode settings/projet.

Inclut aussi la page Help et le déplacement des maillons de Chain pendant PLAY.

Construction : `npm.cmd run build:windows-portable -- 5`.
BUILD-MANIFEST.json indique le commit et les empreintes SHA-256.
Electron et les addons natifs installés sont réutilisés.

Copier tout le dossier `LiRythme-Genesis-1.0.0-field5-win32-x64` sur
l’ordinateur du studio, puis lancer `LiRythme-Genesis.exe`.
Tous les fichiers du dossier sont nécessaires. Les données utilisateur
restent dans le profil habituel et ne sont pas incluses dans la distribution.
Les samples WAV restent externes ; les projets conservent leurs chemins.

Validation avant construction : 632 tests réussis.
À vérifier au studio : clavier Root et Scale Up/Down, Copy/Delete des projets,
restauration des assignations de pads, lecture avec les horloges habituelles.
