# Windows Field Build #7 - 22 octobre 2026

Version portable Windows x64 de LiRythme Genesis.

Cette livraison ajoute PLAY MODE au 11e pad A/T, dans les transformations :
A = Forward, B = Ping-pong, C = Backward. Les parcours sont independants pour
Motif et Modulation, sauvegardes avec les banques et suivis par le curseur.
En Chain, Backward termine sur le step 1 et Ping-pong joue son aller-retour
complet, dernier step 1 inclus, avant le clip suivant.

Pendant PLAY, SHIFT + clic court sur un motif de la Chain regle le Loop Point.
SHIFT maintenu + appui long (300 ms) selectionne le bloc actif ou suivant pour
le deplacer avec << / >>. Relacher le pad ne cree pas de Loop Point. Relacher
SHIFT termine la selection. La page PLAY identifie le bloc choisi en rouge gras,
sans fond de couleur, et suit son deplacement.

Le titre Selection garde sa couleur et son alignement avec Motif/Modulation,
et affiche le nom de l'A/T actif. Le footer reserve son 3e bloc aux etats
SOLO, MUTE, FREEZE, LOCK, COPY et DELETE et son 4e bloc au Book actif.

Construction : npm.cmd run build:windows-portable -- 7
Validation : npm.cmd run validate:release -- "dist/LiRythme-Genesis-1.0.0-field7-win32-x64"
La suite logicielle avant construction comporte 747 tests reussis.
La validation du portable verifie les empreintes des sources/assets et teste
le demarrage, les modules natifs, la persistance et la fermeture avec un profil isole.

Copier tout le dossier LiRythme-Genesis-1.0.0-field7-win32-x64, puis lancer
LiRythme-Genesis.exe. Tous les fichiers du dossier sont necessaires.
BUILD-MANIFEST.json contient le commit source et les empreintes SHA-256.
Les donnees utilisateur ne sont pas incluses. Les samples WAV restent externes.

A verifier au studio : transitions Chain dans les trois parcours, selection
SHIFT court/long puis deplacement du bloc actif et du suivant, affichage rouge
gras sur PLAY et suivi du curseur pendant l'edition avec les horloges habituelles.
