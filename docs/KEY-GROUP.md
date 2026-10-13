# Key Group : MIDI mélodique et gammes personnalisées

Dans SETTINGS, attribuer le type **KEY GROUP** à une Voice et choisir son canal MIDI. Dans la section MIDI, **Key Group MIDI Output** permet de choisir une sortie dédiée à toutes les Voices Key Group. **Default MIDI Output** conserve le routage partagé avec la batterie. Ce choix est mémorisé sur cet ordinateur et ne change ni la sortie des MIDI DRUM, ni CLOCK. Un port dédié absent reste sélectionné et silencieux, sans bascule automatique. Les notes déjà déclenchées et leurs Note Off conservent leur port initial. Les autres Voices conservent leur fonctionnement MIDI DRUM ou AUDIO.

Le panneau KEY GROUP de SETTINGS définit la Root Note (numéro MIDI, **60 par défaut**) et la gamme. Ces réglages sont sauvegardés avec la banque de Motifs. Un événement sans réglage de hauteur joue le premier degré, octave zéro.

## Édition sur Launchpad

Le cinquième pad du Livre A/T ouvre KEY GROUP. La sélection Motif / Voices / Steps conserve la grammaire A/T existante.

- **H–A (du bas vers le haut)** : dans Motif, degrés 1–8 ; dans Modulation, transposition de 0 à +7 degrés. H est toujours la valeur la plus basse. DIM AMBER indique un degré disponible, YELLOW un degré présent sur les événements ciblés à la position courante.
- **<< / >>** : descendre / monter d’une octave. Plusieurs appuis cumulent les octaves. Les flèches sont DIM RED, RED lorsqu’une octave négative / positive est présente à la position courante.
- Un appui sur le pad KEY GROUP annule ; un appui long confirme.
- Dans Motif, les boutons correspondant à des degrés absents restent éteints et inactifs en haut de la colonne (A pour une gamme à sept notes). Dans Modulation, les huit décalages restent disponibles pour toute gamme valide.

Seules les Voices KEY GROUP sont concernées. Dans Motif, seuls les événements existants reçoivent les valeurs : aucun événement ni attribut orphelin n’est créé. Dans Modulation, les cellules peuvent porter uniquement les attributs. Modulation additionne son décalage de degrés et son octave à la hauteur du Motif. Le dépassement du dernier degré poursuit dans l’octave suivante : en Do majeur, Mi +1 devient Fa et Si +1 devient Do supérieur. H = 0 conserve le degré du Motif ; une octave seule conserve son degré et transpose son octave. Les événements et attributs sources du Motif restent inchangés.

La hauteur est `Root + intervalle du degré + 12 × octave`. Dans Motif, une édition dépassant la plage MIDI 0–127 est refusée pour toute la sélection. Dans Modulation, le décalage est indépendant de la partition rencontrée ; si leur somme sort de la plage MIDI, cette note reste silencieuse. Un changement global de gamme ou de Root peut rendre un événement silencieux : sa valeur est conservée, sans remappage ni écrêtage. COLOR conserve son rôle pour MIDI DRUM ; il ne remplace pas la hauteur Key Group.

Les attributs deviennent audibles au prochain événement sans réinitialiser les cycles. Une note et ses répétitions RATCHET déjà déclenchées conservent leur hauteur capturée, y compris leurs Note Off. COPY, DOUBLE, ROTATION, Mutation et Groove Morph transportent les cellules de hauteur avec les événements.

## Ajouter une gamme

Modifier **`assets/scales.json`**, puis relancer LiRythme. Aucun changement du programme ni compilation n’est nécessaire. Dans la version portable, le fichier se trouve dans **`resources/app/assets/scales.json`**.

Le catalogue livré contient les 36 gammes demandées. Ajouter une entrée à la liste `scales`, par exemple :

```json
{
  "scales": [
    { "ionian": [0, 2, 4, 5, 7, 9, 11] },
    { "ma gamme": [0, 3, 5, 7, 10] }
  ]
}
```

Cet exemple est un petit catalogue complet ; pour conserver les autres gammes, ajouter seulement l’entrée `ma gamme` dans le fichier existant, avec la virgule appropriée.

Chaque gamme doit avoir un nom unique et entre **1 et 8 intervalles**, entiers, strictement croissants, de **0 à 11**. Le premier intervalle est **0**. Le catalogue accepte de 1 à 256 gammes. Utiliser du JSON valide, sans commentaires ni virgule après la dernière entrée.

Une erreur dans le fichier entraîne un repli sur Ionian et un message dans SETTINGS. Le fichier original n’est jamais écrasé. Si une banque sauvegardée référence une gamme retirée du catalogue, SETTINGS l’indique comme absente et les Voices Key Group restent silencieuses jusqu’au choix d’une gamme disponible. Conserver les noms et intervalles utilisés par les banques permet de retrouver leur résultat musical.

## Validation hardware à effectuer

1. Choisir KEY GROUP, canal du synthétiseur, Root 60 et Ionian. Programmer quelques événements, puis tester H–B ; A reste éteint.
2. Combiner degré et plusieurs octaves, confirmer puis annuler une autre édition. Vérifier la préécoute en STOP et les changements pendant PLAY.
3. Passer à une pentatonique puis à une gamme à huit notes : vérifier les boutons disponibles et le silence des degrés absents.
4. Appliquer une octave seule dans Modulation, puis G (+1 degré) et H (0). Vérifier leurs croisements avec le Motif et les différentes longueurs de Voice.
5. Tester avec RATCHET, sauvegarder/recharger, puis ajouter une gamme personnalisée et relancer l’application.

La validation automatisée utilise des sorties MIDI simulées. Elle ne remplace pas ce test sur le synthétiseur et le Launchpad.

Les valeurs enregistrées de degré et d’octave sont conservées : seul leur placement sur A–H est inversé. Les cellules Key Group déjà enregistrées dans Modulation sont désormais interprétées comme des transpositions relatives.
