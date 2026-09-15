# Couvertures --- récupération et cache

## 1. Objectif

Les couvertures sont récupérées lors du traitement Python et servies
localement. Le navigateur n'interroge jamais les fournisseurs.

Fichier positif :

``` text
covers/{biblionumber}.jpg
```

Métadonnées/cache :

``` text
covers/.cover-cache.json
```

## 2. Priorité

``` text
cover_url présente
  ├─ succès → cache local
  └─ échec → fournisseurs configurés

cover_url absente
  └─ fournisseurs configurés
```

Fournisseurs prévus : Google Books, BnF, Amazon. L'ordre effectif suit
la configuration CLI.

## 3. Cache positif et provenance

Le cache doit mémoriser la provenance, notamment l'URL exacte lorsqu'une
image vient de `cover_url`.

Exemple :

``` json
{
  "covers": {
    "272037": {
      "source": "cover_url",
      "source_url": "https://example.org/cover.jpg"
    },
    "272038": {
      "source": "google"
    }
  },
  "negative": {
    "google:272039": true,
    "bnf:272039": true
  }
}
```

## 4. Règles `cover_url`

À chaque traitement :

1.  `cover_url` présente + image locale issue de la même `source_url` →
    réutiliser ;
2.  `cover_url` présente + URL différente → tenter la nouvelle URL même
    si l'image locale existe ;
3.  succès → remplacer image et métadonnées ;
4.  échec → tenter les fournisseurs configurés ;
5.  si `cover_url` disparaît du CSV mais qu'une image locale existe
    déjà, conserver cette image.

## 5. Cache négatif

Le cache négatif concerne les fournisseurs externes :

``` text
google:{biblionumber}
bnf:{biblionumber}
amazon:{biblionumber}
```

**Ne pas créer de cache négatif permanent pour `cover_url`.** Une URL
peut changer ou être temporairement indisponible ; elle doit pouvoir
être retentée lors d'un traitement ultérieur.

## 6. Tolérance aux erreurs

Une erreur réseau, HTTP, format d'image ou fournisseur :

-   est loguée ;
-   ne bloque pas les autres sources ;
-   ne bloque pas JSON ;
-   ne bloque pas XLSX.

## 7. Sortie JSON

Si une couverture locale exploitable existe :

``` json
"local_cover_url": "../covers/272037.jpg"
```

Le navigateur n'utilise pas `cover_url`.

## 8. Affichage

-   carousel/grid : hauteur 180 px ;
-   list : 120×170 px ;
-   list mobile : 90×130 px ;
-   compact : aucune image/placeholder.

`object-fit: contain`; image décorative `alt=""`; lazy loading lorsque
pertinent.

## 9. Implémentation Python et fournisseurs

`scripts/covers.py` contient la récupération et le cache ;
`scripts/csv_to_json.py` l'appelle avant les exports. Pillow valide et
convertit les images en JPEG (fond blanc pour la transparence). Les réponses
de plus de 12 Mio, les images illisibles et les images de moins de 32 pixels
sur un côté sont rejetées. Cette vérification ne détecte pas tous les
placeholders graphiques des fournisseurs.

Dans le champ `isbn`, les tirets sont supprimés avant de
chercher la première séquence continue de 13 chiffres ; à défaut, la
première séquence de 9 chiffres suivis d'un chiffre ou de `X` (`x` accepté).
La clé de contrôle est vérifiée ; un ISBN-13 doit commencer par 978 ou 979.
Si l'ISBN est absent, non extractible ou invalide, la même extraction et
vérification de clé sont appliquées au champ `ean`. Un seul identifiant
est retenu : un ISBN valide est prioritaire sur l'EAN. Les espaces et les textes parasites ne sont pas
concaténés pour former artificiellement un identifiant. Les données
bibliographiques originales restent inchangées.

Google et la BnF reçoivent les identifiants dans leur format natif extrait
(10 ou 13 caractères). Seul Amazon convertit les ISBN-13 commençant par
978 en ISBN-10, en recalculant la clé ; les ISBN-13 commençant par 979 ne
sont pas convertibles. Cette règle s'applique également à l'EAN de repli :
conversion si son préfixe est 978, aucune requête Amazon s'il commence par
979 (ou tout autre préfixe non convertible). La comparaison des résultats Google peut utiliser
l'équivalence ISBN-10/ISBN-13, sans changer l'identifiant de la requête.

Les images téléchargées depuis Google Books ou Amazon sont redimensionnées
proportionnellement si leur largeur ou leur hauteur dépasse 500 pixels. La
dimension maximale enregistrée est donc `500x500`. Les images BnF et les URLs
de couverture explicites ne sont pas redimensionnées par cette règle.

- Google Books : recherche `isbn:` via
  `https://www.googleapis.com/books/v1/volumes`, puis téléchargement de
  l'image d'un résultat dont l'ISBN correspond. La variable d'environnement
  `GOOGLE_BOOKS_API_KEY` permet d'ajouter une clé. Voir la
  [documentation Google Books](https://developers.google.com/books/docs/v1/using).
- BnF : requête `EAN` vers
  `https://openapi.bnf.fr/couverture/image/image/recupererImage`, avec
  `couverture=1`, `taille=originale`, `largeur=500` et `hauteur=500`. L'EAN
  est prioritaire sur l'ISBN ; un ISBN-10 est converti en ISBN-13 avant la
  requête. Cet endpoint est documenté en version bêta. La BnF signale qu'une
  absence d'image peut actuellement produire un HTTP 500 ; le script conserve
  ces erreurs comme retentables pour éviter de mémoriser une panne comme une
  absence définitive.
  Voir la [documentation BnF](https://api.bnf.fr/fr/api-service-couvertures-du-catalogue-general).
- Amazon : essai du service d'images historique
  `https://images-na.ssl-images-amazon.com/images/P/{ISBN10}.01.LZZZZZZZ.jpg`.
  Les ISBN-13 commençant par 978 sont convertis en ISBN-10. Les autres EAN
  ne permettent pas cette résolution. Ce service n'offre pas de garantie
  de disponibilité ; il ne s'agit pas d'une intégration à l'API commerciale
  authentifiée d'Amazon. Les refus d'accès sont signalés sans contournement.

## 10. Détails du cache et reprise

Le cache positif ajoute `retrieved_at` (date UTC) à la provenance. Cette
information permet notamment de conserver la source BnF et la date de
récupération. La source et la date devront être mentionnées lors de la
présentation publique des vignettes BnF, conformément à sa documentation.

Les nouvelles entrées négatives mémorisent les identifiants interrogés :

``` json
{"negative": {"google:272037": {"identifiers": ["9782765409779"]}}}
```

Une modification des ISBN/EAN déclenche ainsi une nouvelle tentative.
Les anciennes entrées `true` restent lisibles. L'option
`--retry-missing-covers` réinitialise toutes les entrées négatives ; elle ne
supprime pas les images positives. Les éventuelles anciennes entrées
`cover_url:*` et `csv:*` sont éliminées.

Les HTTP 401, 403 et 429 suspendent le fournisseur jusqu'au prochain
lancement, sans cache négatif. Les erreurs réseau, HTTP 5xx et réponses
mal formées restent retentables. Les HTTP 404/410, résultats sans image et
images minuscules sont considérés comme des absences explicites.

Lorsqu'une nouvelle URL échoue et qu'aucun fournisseur ne réussit, une
ancienne image locale valide est conservée avec sa provenance. Un cache
illisible est signalé et reconstruit ; une image locale corrompue est
retéléchargée si possible. Images et métadonnées sont écrites par
remplacement atomique de fichiers individuels. Exécuter un seul traitement
à la fois sur un même dossier de cache.

## 11. Tests

``` console
python -m unittest discover -s tests -v
python scripts/probe_covers.py --sample 3
python scripts/probe_covers.py --sample 3 --cover-source bnf
```

Les tests unitaires simulent les fournisseurs et ne dépendent pas du réseau.
La sonde réelle utilise un dossier distinct par lancement dans `cover-probe/`
et produit un rapport JSON avec les compteurs et les fichiers récupérés.
