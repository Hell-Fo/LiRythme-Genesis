# Windows Field Build #4 — 14 octobre 2026

Version portable Windows x64 de LiRythme Genesis.

Cette version retire les traces de console PLAYHEAD, BEAT et les rapports
de diagnostic de l'horloge. Les erreurs et la synchronisation sont conservées.
Le Soundcheck mémorise désormais le Launchpad sélectionné automatiquement
au démarrage lorsque la connexion réussit et qu'aucun choix n'est enregistré.

Construction : `npm.cmd run build:windows-portable -- 4`.
BUILD-MANIFEST.json indique le commit et les empreintes SHA-256.
Electron et les addons natifs installés sont réutilisés.

Copier tout le dossier `LiRythme-Genesis-1.0.0-field4-win32-x64` sur
l'ordinateur du studio, puis lancer `LiRythme-Genesis.exe`.
Tous les fichiers du dossier sont nécessaires. Les données utilisateur
restent dans le profil habituel et ne sont pas incluses dans la distribution.

Validation : 608 tests réussis ; transmission des pas natifs et quatre
scénarios de mémorisation du contrôleur vérifiés séparément.
À vérifier au studio : Launchpad disponible dans le Soundcheck et lecture
avec les sources d'horloge interne et MIDI utilisées habituellement.
