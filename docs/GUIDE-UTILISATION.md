# LiRythme — Guide d’utilisation

**Genesis · Édition du 8 octobre 2026**  
Guide pratique pour jouer au Launchpad Mini, créer des rythmes et les faire évoluer.

Ce guide décrit la version actuelle, incluant RATCHET et Mutation. Les numéros
de Steps commencent à 1. Un appui long correspond à environ **300 ms** pour
les gestes de confirmation décrits ici.

### Parcours de lecture

Dans l’application, **HELP (H)** ouvre ce guide : choisir un sujet dans le
sommaire ou saisir des mots dans le champ de recherche. Les articles concernés
s’affichent pendant la saisie, sans distinction d’accents ou de majuscules.
Effacer la recherche restitue le sommaire ; **PLAY (P)** ou **SETTINGS (S)**
permet de revenir aux autres pages, sans changer le transport. Les raccourcis
sont suspendus pendant la saisie. L’option Help au démarrage ouvre directement
cette page lorsqu’elle est cochée.

- Pour commencer : sections 1 à 4 — principes, surface, sons et première boucle.
- Pour enrichir le jeu : sections 5 à 7 — A/T, Modulation et Mutation.
- Pour organiser une performance : sections 8 à 10 — Chain, copies et SOLO/MUTE.
- Pour comprendre le résultat : sections 11 et 12 — activation, cadrans et sauvegarde.
- Pour expérimenter et dépanner : sections 13 à 15 — exercices, repères et suite du projet.

## 1. Les trois idées musicales

**Motif crée les événements.** Il contient les frappes de Kick, Snare, Hat et
des autres Voices. Chaque Voice peut avoir sa propre longueur de boucle.

**Modulation fait varier leurs attributs.** Elle tourne en parallèle avec ses
propres cycles et peut imposer une vélocité, COLOR, SWING ou RATCHET à certains
événements du Motif. Elle ne crée aucune note.

**Mutation réinterprète le phrasé.** Elle propose huit manières de transformer
un Motif. On essaie, on écoute, puis on conserve la proposition ou on revient
à l’original.

Ces trois fonctions se combinent : une Mutation renouvelle les frappes, tandis
que Modulation continue de leur appliquer ses variations au fil des rencontres.

## 2. Se repérer sur le Launchpad

La surface principale comporte une **Timeline de 32 Steps**, un bloc de
**16 Instruments**, un **Book de 16 pads**, et une colonne de commandes
**A–H**, de haut en bas.

### Les huit boutons du haut

| Bouton | Fonction principale |
| --- | --- |
| 1 — SHIFT | Combinaisons et sélections multiples |
| 2 — MOD | Active ou désactive l’effet de Modulation |
| 3 — PLAY | Lecture / pause ; appui long pour STOP |
| 4 — SOLO | Écoute d’un groupe de Voices |
| 5 — MUTE | Silence d’un groupe de Voices |
| 6 — MUTATION | Essayer et valider une variation du Motif |
| 7 — << | Navigation / affichage Motif en PLAY |
| 8 — >> | Navigation / affichage Modulation en PLAY |

### La colonne A–H change de rôle

Hors édition A/T ou Mutation, **F sert à DELETE**, **G à COPY**, et **H à
SWITCH**, qui bascule entre le Book Motif et le Book A/T.

Pendant une transaction, ces mêmes boutons deviennent des **valeurs ou des
réglages**. Par exemple, G sélectionne SWING 54 % pendant SWING : il ne lance
pas une copie. Terminer la transaction restitue les commandes ordinaires.

### Les couleurs utiles

« DIM » désigne une lumière atténuée.

| Zone / état | Lecture générale |
| --- | --- |
| Book Motif | Famille DIM GREEN / GREEN |
| Book Modulation | Famille DIM RED / RED |
| Chain, hors FOCUS | Membres DIM AMBER, motif joué YELLOW, suivant clignotant lentement |
| Instrument | DIM GREEN au repos, GREEN lorsqu’il joue |
| Instrument sélectionné | DIM AMBER au repos, YELLOW lorsqu’il joue |
| Attribut disponible | RED ; certains emplacements indisponibles sont DIM RED |
| Transformation disponible | YELLOW ; emplacements réservés DIM AMBER |
| Réglages A–H en édition | DIM AMBER pour les choix disponibles |

Un emplacement de Book sans données peut être éteint. FOCUS, Loop Point,
COPY et les confirmations ont leurs propres indications prioritaires : la
palette de Chain n’est donc pas une règle absolue dans ces états.

## 3. Préparer les sons

Dans **SETTINGS**, choisir ou créer une Pad Configuration, puis régler les
Voices nécessaires. L’édition de cette configuration se fait en STOP/PAUSE.

Une Voice peut être :

- **MIDI DRUM** : sortie MIDI, canal, note principale et éventuellement COLOR NOTE ;
- **AUDIO** : fichier WAV joué en one-shot, sortie Left, Right ou Stereo ;
- **NONE** : emplacement sans son configuré.

La configuration des sons et les Motifs sont deux choses distinctes. Copier
une partition de Voice ne copie pas l’identité MIDI ou le sample de la Voice.

Pour jouer un instrument externe ou un logiciel comme Bespoke, vérifier la
sortie MIDI de LiRythme et l’entrée correspondante du destinataire. En
**Clock Internal**, LiRythme fournit son rythme de lecture ; en **Clock MIDI**,
il suit la synchronisation externe configurée.

Pour les Voices Audio, les WAV restent des fichiers externes : une copie de
configuration n’embarque pas les samples. Les Voices Audio utilisent la sortie
audio système. COLOR ne sélectionne pas un autre sample.

## 4. Construire une première boucle

1. En STOP, afficher Motif et choisir son emplacement dans le Book Motif.
2. Appuyer sur l’Instrument à programmer, par exemple Kick.
3. Appuyer sur les Steps désirés. Un second appui retire la frappe.
4. Choisir une autre Voice et ajouter son rythme.
5. Désélectionner la Voice en rappuyant sur son pad.
6. Maintenir SHIFT et appuyer sur le Step 16 pour fixer la fin du Motif à 16.
7. Cliquer PLAY pour écouter.

**PLAY court** démarre depuis STOP, met en pause depuis PLAY, ou reprend depuis
PAUSE. **PLAY long** arrête et revient au départ. En Clock Internal,
PLAY maintenu avec << ou >> permet de diminuer ou augmenter le tempo.

En STOP/PAUSE, les flèches parcourent les Steps et préécoutent leurs événements
lorsque la navigation est en mode Step. En Chain sans FOCUS, elles parcourent
les maillons à la place.

### Longueur d’une Voice et fin du Motif

Avec une Voice sélectionnée, **SHIFT + Step** fixe sa longueur. Sans Voice
sélectionnée, le même geste fixe la fin explicite du Motif. Refaire le geste
sur la longueur déjà choisie retire cette longueur explicite.

Exemple : **Motif 8, Kick 4, Snare 5, Hat 7**. Les Voices bouclent selon leurs
longueurs, mais le Motif repart au début après son Step 8. Cette fin provoque
une cassure volontaire, même si certaines Voices n’ont pas fini leur cycle.

Sans fin explicite, la durée globale est le plus petit cycle commun aux
longueurs de Voices explicitement fixées. Sans aucune longueur explicite,
elle vaut 32 Steps. Une Voice sans longueur définie conserve son cycle
implicite de 32 Steps.

La grille stocke 32 Steps par Voice ; les longueurs explicites vont de 1 à 32.
Le cycle global calculé peut être beaucoup plus long. Des données au-delà
d’une frontière peuvent rester stockées : réduire une longueur ne signifie
pas effacer toute la suite.

## 5. Attributs et Transformations — A/T

SWITCH affiche le Book A/T. Les fonctions disponibles sont :

| Emplacement du Book A/T | Fonction |
| --- | --- |
| Première rangée, premier pad | VELOCITY |
| Première rangée, deuxième pad | COLOR |
| Première rangée, troisième pad | SWING |
| Première rangée, quatrième pad | RATCHET |
| Deuxième rangée, deuxième pad | CYCLE |
| Deuxième rangée, troisième pad | FLAM (Motif et Modulation) |
| Troisième rangée, premier pad | ROTATION |

Dans Motif et Modulation, **FLAM** espace légèrement les Voices qui frappent au même
instant. A–H : **100, 75, 50, 35, 20, 10, 5, 0 ms**. La première Voice reste sur
le temps ; les suivantes sont retardées dans l'ordre des Voices. Sélectionner
les Voices et Steps concernés avec les gestes A/T habituels. À 20 ms, trois
Voices jouent à 0, +20 et +40 ms ; 0 désactive leur participation.
Voir [FLAM](FLAM.md) pour les interactions avec SWING et RATCHET.

### CYCLE : une fois sur n passages

CYCLE joue au premier passage, puis une fois sur 2 à 8 passages. Les boutons
A–H donnent respectivement 8, 7, 6, 5, 4, 3, 2 et 1 ; H joue toujours.
Sans sélection, le réglage porte sur le Motif ; sélectionner des Voices ou des
Steps pour créer des exceptions. La priorité est STEP > VOICE > MOTIF, même
si le réglage général est modifié ensuite.

Le décompte suit les passages du Motif pour une cible Motif, et les boucles
locales des Voices pour une cible Voice ou Step. STOP remet les compteurs à
zéro ; PAUSE les conserve. Exemple : F = 1 sur 3 joue aux passages 1, 4, 7…
La préécoute manuelle reste audible. Voir [CYCLE](CYCLE.md) pour les détails.

### Une gestuelle commune

1. **Clic sur la fonction** : ouvrir l’édition ; son pad clignote.
2. Sélectionner éventuellement des Voices et/ou des Steps.
3. Choisir une valeur A–H, ou utiliser les flèches pour ROTATION.
4. Écouter et ajuster.
5. **Appui long sur le pad de la fonction** : confirmer.
6. **Clic court sur ce même pad** : annuler toutes les modifications de cette transaction.

Autre méthode depuis la vue A/T (PLAY), même avec une Chain active ou une édition
A/T déjà ouverte : maintenir **SHIFT** et appuyer sur
un pad A/T pour consulter son affichage. En gardant SHIFT enfoncé, appuyer sur
d’autres pads A/T pour parcourir leurs affichages. Les commandes d’édition
restent bloquées pendant cet aperçu. **Relâcher SHIFT** fait entrer le dernier
A/T sélectionné en édition ; reprendre ensuite à l’étape 2 ci-dessus.
Un emplacement vide ou désactivé libère la sélection pendant cet aperçu.
Le parcours continue tant que SHIFT est maintenu : choisir ensuite un pad valide,
ou relâcher SHIFT pour sortir sans attribut sélectionné. Hors aperçu, un clic sur
un pad vide annule aussi l'édition A/T courante.

SHIFT permet d’ajouter plusieurs Voices ou Steps à la sélection. Rappuyer sur
un élément sélectionné le retire. La sélection temporaire commence vide à
l’ouverture : une Voice sélectionnée avant l’entrée ne définit pas à elle
seule la cible A/T.

| Sélection dans la transaction | Portée |
| --- | --- |
| Ni Voice ni Step | Motif entier |
| Voice(s) seulement | Événements de ces Voices |
| Step(s) seulement | Événements de toutes les Voices sur ces Steps |
| Voice(s) et Step(s) | Intersection des deux sélections |

Le curseur indique la position inspectée ; il ne limite pas l’application à
ce seul Step. Dans Motif, un attribut s’applique uniquement aux événements
existants. Une sélection vide de notes ne crée ni frappe ni attribut orphelin.

Le motif cible est capturé à l’ouverture. Il reste la cible même si la Chain
avance pendant l’édition. Les essais provisoires ne deviennent persistants
qu’à la confirmation.

### Gate des Voices KEY GROUP

Maintenir le pad Instrument d'une Voice KEY GROUP et appuyer sur `<<` pour
raccourcir son gate, ou `>>` pour l'allonger. Les crans sont 12,5 %, 25 %,
37,5 %, 50 %, 62,5 %, 75 %, 87,5 % et 100 % de la durée du Step local.
Avec RATCHET, le pourcentage porte sur chaque subdivision après SWING.
Pendant le maintien de la Voice, les deux flèches indiquent le gate : éteint
= 12,5 % (défaut), Dim Amber = 25 %, Amber = 37,5 %, Yellow = 50 %, Dim Green
= 62,5 %, Green = 75 %, Dim Red = 87,5 %, Red = 100 %. Au relâchement, elles
retrouvent leur affichage normal. Le bas du panneau SELECTION de PLAY affiche
les huit valeurs avec leurs couleurs et encadre la valeur courante.

Ce réglage appartient à la Voice dans la configuration des pads et vaut pour
tous ses Motifs. Il fonctionne aussi pendant PLAY et dans l'A/T KEY GROUP :
Voice maintenue + flèche règle le gate ; les flèches seules gardent octave −/+.
Le gate est sauvegardé immédiatement, indépendamment de la confirmation ou de
l'annulation A/T. SHIFT, COPY, DELETE et SOLO/MUTE gardent leurs gestes propres.

Sans réglage explicite, une Voice KEY GROUP utilise 12,5 %. Les autres types
de Voices conservent leurs gates existants. Les notes déjà parties
conservent leur durée. Aucun gate par Step ou de Modulation dans cette version.

### Valeurs VELOCITY, SWING et RATCHET

| Bouton | VELOCITY MIDI | SWING | RATCHET : frappes totales |
| --- | --- | --- | --- |
| A | 127 | 75 % | 8 |
| B | 111 | 72 % | 7 |
| C | 96 | 69 % | 6 |
| D | 80 | 66 % | 5 |
| E | 64 | 63 % | 4 |
| F | 48 | 58 % | 3 |
| G | 32 | 54 % | 2 |
| H | 16 | 50 % | 1 |

**VELOCITY** règle la force de l’événement. Pour Audio, elle agit sur le gain.
Une valeur provenant de Modulation remplace la vélocité du Motif : ce n’est
pas une multiplication en pourcentage de sa valeur initiale.

**SWING** retarde les départs sans changer la durée des Steps. H = 50 % donne
un jeu droit. Avec la cible Motif, les Steps 2, 4, 6… sont concernés ; avec
des Voices sélectionnées, l’alternance suit leurs cycles locaux. Avec des
Steps explicitement sélectionnés, ces Steps reçoivent le retard directement,
sans filtre pair/impair.

**RATCHET** répartit plusieurs frappes dans le temps restant du Step après
SWING. H = une frappe normale ; E = quatre frappes, première comprise.
Un train déjà commencé conserve ses réglages jusqu’à son terme.

### COLOR

Activer **COLOR ENABLED** dans SETTINGS pour rendre son pad accessible.
Désactivé, le pad du Book reste DIM RED et ne permet pas d’entrer en édition.

Dans la transaction COLOR, **A est la seule commande** : premier appui ON,
suivant OFF. Un changement de sélection fait repartir cette commande sur ON.
B–H restent éteints et sans effet.

A reste DIM AMBER lorsqu’aucun événement ciblé sous le curseur ne porte COLOR
ON, et devient RED lorsqu’au moins un en porte. Cette lumière décrit le Step
inspecté ; le panneau PLAY indique le dernier réglage collectif appliqué.

Sur une Voice MIDI DRUM, COLOR ON utilise sa **COLOR NOTE** si elle est définie,
sinon sa note habituelle. Les autres attributs restent indépendants.

### EUCLIDIEN

Sur un Motif vide ou déjà programmé, choisir Euclidien puis un instrument. Shift + Step fixe
sa résolution (rouge), un clic sur un Step fixe le nombre de frappes (vert).
A choisit le mode polymétrique ; B choisit le mode polyrythmique. B maintenu
+ Step définit la durée du Motif entier. B clignote jusqu’à ce choix, puis reste
allumé. La Voice sélectionnée est allumée en jaune. Chaque instrument conserve ses
propres réglages. Un clic sur Euclidien annule ; un maintien confirme.
Voir [Euclidien](AT-EUCLIDEAN.md) pour le détail.

### ROTATION

Après entrée dans ROTATION, << et >> déplacent les événements ciblés d’un
Step, dans le cycle propre de chaque Voice. Les attributs les accompagnent.
Les flèches servent alors exclusivement à la rotation ; A–H sont inactifs.

Exemple : une Voice de longueur 5 fait passer un événement du Step 5 au
Step 1 avec >>. La longueur du Motif ne devient pas sa longueur de Voice.
Dans Modulation, ROTATION transporte aussi les cellules contenant uniquement
des attributs.

## 6. Modulation : faire vivre le Motif

En PLAY, **>> affiche Modulation** et **<< affiche Motif**. Choisir l’affichage
de Modulation n’active pas automatiquement son effet : le **bouton 2 MOD**
commande ON/OFF. Les deux systèmes partagent le transport mais possèdent
leurs propres banques, longueurs et Chains.

Pour créer une modulation :

1. Afficher Modulation et choisir un emplacement de son Book.
2. Définir éventuellement une durée, par exemple 6 Steps.
3. Ouvrir le Book A/T et choisir un attribut.
4. Sélectionner les Voices et Steps concernés, régler et confirmer.
5. Activer MOD et écouter les rencontres avec les événements de Motif.

**Modulation accepte les cellules d’attributs sans note.** Un clic ordinaire
sur sa Timeline ne programme pas de frappe. Sa Timeline montre la présence
d’A/T comme celle des événements dans Motif. DELETE puis un Step y efface
les A/T de la Voice sélectionnée, ou de toutes les Voices si aucune ne l’est.

### Exemple : Kick sur deux cycles différents

Le Motif contient Kick et Hat. Dans une Modulation de 6 Steps, sélectionner
Kick, puis les Steps 1 et 3, et appliquer COLOR ON. COLOR n’agit que lorsqu’un
événement Kick rencontre une cellule COLOR de Kick dans le cycle de Modulation.
Le Hat garde ses propres attributs.

Sans sélection de Voice, le même réglage concerne toutes les Voices ; sans
sélection de Step, il couvre leurs cellules sur l’ensemble du cycle.

Chaque famille est remplacée séparément : un RATCHET explicite de 1 neutralise
les répétitions du Motif sans supprimer COLOR. Un attribut absent laisse celui
du Motif intact ; COLOR OFF est au contraire une consigne explicite.

Modulation continue de progresser lorsqu’elle est OFF. En PLAY, une demande
ON/OFF devient effective à sa prochaine frontière globale, sans repartir du
début à la demande. Le panneau PLAY indique l’état actif et un changement
en attente éventuel.

## 7. Mutation : explorer un autre phrasé

Mutation concerne le **Motif complet** et ses événements. Elle est disponible
en PLAY, STOP ou PAUSE, depuis le Book Motif ou A/T.

1. Cliquer **Mutation, bouton 6**. Il clignote RED / DIM RED.
2. Choisir un réglage A–H. Les choix sont DIM AMBER ; le choix actif est RED.
3. Écouter, comparer, revenir sur un réglage.
4. Maintenir Mutation pour confirmer, ou cliquer brièvement pour annuler.

Le Book conserve son affichage : entrer dans Mutation depuis Motif/Chain
ne le transforme pas en Book A/T. Pendant la transaction, les pads de Book,
Voices et Steps ne changent pas sa cible.

| Réglage | Méthode | Ce qu’elle cherche à produire |
| --- | --- | --- |
| A | Combinaison | Permutation, syncope et densification |
| B | Euclidien | Répartition régulière des frappes dans chaque cycle |
| C | Densification | Ajout de réponses proches des frappes présentes |
| D | Allègement | Retrait d’une partie des frappes secondaires |
| E | Redistribution | Transfert de frappes entre les Voices déjà utilisées |
| F | Permutation | Échange de fragments du phrasé |
| G | Syncope | Déplacement d’appuis secondaires vers les contretemps |
| H | Déplacement | Décalage local d’une partie des frappes |

**A–H choisit une méthode, pas une échelle d’intensité.** Chaque essai repart
du Motif capturé à l’entrée. H → C → H redonne donc la même proposition H.
Après confirmation, ouvrir une nouvelle transaction prend le résultat confirmé
comme nouvelle source : on peut ainsi poursuivre une évolution volontairement.

Le moteur protège un repère par Voice — sa frappe la plus forte, la première
en cas d’égalité — et conserve les longueurs. Les événements déplacés gardent
leurs attributs. Un motif vide reste vide ; une méthode peut ne rien changer
si les événements ou les emplacements libres nécessaires manquent.

En Chain, un clic pendant le passage d’un Motif capture ce Motif. Pour en
choisir un autre, utiliser FOCUS / VIEW avant d’entrer. Mutation ne suit pas
automatiquement le maillon suivant et ne s’applique pas aux cellules A/T seules
de Modulation.

## 8. Chain, NEXT et FOCUS

### Organiser une suite

**SHIFT + PLAY** active ou désactive Chain Motif. **SHIFT + MOD** fait la même
chose pour Chain Modulation. Les deux Chains sont indépendantes.

Dans le Book du système concerné, maintenir un pad Motif pour l’ajouter :
en PLAY, il est ajouté à la suite ; en STOP/PAUSE, il est inséré après
l’occurrence sélectionnée lorsqu’il y en a une. Un même Motif peut apparaître
plusieurs fois. Ces occurrences utilisent le même contenu de banque : éditer
le Motif affecte toutes ses occurrences.

En STOP/PAUSE, hors FOCUS et hors transaction, << et >> parcourent les maillons.
Les flèches ne programment pas de notes.

### Déplacer un bloc pendant PLAY

Pendant PLAY, dans le Book Motif ou Modulation, **SHIFT maintenu + appui long (300 ms) sur le pad du bloc actif ou
suivant** sélectionne cette occurrence pour la déplacer (pad rouge). Garder
SHIFT, puis appuyer sur **<< / >>** pour la déplacer d’une position à
chaque appui. Le déplacement s’arrête aux extrémités. Relâcher SHIFT termine
la sélection. La lecture continue sans redémarrer le bloc en cours ; NEXT est
recalculé selon le nouvel ordre. Si actif et suivant partagent le même pad,
l’occurrence active est prioritaire. Pour régler le **Loop Point** pendant PLAY,
maintenir SHIFT et faire un **clic court sur le pad**, sans utiliser les flèches.
Les gestes Loop Point en STOP/PAUSE restent inchangés.

Hors Chain, sélectionner un autre motif dans le Book pendant PLAY prépare
**NEXT** : le changement attend la frontière du Motif courant. Sélectionner
à nouveau PLAYING retire cette demande.

### Éditer sans déplacer la lecture

En Chain, appuyer ensemble sur **<< + >>** pour entrer ou sortir de FOCUS.

- **PLAYING** est le motif entendu.
- **VIEW** est le motif affiché pour l’édition.
- Dans le Book, un clic court choisit VIEW en FOCUS.
- En STOP/PAUSE avec FOCUS, les flèches parcourent les Steps de VIEW.
- En PLAY, les flèches individuelles choisissent l’affichage Motif ou Modulation.

Le geste simultané est exclusif : il ne doit pas produire deux navigations.
FOCUS est la sélection figée évoquée dans nos discussions sous le nom FREEZE.
La page PLAY permet de distinguer l’édition de la lecture lorsque VIEW diffère
de PLAYING.

### Loop Point

Dans le Book de Chain, **SHIFT + le pad du Motif de l’occurrence courante**
place ou retire le Loop Point. En STOP/PAUSE, sélectionner d’abord l’occurrence
avec les flèches ; pendant la lecture, maintenir SHIFT et faire un clic court
sur le pad de celle qui joue. Ce geste utilise la bibliothèque de Motifs ;
sur la page PLAY, le Book reste réservé aux fonctions A/T. Après cette occurrence,
la Chain revient à sa tête. Le Loop Point désigne une occurrence, pas toutes
les apparitions du même numéro de Motif.

Dans l'affichage Chain de la page PLAY, un bref clignotement marque le début
de chaque occurrence, y compris lorsque deux Motifs identiques se suivent.

## 9. Copier, doubler et effacer

Ces gestes sont disponibles hors transaction A/T ou Mutation.

### COPY : action → source → destination

Appuyer sur COPY, choisir la source, puis la destination. Sur les Instruments,
on copie une partition de Voice ; dans le Book Motif, on copie un Motif.
Un nouvel appui sur COPY annule l’opération en cours.

Les événements, attributs et longueurs musicales concernés sont copiés.
La configuration sonore de la Voice destinataire reste la sienne. Certaines
destinations engagées dans la lecture peuvent être protégées ; une destination
refusée ne termine pas la copie.

### DOUBLE : SHIFT + >>

Avec une Voice sélectionnée, sa longueur explicite et son contenu sont doublés.
Sans Voice sélectionnée, le Motif et chaque Voice concernée sont doublés selon
leurs longueurs propres.

Exemple : Motif 8, Kick 4, Snare 5, Hat 7. DOUBLE sur Kick donne Motif 8,
Kick 8, Snare 5, Hat 7. La fin du Motif reste à 8.

La longueur à doubler doit être explicite et comprise entre 1 et 16, pour rester
dans la limite de 32. Un doublement complet exige aussi une fin explicite du
Motif. Les Voices vides sans longueur sont ignorées ; une Voice contenant des
données mais sans longueur explicite fait refuser le doublement complet.
Un refus ne double pas partiellement la cible. Les attributs sont réellement
copiés avec les événements ou cellules de Modulation.

### DELETE : action → cible

Appuyer sur DELETE pour l’armer, puis choisir la cible. Appuyer à nouveau
sur DELETE annule l’armement.

| Cible après DELETE | Résultat |
| --- | --- |
| Instrument | Efface sa partition dans le motif édité |
| PLAY, hors Chain Motif | Efface le contenu du Motif courant de Motif |
| PLAY, Chain Motif active | Vide la Chain Motif, y compris en FOCUS |
| MOD, hors Chain Modulation | Efface le contenu du motif courant de Modulation |
| MOD, Chain Modulation active | Vide la Chain Modulation, y compris en FOCUS |
| Step de la Timeline Modulation | Efface ses A/T selon la sélection de Voice |
| SOLO ou MUTE | Efface la sélection mémorisée de cette fonction |

PLAY reste associé à Motif et MOD à Modulation, indépendamment du Book affiché.

Dans le Book en Chain, **DELETE puis clic court sur un maillon** retire une
occurrence. **Maintenir le pad ciblé** efface le motif de banque et retire ses
occurrences. Ce second geste est donc plus large que retirer un seul maillon.
Hors Chain, DELETE sur un pad du Book vise le motif de banque, avec les
protections de destination applicables pendant la lecture.

## 10. SOLO, MUTE et filtre visuel

Maintenir SOLO ou MUTE, choisir les Instruments, puis relâcher. Une sélection
non vide active la fonction. Un clic ultérieur sans modifier la sélection
permet de l’activer/désactiver tout en conservant son groupe.

- SOLO laisse entendre les Voices de son groupe.
- MUTE coupe les Voices de son groupe.
- Si une Voice appartient aux deux groupes actifs, MUTE l’emporte.

Le rythme continue d’avancer : ces fonctions ne suppriment pas les événements
et ne réinitialisent pas les cycles.

**SHIFT + SOLO** commande un filtre d’affichage des Instruments sur la Timeline.
Il sert à lire plus clairement certaines Voices ; il ne constitue pas une
nouvelle sélection SOLO audible.

## 11. Comprendre quand un changement s’entend

| Modification | En PLAY |
| --- | --- |
| VELOCITY, COLOR, SWING, RATCHET | Dès le prochain événement, sans attendre le cycle |
| CANCEL d’un attribut | Même règle : restauration au prochain événement |
| ROTATION | À la prochaine entrée du cycle concerné |
| DOUBLE d’une Voice | À sa prochaine entrée locale, sous réserve de la fin du Motif |
| DOUBLE complet ou Mutation | À la prochaine entrée du Motif |
| CANCEL d’une Mutation ou ROTATION | Respecte également la frontière de transformation |
| ON/OFF de Modulation | À la prochaine entrée globale de Modulation |

L’éditeur montre les modifications immédiatement, même lorsque leur audition
attend encore une frontière. Les notes et répétitions déjà programmées
conservent leurs paramètres ; un nouveau réglage ne remodèle pas un RATCHET
au milieu de son train.

## 12. Lire la page PLAY et conserver son travail

La page PLAY présente Motif, Modulation et la sélection ou transaction active.
Elle affiche aussi l’état du transport, le tempo et la source de clock.

Les cadrans ont deux niveaux : le contour extérieur représente le cycle du
Motif ; le cadran intérieur, celui de la Voice sélectionnée. Leurs aiguilles
montrent leurs positions respectives. Sans Voice sélectionnée, seul le cycle
global est montré. Les longs cycles restent représentables sans devoir
dessiner un pad physique pour chacun de leurs Steps.

En PLAY/PAUSE, les cadrans suivent la géométrie réellement engagée. Lorsque
VIEW est différent, la légende de lecture permet d’identifier PLAYING.
Modulation OFF continue d’avancer, ce qui explique que son cadran bouge encore.

Les Motifs et leurs attributs disposent d’une **sauvegarde automatique locale**.
Les essais A/T et Mutation restent provisoires jusqu’à leur confirmation.
Les Pad Configurations se sauvegardent séparément avec leur commande SAVE.

La Chain Motif reste un état de session dans le format actuel ; la sauvegarde
automatique des Motifs n’est pas une sauvegarde complète de projet. La banque
Modulation conserve aussi sa Chain et son Loop Point. FOCUS, les sélections
de travail et les transactions ouvertes ne constituent pas un arrangement
persistant à retrouver tel quel au prochain lancement.


### Book Projets — SHIFT + SWITCH

Depuis le Launchpad, **SHIFT + SWITCH** ouvre le mode settings/projet.
Le même geste restitue l’affichage normal. Terminer une transaction A/T ou
Mutation avant d’ouvrir ce mode.

Les **16 pads du Book**, en bas à droite, deviennent les emplacements Projets.
Un clic sélectionne un projet ; un emplacement vide crée un projet nommé
**Projet 01** à **Projet 16**. Le projet courant est vert vif, les autres pads
vert atténué. Le changement de projet arrête le transport. Le travail existant
est conservé dans le premier projet lors de la première utilisation.

La disposition du clavier suit l’image de référence :

- Première rangée : Do♯, Ré♯, Fa♯, Sol♯, La♯ sur les colonnes 2, 3, 5, 6, 7.
- Deuxième rangée : Do, Ré, Mi, Fa, Sol, La, Si sur les sept premières colonnes.
- Colonne 8 : **Scale Up** en haut, **Scale Down** en dessous (pads rouges).

Le clavier choisit la Root Note entre MIDI 60 et 71 ; la touche courante
est verte. Les touches claires sont ambre atténué et les touches noires jaunes.
Les deux pads Scale parcourent circulairement les gammes de assets/scales.json.
La Root et la Scale apparaissent avec le nom du projet dans le troisième bloc
de **PLAY**, à la place de la sélection habituelle. La description apparaît en
bas de cette colonne, en plus petit, uniquement dans ce mode.
Les autres pads de Timeline et les Voices restent éteints et inactifs.

**COPY → source → destination** copie un projet indépendant ; une nouvelle
pression sur COPY annule. **DELETE → projet** efface l’emplacement ; effacer
le projet actif le réinitialise. PLAY court conserve lecture/pause et PLAY long
commande STOP. Les autres fonctions de jeu sont bloquées dans ce mode,
y compris les combinaisons SHIFT avec PLAY ou les flèches.

Dans **SETTINGS → PROJECT**, sélectionner un emplacement et modifier son nom ou sa description
(texte libre de 2 000 caractères maximum, sauvegardé automatiquement).
Les banques, Chains et réglages KeyGroup sont sauvegardés automatiquement.
Chaque projet conserve une copie complète de sa configuration des pads.
Un nouveau projet reprend la configuration chargée. Charger une autre PAD CONFIG
ou modifier les Voices remplace la configuration de ce projet. Les projets
plus anciens sans configuration reprennent celle chargée lors de leur ouverture.
Les fichiers audio restent externes : seuls leurs chemins sont conservés.

## 13. Trois exercices pour jouer

### Un rythme qui respire

Créer un Motif de 16 Steps, appliquer SWING G (54 %) à une Voice, puis comparer
E (63 %) et D (66 %). Confirmer le choix. Ajouter RATCHET G sur une seule frappe
de fin de phrase pour obtenir un double coup.

### Des rencontres qui évoluent

Faire tourner un Motif de 8 Steps et une Modulation de 6. Placer COLOR ou une
vélocité sur deux Steps de Modulation pour une seule Voice. Écouter plusieurs
cycles : les cellules se rencontrent à des positions différentes.

### Explorer sans perdre sa source

Pendant PLAY, ouvrir Mutation. Comparer H, G, puis D. Revenir à H pour retrouver
la même proposition. Annuler pour retrouver l’original, ou confirmer pour
adopter la variante. Refaire l’expérience avec Modulation active.

## 14. Si quelque chose semble étrange

| Observation | Première vérification |
| --- | --- |
| COLOR n’est pas accessible | COLOR ENABLED dans SETTINGS |
| COLOR ne change pas le son | COLOR NOTE sur une Voice MIDI ; COLOR ne remplace pas un sample Audio |
| Un attribut ne fait rien sur un Step vide | Normal dans Motif : il faut un événement existant |
| Modulation seule ne produit aucun son | Normal : elle module les événements de Motif |
| Les flèches changent de maillon en STOP | Chain active sans FOCUS ni transaction |
| DELETE/COPY semblent indisponibles | Une transaction occupe peut-être la colonne A–H |
| Mutation ne change rien avec un réglage | Motif vide, densité pleine, Voice unique ou déplacement impossible |
| La nouvelle variation est visible mais pas audible | Attendre sa frontière naturelle ; vérifier également PLAYING / VIEW |
| Une Voice reste silencieuse | SOLO/MUTE, type de Voice, sortie MIDI, canal/note ou disponibilité du WAV |

## 15. Ce qui reste à venir

**Groove Morph et BAKE sont des concepts discutés, pas des fonctions disponibles
dans cette version.** L’idée retenue est une transition contextuelle entre
deux voisins de Chain, conservée une fois résolue, puis éventuellement capturée
comme Motif ordinaire. SHIFT + COPY ne doit donc pas encore être utilisé en
attendant ce résultat.

La palette Mutation est une première proposition musicale concrète. Les essais
à l’oreille pourront faire évoluer les méthodes sans changer la gestuelle
d’exploration, de confirmation et d’annulation.
