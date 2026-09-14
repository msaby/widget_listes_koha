# Analytics et Matomo

## 1. Séparation

`koha-list-widget.js` émet :

``` text
koha-list-widget:interaction
```

Il ne connaît pas Matomo.

`koha-list-widget-matomo.js` écoute ces événements et appelle `_paq`.

## 2. Contexte commun

``` javascript
{
  event: "document_click",
  widget: "koha-list-widget",
  widget_id: "list11-accueil",
  list_id: 11,
  display: "compact",
  site: window.location.hostname,
  page_path: window.location.pathname,
  page_title: document.title
}
```

`list_id` est le nom canonique.

## 3. Événements

### `document_click`

Ajouter :

``` text
biblionumber
position
page
```

`position` = position globale après pipeline d'affichage.

### `pagination_change`

Ajouter :

``` text
from_page
page
page_size
navigation_type
pagination_position
```

`navigation_type` : `previous`, `next`, `page_number`.

`pagination_position` : `top`, `bottom`.

### `carousel_navigate`

Interaction manuelle uniquement. Ajouter :

``` text
navigation_type = button | scroll
direction
first_visible_position
```

Déclencher après stabilisation (\~250 ms), pas sur chaque événement DOM
`scroll`.

### `autoplay_toggle`

Action explicite :

``` text
state = paused | playing
```

Les déplacements automatiques ne sont **pas** des interactions
utilisateur et ne doivent pas alimenter `carousel_navigate`.

### `excel_download`

Contexte commun suffisant :

``` text
list_id
display
widget_id
site
page_path
page_title
```

## 4. Adaptateur Matomo

Catégorie :

``` text
KohaListWidget
```

Action = nom de l'événement.

Exemple :

``` javascript
window._paq.push([
  "trackEvent",
  "KohaListWidget",
  action,
  name
]);
```

Le `name` peut être une chaîne déterministe :

``` text
list_id=11 | display=compact | widget=list11 | biblionumber=272037 | position=17 | page=2
```

Ne pas inclure de donnée personnelle.

## 5. Confidentialité

Ne pas envoyer :

-   nom ;
-   login ;
-   numéro de lecteur ;
-   email ;
-   identifiant d'usager ;
-   autre identifiant personnel.

Éviter l'URL cible complète si elle n'est pas nécessaire. `site`,
`page_path`, `page_title`, `biblionumber` et contexte du widget
suffisent.

## 6. KPI

Taux d'interaction :

``` text
visites avec ≥1 événement utilisateur KohaListWidget
------------------------------------------------ × 100
visites des pages contenant le widget
```

Taux de clic Primo :

``` text
visites avec document_click
---------------------------- × 100
visites des pages contenant le widget
```

Taux de téléchargement :

``` text
visites avec excel_download
---------------------------- × 100
visites des pages contenant le widget
```

Ne jamais compter les mouvements autoplay dans les interactions
utilisateur.

## 7. Intégration disponible

``` html
<script type="module" src="/widget/koha-list-widget.js"></script>
<script src="/widget/koha-list-widget-matomo.js" defer></script>
<koha-list-widget src="/data/data.json" list_id="11"
  analytics-id="list11-accueil" display="compact" export="xlsx">
</koha-list-widget>
```

L'adaptateur est facultatif. Il ne charge pas `matomo.js` et ne configure
ni URL de collecte ni identifiant de site. Ces éléments restent à la charge
de la page hôte, comme sa gestion du consentement. Sans tracker chargé,
les commandes restent dans `_paq` en mémoire et aucun envoi n'a lieu.
L'adaptateur conserve une file ou un tracker déjà présent ; un second
chargement n'installe pas d'écouteur supplémentaire. Une erreur du tracker
ne bloque pas l'interface.

Le format suit l'[API JavaScript officielle de Matomo](https://developer.matomo.org/guides/tracking-javascript-guide).
Les noms sont construits dans cet ordre : `list_id`, `display`, `widget_id`,
`site`, `page_path`, `page_title`, puis les champs spécifiques dans l'ordre
décrit ci-dessus. Chaque valeur est encodée avec `encodeURIComponent` pour
éviter les ambiguïtés avec ` | ` ou `=` ; `decodeURIComponent` la restitue.
Les événements inconnus, champs obligatoires invalides et champs supplémentaires
ne sont pas transmis (un événement invalide est entièrement ignoré).

`analytics-id` est recommandé et doit distinguer les emplacements du site.
Sans cet attribut, `widget_id` utilise l'attribut HTML `id`, puis un identifiant
automatique propre à l'instance. Ce dernier survit aux nouveaux rendus et
reconnexions, mais n'est pas garanti stable entre visites.

Les événements sont émis sur la balise avec `bubbles: true` et `composed: true`.
Ils peuvent donc être écoutés au niveau du document, même si le widget est
inséré dans un autre Shadow DOM :

``` javascript
document.addEventListener('koha-list-widget:interaction', event => {
  console.log(event.detail); // Diagnostic local, sans adaptateur requis.
});
```

Les activations de liens au clavier et par clic central sont également suivies.
`excel_download` mesure l'activation du lien, pas la réussite du téléchargement.
Pour le carrousel, `direction` vaut `next` ou `previous` ; le clavier relève
de `navigation_type: scroll`. La première carte même partiellement visible
détermine `first_visible_position` (à partir de 1). Un geste sans déplacement
ne produit rien. Le délai de 250 ms repart après chaque mouvement.
Les suspensions temporaires (survol, focus, toucher) n'émettent pas
`autoplay_toggle` : seul le bouton Pause/Reprendre émet cet événement.

La page hôte doit conserver des titres, chemins et identifiants de widget
sans donnée personnelle. L'adaptateur n'envoie ni paramètres d'URL ni fragment,
ni texte de recherche, ni URL de notice, ni champs bibliographiques supplémentaires.
