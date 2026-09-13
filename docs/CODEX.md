# Instructions de démarrage pour Codex

Lis d'abord `docs/PRD.md`, puis tous les fichiers Markdown de `docs/`.

Le PRD est la source de vérité fonctionnelle. Les autres fichiers
détaillent l'implémentation attendue.

Avant de coder : 1. inspecte le dépôt existant ; 2. compare l'existant
aux spécifications ; 3. propose un plan de modifications par fichiers ;
4. conserve ce qui est déjà conforme ; 5. n'introduis aucun renommage de
contrat sans justification.

Points à ne pas rater : 
- `holdings` est un tableau JSON natif ;
- Excel contient `Exemplaires`, une cellule/document et une ligne/exemplaire ;
- `cover_url` a priorité et sa provenance est mémorisée dans le cache positif ;
- pas de cache négatif permanent pour `cover_url`;
- `compact` = une seule ligne, aucune couverture ;
- Matomo est découplé du Web Component ;
- autoplay n'est pas compté comme interaction utilisateur ;
- accessibilité et reduced motion sont obligatoires.
- attention à l'ambiguïté du terme `list` :
  - `display="list"` désigne un **mode d'affichage** des résultats, au même
    niveau que `carousel`, `grid` et `compact` ;
  - `list_id` et l'attribut HTML `list="11"` désignent une
    **liste Koha** par son identifiant numérique, c'est-à-dire la source/sélection bibliographique.
  - `list` désigne une liste Koha par son nom en clair
  Ces usages sont intentionnels et ne doivent pas être confondus ni renommés pour tenter de les uniformiser.
  
  
Implémente par étapes testables et exécute les tests/syntax checks
disponibles après chaque étape importante.
