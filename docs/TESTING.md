# Plan de tests / critères d'acceptation

## 1. Pipeline CSV → JSON

-   CSV valide.
-   Champs facultatifs vides.
-   Accents, apostrophes, Unicode.
-   ISBN/EAN conservés comme chaînes.
-   `list_id` conservé.
-   `record_url` correct.
-   plusieurs listes dans un même export.
-   JSON valide.

## 2. Holdings

Tester :

``` json
[]
```

un objet, plusieurs objets, propriété manquante, caractères spéciaux
dans la cote, JSON sérialisé invalide.

Vérifier :

-   désérialisation CSV → tableau JSON ;
-   jamais de chaîne JSON dans le JSON final ;
-   widget ne l'affiche pas ;
-   recherche ne l'indexe pas ;
-   Excel le transforme en `Exemplaires`.

## 3. Couvertures

Cas :

-   `cover_url` absente ;
-   présente et valide ;
-   présente et en erreur ;
-   URL identique au cache ;
-   URL modifiée ;
-   URL supprimée après récupération antérieure ;
-   fallback fournisseur ;
-   cache négatif Google/BnF/Amazon ;
-   aucun cache négatif permanent `cover_url` ;
-   erreur couverture sans échec JSON/XLSX.

## 4. XLSX

Vérifier les 12 colonnes et leur ordre.

Tester :

-   titre avec/sans sous-titre ;
-   résumé absent/très long ;
-   ISBN/EAN avec zéros ;
-   hyperlink Primo ;
-   `holdings=[]` → Exemplaires vide ;
-   un exemplaire ;
-   plusieurs exemplaires avec retours à la ligne ;
-   champ `location` manquant → pas de séparateur vide ;
-   wrap Résumé/Exemplaires ;
-   fichier complet malgré `limit`/recherche/pagination du widget ;
-   `export_xlsx` seulement si génération réussie.

## 5. Widget --- sélection

-   `list_id` absent → aucun rendu ;
-   `list_id` non numérique/invalide → aucun rendu ;
-   1 document ;
-   centaines de documents.

## 6. Modes

Tester carousel/grid/list/compact desktop et mobile.

Compact :

-   aucune couverture ;
-   aucun placeholder ;
-   une seule ligne visuelle ;
-   titre/auteurs/éditeur longs ;
-   ellipsis dynamique ;
-   contenu complet accessible ;
-   carte/ligne entière cliquable.

## 7. Recherche / tri / pagination

-   casse et accents ;
-   plusieurs termes = ET ;
-   recherche sur texte complet tronqué visuellement ;
-   `holdings` et `abstract` non recherchés ;
-   tri titre avec articles ;
-   auteurs absents à la fin ;
-   date décroissante ;
-   recherche + pagination ;
-   changement de recherche revient page 1 ;
-   positions globales.

## 8. Visibility

-   absent ;
-   `collapsible` ;
-   `collapsed` ;
-   valeur invalide ;
-   `aria-expanded` ;
-   `hidden` ;
-   autoplay suspendu quand replié.

## 9. Autoplay

-   absent = off ;
-   défaut 5000 ms ;
-   délai personnalisé ;
-   boucle ;
-   hover ;
-   focus ;
-   bouton ;
-   scroll ;
-   touch ;
-   Pause persistante ;
-   Reprendre ;
-   délai complet avant reprise ;
-   reduced motion = autoplay off ;
-   aucune annonce live répétitive.

## 10. Accessibilité

-   navigation clavier complète ;
-   focus visible ;
-   vrais liens/boutons ;
-   nouvel onglet annoncé ;
-   alt vide sur couvertures ;
-   recherche labellisée ;
-   pagination `aria-current` ;
-   skip-widget sort du Shadow DOM ;
-   aucun piège de focus ;
-   compact accessible malgré ellipsis.

## 11. Analytics

Pour chaque mode :

-   `document_click`;
-   `pagination_change`;
-   `carousel_navigate`;
-   `autoplay_toggle`;
-   `excel_download`.

Vérifier `list_id`, `display`, `widget_id`, site/path/title, positions
globales. Vérifier qu'un déplacement autoplay ne produit pas une
interaction de navigation utilisateur.

## 12. Régression API

Recherche automatique dans le code pour empêcher le retour d'anciens
noms :

``` text
list_no
visibilty
```

Ils ne doivent pas apparaître dans le contrat public ou le modèle de
données.

## 13. Tests navigateur de l'étape 4

Prérequis de développement : Node.js 22 ou ultérieur.

Sous Linux/WSL, installer aussi les dépendances système de Chromium avec
`npx playwright install-deps chromium`, dans le terminal Linux utilisé pour
les tests. Une erreur de lancement mentionnant `libnspr4.so` manquante a été
résolue ainsi sur ce projet. Voir le
[dépannage WSL du guide d'utilisation](UTILISATION.md#tests-sous-wsl--bibliothèques-linux-manquantes).

Si un lancement échoue avant l'ouverture du navigateur, lire la première
erreur du rapport. Le contrôle des erreurs JavaScript en fin de test ne peut
pas s'exécuter si la page n'a pas été créée ; il conserve alors l'échec initial.
Vérifier `node --version` dans le terminal utilisé pour `npm test`. Si le
rapport indique que l'exécutable Chromium est absent, exécuter
`npx playwright install chromium` avec cette même installation de Node.

``` console
npm install
npx playwright install chromium
npm run check
npm test
```

Playwright lance automatiquement le serveur local de test. Les scénarios
s'exécutent dans Chromium sur ordinateur et avec le profil mobile Pixel 7.
Ils utilisent des données locales simulées, sans appeler les fournisseurs
de couvertures. Les contrôles axe complètent les tests clavier et de focus.
L'horloge simulée permet de vérifier les délais et suspensions de l'autoplay.

Le test de démonstration utilise `data/data.json` lorsqu'il est présent et
enregistre des captures de chaque mode dans `test-results/`. Il est ignoré
si ce fichier généré est absent. Pour l'inclure sans solliciter les API :

``` console
python scripts/csv_to_json.py --skip-covers
npm test
```

Les traces des échecs sont conservées dans `test-results/`. Les tests
automatisés ne remplacent pas une vérification avec un lecteur d'écran,
un véritable écran tactile, Firefox et Safari. Ces contrôles manuels
restent à effectuer.

## 14. Tests analytics de l'étape 5

`tests/analytics.spec.js` vérifie les clics dans les quatre modes, le clavier,
le clic central, le contexte commun, les identifiants d'instance et les
positions globales après tri et recherche. La pagination distingue haut/bas
et précédent/suivant/numéro de page. Le carrousel attend sa stabilisation,
compte les cartes partiellement visibles et ignore autoplay, gestes sans
déplacement, défilements programmatiques et changements de rendu.

Les tests de l'adaptateur utilisent uniquement une file `_paq` locale :
cinq actions, format déterministe, champs supplémentaires ignorés, données
invalides rejetées, double chargement, tracker existant et tracker en panne.
Aucune donnée n'est envoyée à un serveur Matomo.

``` console
npx playwright test tests/analytics.spec.js
```

La réception dans un véritable tableau de bord Matomo reste à vérifier
sur le site hôte, avec sa configuration et sa politique de consentement.

## 15. Livraison et démonstration

Suivre le démarrage de [UTILISATION.md](UTILISATION.md), puis parcourir les
six exemples de la démo et leur code HTML. `tests/demo.spec.js` vérifie aussi
l'ouverture depuis la racine du serveur, le journal local et son effacement,
le cas où le JSON manque, et les téléchargements XLSX générés. Le scénario
avec données réelles nécessite la conversion préalable ; les scénarios de
journal et de JSON absent sont autonomes.
