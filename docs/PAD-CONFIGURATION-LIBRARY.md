# Bibliothèque de Pad Configurations

La bibliothèque est validée par Daniel. L'édition intégrée est maintenant décrite
dans [Integrated Pad Configuration Editor](INTEGRATED-PAD-CONFIGURATION-EDITOR.md).
Ce rapport conserve l'historique de la bibliothèque ; ses mentions d'un panneau
en lecture seule sont remplacées par le nouvel éditeur NONE/MIDI DRUM.

## Vérification des slots VOICE 01–16

Suite au signalement concernant VOICE 04 (FM Drum, canal 10, note 45) et VOICE 07
(Cow Bell, canal 10, note 42), vérification du parseur, du mapping Launchpad,
des actions d'édition du Motif et de la fonction réelle de playback : aucune plage
fixe 09–16 trouvée dans ces chemins. Les 16 positions sont déjà prises en compte.
Daniel a confirmé que VOICE 04 et VOICE 07 jouent correctement : le signalement
de silence provenait d'une erreur de test. Aucun bug de playback sur ces slots.

Présentation finale : les 16 boutons SETTINGS affichent uniquement le nom non vide
de la Voice, sinon uniquement son numéro sur deux chiffres (01–16). Exemples :
« FM Drum », « Cow Bell », « 03 ». Aucun préfixe VOICE, aucun suffixe de type.
Les identifiants JSON et internes restent inchangés, avec rafraîchissement immédiat
de l'affichage après activation. La sélection
SETTINGS reste une inspection, indépendante de la sélection musicale Launchpad.

Un test parcourt les 16 pads physiques, sélectionne chaque Voice, crée un événement
dans son Motif puis vérifie les Note On/Off et le feedback de la fonction réelle
`triggerMotifStep` avec sorties MIDI simulées. Il inclut les notes 45/42 des slots
04/07. Le test SETTINGS vérifie également leurs noms et paramètres après chargement.
53 tests réussis. Aucun changement du format JSON ni du routage musical.

Pour confirmer sur matériel : sélectionner le preset « DrumBrute all 10 », utiliser
« Recharger la version sauvegardée » si le fichier a été modifié après sa sélection,
vérifier les noms et paramètres en SETTINGS. Sur le bloc INSTRUMENTS Launchpad 4×4,
VOICE 04 = première rangée, quatrième colonne (note contrôleur 67) ; VOICE 07 = deuxième
rangée, troisième colonne (note contrôleur 82). Sélectionner le pad puis ajouter
des steps au Motif et lancer PLAY. Le simple clic d'inspection dans SETTINGS ne crée
pas d'événement et ne joue pas la Voice. Le fonctionnement musical des slots 04/07
est confirmé par Daniel ; le raffinement des boutons ne modifie pas le playback.

Implémentation sans commit, en attente de validation Electron/hardware. Ce rapport
décrit le workflow actuel et remplace les descriptions LOAD/SAVE AS du rapport
historique Phase B/B.1. Aucune association Projet ↔ Pad Configuration.

## Utilisation

SETTINGS affiche un menu « Configuration active », EDIT et NEW. Le menu ⋯ contient
DUPLICATE, IMPORT…, Actualiser la bibliothèque et Recharger la version sauvegardée.
Le chemin du dossier et celui du fichier actif sont consultables dans ce menu,
sans occuper le workflow principal.

Le dossier dédié est `Documents/LiRythme/Pad Configurations`, où Documents est
résolu par Electron (`app.getPath("documents")`, y compris une éventuelle redirection
Windows). Les presets sont des fichiers ordinaires `.lirythme-pads.json`. Le menu
est construit à partir des fichiers valides directement présents dans ce dossier.
Les sous-dossiers ne sont pas parcourus ; les liens symboliques ne sont pas suivis.
Les fichiers invalides sont exclus de la liste et signalés avec leur nom et le
diagnostic complet de Phase B. Une erreur n'empêche pas les autres presets d'apparaître.

La liste est actualisée au démarrage et après une opération réussie/annulée.
Après un ajout ou une modification à la main, utiliser ⋯ → Actualiser la bibliothèque.
Pas de watcher filesystem ni de rechargement musical automatique en cours d'utilisation.
Les noms identiques sont distingués par leur nom de fichier. Un nom JSON vide est
affiché « (Sans nom) » sans modifier le contenu du fichier.

## Première utilisation et migration

Au premier démarrage sans préférence, LiRythme matérialise la configuration DrumBrute
de compatibilité dans `DrumBrute Impact.lirythme-pads.json` dans la bibliothèque.
Le contenu provient de l'exemple de compatibilité existant ; aucun profil matériel
n'est modifié. Une version valide déjà présente à cet emplacement est conservée.

Si la dernière configuration B.1 est externe à la bibliothèque, LiRythme la valide,
la copie dans la bibliothèque puis l'active. Après activation acceptée, la préférence
pointe vers cette copie : les changements ultérieurs du fichier externe sont indépendants.
Les autres fichiers externes Phase B peuvent être ajoutés avec IMPORT.

Le chemin actif reste une préférence d'application, dans
`app.getPath("userData")/pad-configuration-preferences.json`. Aucun champ de bibliothèque,
identifiant interne, chemin ou préférence n'est ajouté au format musical version 1.
La préférence est mise à jour seulement après activation acceptée ou SAVE réussi.
Un fichier lu mais refusé pendant PLAY ne devient jamais le dernier preset actif.

Au redémarrage, le dernier fichier est relu et entièrement validé, puis activé avant
la connexion des commandes de transport/entrées MIDI. Le menu et le fichier actif
correspondent à ce contenu. Si le dernier fichier est absent/invalide, un avertissement
est affiché et un fichier DrumBrute de secours est utilisé. Si le fichier de base
est lui-même invalide, il est préservé et une nouvelle copie valide est créée.
Le secours effectivement activé devient alors le dernier preset utilisé.

Si le dossier ne peut pas être créé/lu/écrit, l'application conserve explicitement
la compatibilité en mémoire et affiche « secours en mémoire, non sauvegardé » avec
l'erreur. Elle ne prétend pas avoir un preset disque actif. C'est un mode dégradé,
pas un état normal ambigu. Aucune application ne peut garantir un fichier sauvegardé
quand le disque ou les permissions l'interdisent.

## Sélection et opérations

- Sélection : relecture du fichier sélectionné, validation Phase B, contrôle final
  STOP/PAUSE, puis remplacement atomique de `state.padConfiguration` uniquement.
  Le menu conserve la sélection précédente pendant la lecture et après un échec.
- NEW : saisie d'un nom, création d'un fichier contenant exactement 16 Voices NONE,
  puis activation. Aucun événement du Motif n'est supprimé ; NONE reste silencieux.
- DUPLICATE : copie du contenu actuellement en mémoire, y compris ses modifications,
  sous un nouveau nom, puis activation. L'original reste inchangé. Les noms saisis
  pour NEW/DUPLICATE doivent contenir 1–120 caractères après retrait des espaces de bord.
- IMPORT : dialogue natif, validation du fichier externe, copie indépendante, puis
  activation. Le dernier dossier d'importation est mémorisé. S'il disparaît, repli
  vers Documents. Une annulation n'ajoute aucun fichier. Un fichier invalide ne crée
  aucune entrée et conserve l'état musical et le dernier preset actif.
- EDIT : affiche le panneau des 16 Voices existant et une indication explicite
  qu'il est en lecture seule. L'éditeur intégré MIDI/Audio n'est pas développé ici.
  Pour l'instant, l'édition externe suivie d'un rechargement reste possible.

Les créations/imports utilisent un nom de fichier dérivé du nom du preset, raccourci
et nettoyé, suivi d'un UUID. Deux presets de même nom restent indépendants ; aucune
création ne remplace un fichier préexistant. IMPORT conserve les noms JSON Phase B
sans restriction nouvelle, même vides ou longs. Le contenu est resérialisé proprement
en UTF-8 sans BOM, indentation de deux espaces ; les données sont conservées, mais
pas l'espacement original ni l'ordre original des clés.

Les changements sont refusés dès le départ en PLAY et vérifiés à nouveau après
tous les appels asynchrones. Si PLAY débute pendant une création/importation, le
fichier créé reste disponible sur disque mais n'est pas activé ; actualiser la liste
puis le sélectionner en STOP/PAUSE. Aucun rollback destructif ni bascule live ajouté.

## Modifications non sauvegardées et changements externes

Le contenu canonique en mémoire est comparé au dernier instantané chargé/sauvegardé.
Une différence affiche `Nom *`, le texte « Modifications non sauvegardées » et SAVE.
Cette infrastructure est prête pour un futur éditeur ; aucun éditeur fictif n'est ajouté.

Un changement de preset ou NEW/IMPORT est refusé tant que l'état est modifié : SAVE
ou DUPLICATE permet de le conserver. « Recharger la version sauvegardée » demande
confirmation avant d'abandonner les modifications. Une sauvegarde échouée conserve
l'astérisque. Des modifications intervenant pendant une sauvegarde restent marquées.

Après actualisation, si le fichier actif a changé sur disque, le menu continue
d'afficher le nom réellement actif en mémoire et ajoute « fichier modifié sur disque ».
S'il est absent/invalide, l'entrée active reste identifiable mais indique son absence
de la liste. SAVE compare le contenu disque au dernier instantané et refuse d'écraser
un changement externe connu. DUPLICATE permet de sauver une variante indépendante.
Le contrôle puis l'écriture ne constituent pas un verrou interprocessus : une édition
externe exactement entre ces opérations reste une limite, comme tout fichier partagé.

## Sécurité et architecture

- `PadConfigurationLibrary.cjs` : service de fichiers indépendant de l'état musical,
  du transport et du futur Project ; bibliothèque, création, import, copie, sauvegarde.
- `PadLibrarySession.mjs` : état de session renderer, sélection atomique, état modifié,
  contrôles de transport et confirmation d'activation pour la persistance.
- `PadLibraryUI.js` : menu et actions SETTINGS. Aucun accès filesystem.
- IPC : sender et frame principale vérifiés ; opérations sérialisées ; API dédiée.
  Les sélections/sauvegardes utilisent des jetons opaques connus du main, jamais
  un chemin arbitraire fourni par le renderer. IMPORT lit seulement le choix du dialogue.
- Écriture : temporaire exclusif dans le même dossier, synchronisation et fermeture.
  SAVE utilise le remplacement existant. Une création publie par lien physique
  exclusif puis retire le temporaire pour garantir qu'aucune cible n'est écrasée.
  Cette publication nécessite le support des liens physiques du filesystem
  (normal sur NTFS). Sinon, une erreur est affichée ; aucun succès n'est annoncé.
  Un arrêt brutal peut laisser un temporaire. Pas de garantie contre panne électrique.
- Parseur, contrôle des doublons et validation du format Phase B inchangés.
  Seul le message d'activation remplace la référence à LOAD par « sélection ».
- Motif, longueurs, playhead, cycles, Note Off, SoundCheck et Clock Engine inchangés.
  Aucun MIDI/AUDIO supplémentaire, multi-output ou lien Project ajouté.

## Fichiers

Ajoutés pour la bibliothèque : `src/PadConfigurationLibrary.cjs`,
`src/PadLibrarySession.mjs`, `src/PadLibraryUI.js`,
`scripts/test-pad-library.mjs`, ce rapport.

Modifiés : `main.js`, `preload.js`, `index.html`, `src/SettingsUI.js`,
`src/PadConfigurationStorage.cjs`, `src/PadConfigurationFile.mjs`,
`scripts/test-pad-configuration.mjs`, `package.json` et le rapport historique.

Les changements B.1 déjà présents et non commités sont conservés :
`src/PadConfigurationPreferences.cjs`, attente de restauration dans `src/app.js`,
tests des préférences et notes B.1. Aucun commit n'a été créé pour cette évolution.

## Tests automatisés et test manuel

Commande : `npm.cmd test`. La suite Phase B/B.1 est exécutée avec le test SETTINGS
adapté au nouveau menu ; la suite bibliothèque ajoute démarrage/migration/persistance,
NEW/DUPLICATE/IMPORT, Unicode/BOM et noms Phase B, ajouts manuels, erreurs/absence,
copies indépendantes, publication exclusive, conflits externes, sélection STOP/PAUSE,
refus PLAY et course asynchrone, état modifié, SAVE et erreurs, sécurité IPC,
annulation d'IMPORT et mémorisation de son dossier. Les APIs MIDI et DOM sont simulées
dans les tests correspondants ; les tests filesystem utilisent de vrais dossiers temporaires.

Contrôles syntaxiques des fichiers JS/CJS/MJS modifiés et `git diff --check`.
Les tests Electron/hardware sont laissés à Daniel, comme demandé.

1. Démarrer : vérifier preset actif, vrai fichier dans ⋯, restauration B.1 et SoundCheck.
2. En STOP, DUPLICATE → « DrumBrute Impact TEST ». Vérifier le nouvel élément et le
   fichier indépendant. Redémarrer : ce preset doit rester sélectionné.
3. NEW → « Test NONE ». Vérifier les 16 NONE, le Motif inchangé et le silence attendu.
   EDIT doit indiquer honnêtement la limite actuelle et montrer les Voices.
4. IMPORT du fichier Cowbell Phase B : vérifier VOICE 16 note 42. Modifier la source
   externe : la copie de bibliothèque ne doit pas changer. Vérifier annulation et
   réouverture dans le dernier dossier visité.
5. Ajouter un fichier valide à la main au dossier ; Actualiser, sélectionner, jouer.
   Modifier son fichier, Actualiser : indication disque, puis Recharger pour activer.
6. Pendant PLAY, tenter une autre sélection : ancien preset affiché et actif, Motif
   et transport inchangés. PAUSE puis sélectionner : activation correcte.
7. Tester JSON invalide, doublon VOICE, canal 17 et DEVICE via IMPORT et dans le dossier.
   Vérifier diagnostics précis, aucun remplacement de la configuration active.
8. Supprimer/renommer le dernier fichier, redémarrer : secours identifié par un vrai
   fichier et message explicite. Recharger le DrumBrute original et vérifier le jeu.
9. L'astérisque, SAVE, protection contre perte et abandon sont couverts automatiquement
   par mutations simulées ; leur test utilisateur complet accompagnera le futur éditeur.

STOP après implémentation et rapport ; aucun commit avant validation.
