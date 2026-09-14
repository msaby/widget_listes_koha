# Utiliser Koha List Widget

Ce guide accompagne la démonstration dans `demo/index.html`. Le navigateur
affiche des fichiers statiques préparés à partir du CSV Koha ; aucun serveur
Python ou Node.js n'est nécessaire sur le site public.

## 1. Lancer la démonstration

Prérequis : Python 3.10 ou ultérieur et Node.js 22 ou ultérieur, accessibles
par les commandes `python` et `node`. Ouvrir un terminal dans le dossier du dépôt.

``` console
python --version
node --version
python -m pip install -r requirements.txt
python scripts/csv_to_json.py --skip-covers
npm start
```

Ouvrir **http://127.0.0.1:4173/demo/index.html**. Le serveur reste dans le
terminal ; `Ctrl+C` l'arrête. Il écoute uniquement sur cet ordinateur.
Pour lancer cette démo, `npm install` et Playwright ne sont pas nécessaires :
le serveur utilise uniquement les modules fournis avec Node.js.

Le CSV fourni contient les listes **11** et **32**. La conversion produit
`data/data.json`, `exports/liste-11.xlsx` et `exports/liste-32.xlsx`.
Ces fichiers générés sont ignorés par Git : il faut les recréer après clonage.
`--skip-covers` évite les appels aux fournisseurs et laisse `local_cover_url`
vide, même si des images existent déjà sur disque. Les exemples avec couverture
affichent alors « Couverture indisponible » ; le mode compact n'affiche rien
à cet emplacement.

La page propose six exemples avec leur HTML réutilisable : carrousel manuel,
grille, liste, compact, autoplay à cinq secondes, autoplay à une seconde
initialement replié. Le journal local en bas de page montre les dix dernières
interactions. La démo ne configure aucun serveur Matomo.

Si le port est occupé, sous PowerShell :

``` powershell
$env:PORT = '4174'
npm start
```

Ouvrir alors le port 4174. Ce réglage concerne la démo ; les tests Playwright
attendent le port 4173. Retirer la variable avant les tests avec
`Remove-Item Env:PORT` si vous l'avez définie.

## 2. Préparer les données et les couvertures

Remplacer `data/data.csv` par l'export Koha, en UTF-8, séparé par des
points-virgules, avec les en-têtes décrits dans [DATA_MODEL.md](DATA_MODEL.md).
`list_id` est le numéro de liste ; `list` son nom lisible. Les cellules
facultatives peuvent être vides, mais leurs en-têtes restent obligatoires.
`holdings` contient un tableau JSON sérialisé dans le CSV.

La conversion conserve toutes les lignes fournies, sans déduplication ni
filtrage sur `opac_suppressed`. La sélection des notices destinées à la
publication se fait donc lors de la préparation de l'export Koha.

Pour une préparation avec couvertures :

``` console
python scripts/csv_to_json.py
```

Les images sont enregistrées dans `covers/`, avec leur provenance dans
`covers/.cover-cache.json`. Garder ce cache d'un traitement à l'autre.
La priorité est `cover_url`, puis Google Books, BnF et Amazon. Pour choisir
les fournisseurs et leur ordre :

``` console
python scripts/csv_to_json.py --cover-source google --cover-source amazon
```

La recherche de couvertures nettoie les ISBN, valide leur clé et utilise
l'EAN lorsque l'ISBN manque ou semble invalide. Amazon reçoit seulement un
ISBN-10, avec conversion des identifiants à 13 chiffres commençant par 978 ;
les 979 ne lui sont pas envoyés. Les données bibliographiques originales
restent conservées dans le JSON et l'Excel.

Une clé Google Books peut être fournie dans `GOOGLE_BOOKS_API_KEY` sur la
machine de traitement. Les options complètes sont disponibles avec
`python scripts/csv_to_json.py --help` et dans [COVERS.md](COVERS.md).

Les échecs de couvertures sont journalisés et n'empêchent pas le JSON ou
l'Excel. Le contrôle réel de la BnF reste à reprendre après la panne signalée
pendant le développement. La commande suivante permet ce contrôle séparé,
quand le service sera disponible, sans modifier les données de production :

``` console
python scripts/probe_covers.py --sample 3 --cover-source bnf
```

## 3. Publier les ressources statiques

Copier sur votre hébergement HTTP(S), en conservant cette disposition :

``` text
/selections/
  widget/koha-list-widget.js
  widget/koha-list-widget-custom.css    (facultatif)
  widget/koha-list-widget-matomo.js    (facultatif)
  data/data.json
  covers/*.jpg
  exports/liste-*.xlsx
  demo/index.html                    (si la démo est publiée)
  demo/demo.js                       (si la démo est publiée)
```

Le CSV, les scripts Python, le cache, les dépendances et les tests restent
sur la machine de préparation. Le serveur local `scripts/serve.mjs` est un
outil de démonstration ; la production utilise votre hébergement habituel.

Le module doit être servi avec un type MIME JavaScript, le JSON avec
`application/json` et les XLSX avec
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
Ouvrir les pages par HTTP(S), pas par double-clic en `file://`.

`src` est résolu depuis la page hôte. En revanche, les chemins de couvertures
et d'Excel sont résolus depuis le JSON : garder les dossiers voisins évite
de devoir réécrire ces liens. Si le module ou le JSON se trouvent sur une
autre origine, leur serveur doit autoriser le chargement CORS depuis le site
hôte. Pour un téléchargement XLSX hébergé sur une autre origine, configurer
`Content-Disposition: attachment` côté serveur si l'on souhaite imposer le
téléchargement : l'attribut HTML `download` seul peut être ignoré.

## 4. Intégrer une sélection dans une page

Exemple pour les ressources publiées sous `/selections/` :

``` html
<script type="module" src="/selections/widget/koha-list-widget.js"></script>
<link rel="stylesheet" href="/selections/widget/koha-list-widget-custom.css">

<koha-list-widget
  src="/selections/data/data.json"
  list_id="11"
  display="compact"
  limit="200"
  paginate="20"
  sort="date"
  searchable
  show-list-name
  export="xlsx"
  analytics-id="accueil-professionnel">
</koha-list-widget>
```

Charger le script une seule fois, puis placer autant de balises que nécessaire.
Donner un `analytics-id` distinct et stable à chaque emplacement. Dans un CMS,
utiliser un bloc HTML autorisant les balises personnalisées et charger le
module dans le modèle de page si les scripts des blocs sont supprimés.

| Réglage | Effet |
| --- | --- |
| `src`, `list_id` | Source JSON et entier positif identifiant la liste, obligatoires. |
| `display` | `carousel` par défaut, ou `grid`, `list`, `compact`. |
| `limit` | Maximum après recherche, 12 par défaut. Ce n'est pas une taille de page. |
| `paginate` | Taille de page pour grille, liste et compact ; ignorée en carrousel. |
| `sort` | `title`, `authors`, `date` ; sinon tri des métadonnées, puis titre. |
| `searchable` | Recherche locale sur type, titre, sous-titre, auteurs, éditeur et date. |
| `show-list-name`, `list`, `description` | Afficher le nom, le remplacer ou ajouter une description. |
| `visibility` | `collapsible` pour commencer ouvert, `collapsed` pour commencer fermé. |
| `autoplay`, `autoplay-delay` | Carrousel automatique, délai en millisecondes, 5000 par défaut. |
| `export="xlsx"` | Afficher le lien vers l'Excel complet si les métadonnées l'annoncent. |

Les attributs booléens s'activent **par leur présence** : pour désactiver
`autoplay`, retirer l'attribut ; `autoplay="false"` l'active quand même.
La réduction des mouvements désactive toujours l'autoplay.

Pour paginer plus de douze documents, fixer aussi `limit` à une valeur
suffisante. Le téléchargement Excel contient toute la liste, même après une
recherche ou avec une limite d'affichage. Il inclut les résumés et les
exemplaires, avec un exemplaire par ligne dans une cellule. Le widget
n'affiche ni ne recherche ces deux champs.

Pour l'API complète et le clavier, consulter [WIDGET.md](WIDGET.md).

## 5. Personnaliser l'affichage

Les styles du site ne traversent pas directement le Shadow DOM. Utiliser
les variables CSS ou les parties publiques, comme dans la feuille fournie :

``` css
koha-list-widget {
  --koha-accent: #215a73;
  --koha-focus: #b45105;
  --koha-gap: 1.25rem;
  --koha-radius: .75rem;
}
koha-list-widget::part(list-name) { font-size: 1.5rem; }
koha-list-widget::part(book-link) { border-radius: .75rem; }
```

Conserver le contraste, le focus visible et l'accès aux contrôles au clavier.
La liste des parties est dans [WIDGET.md](WIDGET.md#11-shadow-parts).

## 6. Activer Matomo

Le site hôte configure son tracker Matomo habituel (serveur et identifiant
de site), puis charge l'adaptateur facultatif :

``` html
<script src="/selections/widget/koha-list-widget-matomo.js" defer></script>
```

L'adaptateur ajoute les commandes `trackEvent` à `_paq`, catégorie
`KohaListWidget`. Sans tracker, elles restent en mémoire. Il suit clic notice,
pagination, déplacement manuel, pause/reprise explicite et activation du lien
Excel. L'autoplay n'est pas une interaction. Les noms de champs et le format
des commandes sont détaillés dans [ANALYTICS.md](ANALYTICS.md).

Pour une recette locale, ouvrir le journal de la démo. Pour la recette du site,
effectuer une action puis vérifier sa réception dans Matomo. Cette réception
réelle n'a pas été testée pendant le développement.

## 7. Mettre à jour chaque jour

1. Déposer le nouvel export CSV complet depuis Koha.
2. Exécuter `python scripts/csv_to_json.py` sur la machine de préparation,
   en conservant le dossier de cache et sans lancer deux conversions simultanées.
3. Consulter les logs et le code de sortie : 0 pour conversion réussie,
   1 pour erreur de données/écriture ou au moins un Excel non produit.
   Une panne de couverture seule ne change pas le code en échec.
4. Publier les images et Excel produits, puis le JSON, ou basculer un dossier
   de version complet sur votre hébergement pour éviter une publication partielle.
5. Recharger une page et vérifier une sélection et son téléchargement.

Le Planificateur de tâches Windows ou votre ordonnanceur peut lancer la même
commande avec les chemins absolus de Python et du script. L'automatisation de
l'export Koha et du transfert vers votre hébergement dépend de votre installation
et n'est pas incluse dans ce dépôt.

Le widget recharge les données à son insertion ou au changement de `src` ou
`list_id`, pas périodiquement dans une page déjà ouverte. Le JSON est demandé
avec `cache: no-store`. Si votre hébergement utilise un cache intermédiaire,
adapter sa politique au rythme quotidien ; rafraîchir aussi les JPEG remplacés.
Les anciens fichiers d'export et de couverture ne sont pas supprimés automatiquement.

## 8. Dépanner et valider

| Symptôme | Vérification |
| --- | --- |
| Widget totalement absent | Module chargé, balise autorisée par le CMS, `list_id` entier positif. |
| Message de chargement impossible | Générer le JSON, vérifier `src`, HTTP(S), statut réseau et CORS. |
| Liste introuvable ou vide | Vérifier la clé dans `lists`, les `list_id` des documents et la recherche. |
| Seulement 12 documents | Augmenter `limit`, indépendamment de `paginate`. |
| Pas de couverture | Vérifier `--skip-covers`, `local_cover_url`, les fichiers et les logs fournisseurs. |
| Pas de bouton Excel | Vérifier `export="xlsx"` et `export_xlsx` dans les métadonnées de la liste. |
| Autoplay immobile | Vérifier repli, pause, focus, survol, toucher, onglet masqué et réduction des mouvements. |
| Aucun événement reçu par Matomo | Vérifier l'adaptateur, `_paq`, le tracker du site et sa configuration. |

Pour les tests de développement, installer les dépendances verrouillées puis
le navigateur utilisé par Playwright :

``` console
npm ci
npx playwright install chromium
npm run check
npm test
python -m unittest discover -s tests -v
```

La recette automatisée couvre Chromium ordinateur et mobile simulé, les
contrôles axe, les événements locaux, le traitement des données et les exports.
Elle ne remplace pas les contrôles avec un lecteur d'écran, un appareil tactile
réel, Firefox et Safari. Les fournisseurs réels et Matomo sont des validations
externes distinctes. Voir [TESTING.md](TESTING.md).

### Tests sous WSL : bibliothèques Linux manquantes

Sous WSL, Chromium utilise les bibliothèques de la distribution Linux.
Le navigateur peut être téléchargé correctement mais ne pas démarrer si
ses dépendances système ne sont pas installées. Un cas rencontré et résolu
sur ce projet produisait ces messages :

``` text
Error: browserType.launch: Target page, context or browser has been closed
error while loading shared libraries: libnspr4.so:
cannot open shared object file: No such file or directory
```

La ligne `libnspr4.so` identifie ici la cause : Chromium s'arrête avant
l'exécution du test. Dans le terminal **WSL**, depuis le dossier du projet,
installer les dépendances système puis relancer les tests :

``` bash
npx playwright install-deps chromium
npm test
```

L'installation peut demander le mot de passe administrateur de la distribution.
Elle installe l'ensemble des dépendances nécessaires à Chromium, plutôt que
de corriger les bibliothèques manquantes une par une. Une installation faite
dans Windows ne remplace pas celle requise dans WSL.

Pour une première installation sous Linux/WSL, on peut installer à la fois
le navigateur et ses dépendances avec `npx playwright install --with-deps chromium`.
Voir la [documentation Playwright](https://playwright.dev/docs/browsers#install-system-dependencies).
