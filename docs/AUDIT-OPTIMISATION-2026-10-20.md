# Revue du projet — fiabilité et optimisation

Date : 20 octobre 2026. Base Git : `c40abb0`, avec les modifications locales présentes au moment de la revue, notamment les corrections Chain et les fonctions CYCLE/MIDI CC. L'essai MICROTIMING a été retiré avant cet audit.

**Suivi :** les corrections et mesures postérieures sont décrites dans [Optimisations appliquées](OPTIMISATION-2026-10-20.md). Le présent document conserve les constats et mesures avant modification.

## Conclusion

Le projet justifie des corrections ciblées, pas une réécriture. Le moteur dispose déjà de protections utiles et d'une suite importante de tests. Les priorités sont la garantie de sauvegarde à la fermeture, la gestion des Note Off entre deux Steps et le coût des sauvegardes de plusieurs projets pendant la lecture.

Deux défauts logiciels ont été reproduits avec des dépendances simulées. Un coût significatif de préparation des sauvegardes a été mesuré. Leur incidence exacte sur les ports MIDI et sur une session Electron reste à mesurer sur le matériel.

| Priorité | Constat | Niveau de preuve |
| --- | --- | --- |
| P1 | Un `flush()` de fermeture peut se terminer avant la dernière écriture | Reproduit avec deux sauvegardes différées |
| P1 | Un ancien Note Off peut suivre le Note On du Step suivant | Ordre des messages reproduit dans le dispatch réel |
| P1 | Le snapshot de 16 projets denses occupe le fil de l'interface environ 152 ms | Mesuré sous Node, cinq passages |
| P2 | Le routage des gestes est difficile à maintenir et se modifie à plusieurs endroits | Lecture du code et régressions récentes |
| P2 | GROOVE MORPH recalcule sa clé de cache plusieurs fois au premier Step | Chemin de code identifié ; coût à profiler |
| P2 | La file de commandes du processus principal n'est pas bornée lorsque l'utilitaire MIDI est indisponible | Lecture du code ; panne prolongée non reproduite |
| P2 | La suite par défaut ne valide pas l'application Electron empaquetée | Vérifié dans les scripts de test |
| P3 | GATE réécrit son texte et sa couleur à chaque rendu, même sans changement | 1 001 rendus inchangés : 1 001 affectations de chaque propriété |

P1 : à traiter avant une nouvelle extension importante. P2 : réduction des risques et des coûts récurrents. P3 : amélioration locale à faible enjeu.

## Périmètre et méthode

Revue transversale des états, actions, transactions A/T, commandes Launchpad, projections PLAY, projets, persistance, dispatch audio/MIDI, worker d'horloge, ponts IPC et scripts de livraison. Lecture des investigations existantes, notamment [l'incident polymétrique et la régression LED](POLYMETRIC-HARDWARE-INVESTIGATION.md).

Il ne s'agit pas d'une vérification exhaustive de chaque ligne ni d'un audit de sécurité. Aucun changement fonctionnel n'a été effectué pendant cette revue.

Vérifications réalisées :

- Suite complète définie dans `package.json` : **680 tests réussis, aucun échec**, environ 4,47 s lors de la mesure.
- Reproductions en mémoire avec les modules du projet et des horloges/promesses contrôlées.
- Extraction de `triggerMotifStep` depuis `app.js`, comme dans plusieurs tests existants, pour observer les messages produits.
- Mesures de `snapshotMotifBank`, sans écriture de fichier utilisateur.
- Comptage des affectations du rendu GATE avec un document simulé.

Non réalisés : capture physique MIDI, profilage Chrome/Electron, mesures de jitter en boucle matérielle, nouveau build portable, test de reconnexion USB et session longue. Les résultats ci-dessous ne permettent donc pas d'affirmer un gain de jitter ou une perte de données effectivement survenue chez l'utilisateur.

## 1. Garantir la fin de toutes les sauvegardes avant la fermeture — P1

**Sources :** [MotifBankAutosave.mjs](../src/MotifBankAutosave.mjs), lignes 16–28 ; [preload.js](../preload.js), ligne 11 ; [main.js](../main.js), lignes 136–140 et 360.

`flush()` attend la promesse `inFlight` qu'il trouve à son entrée. Deux appels peuvent attendre la même première écriture. À sa résolution, le premier appel commence une seconde sauvegarde et remet `dirty` à `false`. Le second appel peut alors sortir, alors que cette seconde écriture attend toujours.

Reproduction :

1. Modifier la banque et démarrer un premier `flush()` ; conserver sa sauvegarde en attente.
2. Modifier à nouveau la banque et appeler le `flush()` de fermeture.
3. Terminer seulement la première sauvegarde.
4. Observer que deux sauvegardes ont commencé et que le `flush()` de fermeture est déjà résolu, bien que la seconde sauvegarde soit encore bloquée.

Le snapshot de la seconde sauvegarde contient bien la dernière modification. Le défaut porte sur l'attente de sa fin. Le preload peut ainsi annoncer une sauvegarde terminée trop tôt. Le gestionnaire `window-all-closed` attend l'arrêt MIDI, mais n'attend pas explicitement la file de stockage : il existe un risque à la fermeture, sans preuve ici d'une perte réelle sur disque.

**Correction proposée :** partager une seule promesse représentant toute la boucle de vidage, jusqu'à ce qu'il n'y ait plus de modification à sauver. Ajouter aussi une attente explicite de la file de stockage dans le cycle de fermeture comme protection complémentaire.

**Validation attendue :** retarder séparément les deux écritures et vérifier que le seul appel de fermeture ne se résout pas avant la seconde. Le test existant « shutdown flush awaits in-flight save » attend les deux appels avec `Promise.all` et ne retarde que la première écriture ; il ne détecte pas ce cas.

## 2. Empêcher un ancien Note Off de couper la note suivante — P1

**Source :** [app.js](../src/app.js), lignes 669 et 719–736.

`releasePrevious` est local à un appel de `triggerMotifStep`. Il protège les répétitions RATCHET à l'intérieur de cet appel, mais pas les répétitions du même pitch dans deux Steps successifs. Chaque Note Off reste programmé avec `setTimeout`.

Avec une Voice KEY GROUP, GATE 100 %, deux Steps jouant la même note, puis une livraison tardive du premier timer, le dispatch réel produit :

```text
Note On  canal 1, note 60, vélocité 100  — premier Step
Note On  canal 1, note 60, vélocité 100  — Step suivant
Note Off canal 1, note 60               — ancien timer
```

Cet ordre peut écourter la seconde note. La reproduction confirme l'ordre côté application, pas le résultat sonore d'un synthétiseur donné. La priorité Note Off du worker ne corrige pas un message qui lui parvient seulement après le nouveau Note On.

**Correction proposée :** gérer la durée de vie des notes au-delà d'un seul Step, avec un identifiant de génération et une politique explicite de répétition. Tenir compte du port, du canal, du pitch et des Voices qui partagent une note ; une simple table par numéro de Voice ne couvre pas tous les cas.

**Validation attendue :** timers Note Off volontairement retardés, GATE 100 %, deux Steps consécutifs, RATCHET, pitches partagés, STOP/PAUSE et changement de port. Préserver l'envoi des Note Off nécessaires lors de l'annulation des futurs Note On.

## 3. Réduire le travail synchrone des sauvegardes de projets — P1

**Sources :** [MotifBankAutosave.mjs](../src/MotifBankAutosave.mjs), ligne 23 ; [MotifBankFormat.mjs](../src/MotifBankFormat.mjs), lignes 69–104 ; [MotifBankStorage.mjs](../src/MotifBankStorage.mjs), ligne 39.

L'écriture du fichier est asynchrone, mais la préparation du snapshot est synchrone dans le renderer. Elle clone le Book de projets, valide et clone la banque active, puis valide et clone le document complet, dont les banques de projets. Le stockage revalide ensuite la donnée reçue.

Scénario mesuré : 16 Motifs de 16 Voices × 32 Steps, événements actifs, matrices VELOCITY, COLOR, SWING et RATCHET complètes ; comparaison sans Book puis avec 16 projets contenant cette banque. Cinq passages par scénario, avec les dépendances par défaut du modèle.

| Préparation du snapshot | Minimum | Médiane | Maximum |
| --- | ---: | ---: | ---: |
| Banque sans Book de projets | 1,07 ms | 1,60 ms | 2,40 ms |
| Book de 16 projets denses | 142,60 ms | 151,52 ms | 172,98 ms |

Le document du second scénario représente **3 768 925 octets** en JSON. Ces mesures excluent la sérialisation IPC, l'écriture disque et le processus Electron. Elles dépendent de cette machine et du jeu de données synthétique.

Comme les déclenchements audio et une partie du dispatch MIDI passent par le renderer, ce travail peut retarder les notes et les gestes. Le worker natif peut continuer à émettre F8 : une horloge physique régulière ne garantit donc pas que les notes issues du renderer restent régulières.

**Correction proposée :** mesurer d'abord le cas dans Electron, éviter les copies répétées des projets inactifs avec des révisions explicites, puis préparer la persistance à partir de snapshots immuables. Déplacer validation/sérialisation hors du renderer quand c'est possible, sans retirer la validation à l'entrée du stockage. Ne pas simplement reporter toute sauvegarde à l'arrêt : cela agrandirait la fenêtre de modifications non sauvegardées.

**Validation attendue :** durées médiane/p95/max pour 1, 8 et 16 projets, lecture simultanée, gestes A/T, fermeture pendant sauvegarde, égalité des banques restaurées et mesure physique des notes.

## 4. Rendre explicite la priorité des gestes — P2

**Sources :** [LaunchpadMini.js](../src/hardware/launchpad/LaunchpadMini.js), notamment `handleATInput` et `handleControllerMessage` ; [ProjectBook.mjs](../src/ProjectBook.mjs), lignes 86–108.

`LaunchpadMini.js` compte environ **2 432 lignes**, `LiRythmeActions.js` **1 104** et `ATTransaction.mjs` **557**. La taille seule n'est pas un défaut : le risque vient des commandes, timers, consommations de relâchement et priorités qui s'entrecroisent. Le mode Projets remplace en outre des méthodes du contrôleur à l'exécution.

Les corrections récentes SHIFT/Chain/A/T montrent un risque concret de collision. Un changement peut fonctionner isolément et détourner un geste d'un autre contexte.

**Amélioration proposée :** écrire une table des propriétaires d'entrées selon la vue, le transport et le mode, puis extraire progressivement le routage, les gestes Chain et le rendu LED derrière la façade actuelle. Chaque geste doit posséder sa pression et son relâchement, même si SHIFT est relâché avant le pad.

**Validation attendue :** table de scénarios couvrant les deux systèmes, PLAY/bibliothèque, STOP/PAUSE/PLAY, A/T actif, COPY/DELETE, Projets et les deux ordres de relâchement. Conserver les tests métier existants ; déplacer la logique par petits lots.

## 5. Éviter les clés de cache répétées à l'entrée GROOVE MORPH — P2

**Source :** [LiRythmeState.js](../src/LiRythmeState.js), `getOccurrenceMotif`, lignes 269–292.

Le chemin rapide du cache n'est utilisé en PLAY que lorsque `playheadPosition > 0`. À la position zéro, chaque appel reconstruit une clé JSON des voisins et de la recette. Les lectures par Voice peuvent donc répéter ce travail au même début d'occurrence, même si la composition est déjà disponible.

**Amélioration proposée :** profiler ce point puis indexer le cache sur une révision d'entrée et des sources. Invalider aux mêmes moments musicaux qu'aujourd'hui : les éditions doivent continuer à prendre effet à l'entrée prévue, sans modifier une occurrence déjà engagée.

**Validation attendue :** compter les sérialisations et compositions par entrée avec 16 Voices ; comparer les événements avant/après, y compris deux occurrences identiques et une édition des voisins pendant la lecture. Aucun retard physique n'a été mesuré ici pour ce chemin.

## 6. Borner la file IPC en cas d'indisponibilité MIDI — P2

**Source :** [main.js](../main.js), `midiClockCommandQueue` et `sendMidiClockCommand`, lignes 144 et 253–260.

Lorsque l'utilitaire MIDI n'est pas prêt ou n'existe plus, les commandes sont ajoutées à une liste sans limite explicite à cet endroit. Cela contraste avec les files de notes bornées à 256 messages dans le worker et l'utilitaire. Une indisponibilité prolongée accompagnée de gestes ou de rendus peut faire grossir cette file. Ce scénario de panne n'a pas été exécuté durant la revue.

**Amélioration proposée :** définir les états démarrage/prêt/échec, une limite et une politique par type de commande. Fusionner les états visuels périmés ; traiter STOP et la libération des notes explicitement ; ne pas rejouer aveuglément de vieux Note On après reconnexion.

**Validation attendue :** utilitaire absent, démarrage retardé, sortie inattendue puis reconnexion. Vérifier mémoire bornée, absence de rafale musicale ancienne et retour d'état compréhensible.

## 7. Compléter les tests par une validation de l'application livrée — P2

**Sources :** [package.json](../package.json), [test-windows-portable.mjs](../scripts/test-windows-portable.mjs), ligne 10 ; [build-windows-portable.mjs](../scripts/build-windows-portable.mjs).

Les 680 tests sont une base solide. Plusieurs scénarios exécutent les modules avec ports, timers ou DOM simulés ; certains extraient une fonction de `app.js`. Ils ne couvrent pas à eux seuls l'ensemble renderer → IPC → utilitaire → driver → matériel.

Un smoke test portable existe, mais ne fait pas partie de `npm test` et vise par défaut `field1`. Il faut lui fournir explicitement le build à valider. Le numéro de version du package est également insuffisant pour identifier les nombreuses modifications locales de cette revue.

**Amélioration proposée :** garder la suite rapide, ajouter une commande de validation de livraison qui reçoit le chemin du nouvel artefact, et joindre commit, état local et résultats de smoke test à chaque build. Prévoir une fiche hardware courte : 4/7/5/32, Chain avec répétitions et Loop Point, RATCHET/SWING/GATE 100 %, USB débranché/rebranché et fermeture pendant sauvegarde.

**Validation attendue :** lancement et fermeture du portable avec un profil temporaire, restauration des projets, chargement des modules natifs, puis essai sur le matériel. Aucun nouveau portable n'a été construit pendant cet audit.

## 8. Limiter les affectations DOM GATE inchangées — P3

**Sources :** [PlayStatusUI.mjs](../src/PlayStatusUI.mjs), lignes 46–59 ; [app.js](../src/app.js), lignes 67–71.

La boucle d'observation fonctionne par `requestAnimationFrame`. Les champs généraux évitent les affectations identiques, mais le libellé GATE et sa couleur sont réaffectés à chaque rendu. Dans une simulation de 1 001 rendus sans changement, on obtient 1 001 affectations de texte et 1 001 de couleur.

**Amélioration proposée :** comparer les valeurs avant affectation et conserver la palette hors de la fonction de rendu. Ensuite seulement, mesurer l'intérêt de réduire les projections des panneaux masqués. Ne pas suspendre la lecture musicale lorsque l'interface est masquée.

C'est une optimisation simple, mais son impact CPU réel n'a pas été mesuré dans Chromium. Elle passe après les trois priorités P1.

## Protections à conserver

- **Horloge native séparée** et contrôle des révisions/séquences pour rejeter des ticks périmés.
- **Files MIDI bornées**, priorité aux Note Off et marge de 2 ms vérifiée avant les envois autour des pulses. L'incident déjà résolu ne justifie pas de modifier ces valeurs sans nouvelle mesure matérielle.
- **Trafic LED fusionné et différé**, avec lots de quatre et délai de 4 ms. Les probes actuels confirment encore la fusion ; leurs temps CPU et comptes de messages simulés ne sont pas une mesure de jitter physique.
- **Snapshots de lecture engagée**, séparés des éditions, pour préserver les phases pendant DOUBLE/ROTATION et les transitions.
- **Sauvegarde par fichier temporaire**, synchronisation puis renommage ; conservation des banques invalides et blocage des écritures en cas de lecture impossible.
- **Géométrie des cadrans bornée** : les grands PPCM deviennent des anneaux et ne génèrent pas un élément par Step. Aucun besoin constaté de plafonner les durées musicales pour alléger cet affichage.

## Ordre de travail recommandé

1. Corriger l'attente de fermeture avec un test où les deux sauvegardes sont retardées.
2. Corriger la durée de vie des notes entre Steps et vérifier GATE 100 % sur le synthétiseur.
3. Profiler et alléger les snapshots de projets en conservant l'intégrité de la sauvegarde.
4. Stabiliser la table des gestes, puis extraire progressivement le routage et les rendus.
5. Renforcer les scénarios de panne MIDI et la validation du portable.
6. Traiter les petits coûts UI et les caches mesurés.

Chaque lot devrait rester indépendant, avec comparaison des événements musicaux et validation matérielle lorsque le timing ou le routage MIDI change. Le nombre de lignes supprimées ne constitue pas un critère de réussite ; les critères sont la fiabilité de sauvegarde, l'ordre des notes, la durée des tâches du renderer et le comportement observable de l'instrument.
