// Ce script sert uniquement à la démonstration : ne pas le copier sur le site
// de production. Il explique les exemples et affiche un diagnostic local.
for (const widget of document.querySelectorAll('koha-list-widget')) {
  // Construire l'exemple depuis les vrais attributs évite de documenter une
  // configuration différente de celle visible. Seul src devient relatif à la
  // racine du site, comme les scripts du bloc d'intégration en haut de page.
  const attributes = [...widget.attributes].map(attribute => {
    const value = attribute.name === 'src' ? '/data/data.json' : attribute.value;
    // Échapper les caractères réservés pour obtenir du HTML réutilisable.
    const escaped = value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    return `  ${attribute.name}="${escaped}"`;
  });
  const details = document.createElement('details');
  details.className = 'integration-example';
  const summary = document.createElement('summary');
  summary.textContent = 'Code HTML de cet exemple';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  // textContent montre les balises comme texte, sans créer un autre widget.
  code.textContent = `<koha-list-widget\n${attributes.join('\n')}>\n</koha-list-widget>`;
  pre.append(code);
  details.append(summary, pre);
  widget.after(details);
}

const recent = [];
const output = document.querySelector('#event-log');
document.addEventListener('koha-list-widget:interaction', event => {
  // unshift ajoute au début, length limite la mémoire et la longueur du journal.
  // Pas de région aria-live ici : le diagnostic ne doit pas interrompre la lecture.
  recent.unshift(event.detail);
  recent.length = Math.min(recent.length, 10);
  output.textContent = JSON.stringify(recent, null, 2);
});
document.querySelector('#clear-events').addEventListener('click', () => {
  recent.length = 0;
  output.textContent = 'Aucune interaction pour le moment.';
  // La file _paq appartient à l'adaptateur : effacer ce diagnostic ne la modifie pas.
});
