// Tests du composant dans un vrai navigateur, piloté par Playwright.
// Lancer avec npm test. La configuration rejoue ces scénarios sur ordinateur et mobile.
// Chaque test reçoit une page isolée ; await attend une action ou une vérification.
// Les assertions de locators (toBeVisible, toHaveText…) réessaient automatiquement
// pendant un court délai, car le chargement et le rendu sont asynchrones.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const documents = Array.from({ length: 43 }, (_, index) => ({
  // Jeu de données reproductible, avec plus de documents que la limite par défaut.
  // Les mots « introuvable » dans les champs exclus détectent une recherche trop large.
  biblionumber: String(index + 1), list_id: '11', list: 'Fonds professionnels', list_sort: 'title',
  document_type: 'Livre', title: `Document ${String(index + 1).padStart(2, '0')}`,
  subtitle: '', authors: 'Élodie Martin', publisher: 'Éditions du Cercle', date: String(2000 + index),
  abstract: 'résuméintrouvable', holdings: [{ library: 'coteintrouvable' }],
  isbn: '9782765409779', cover_url: 'https://fournisseur.invalid/image.jpg', local_cover_url: '',
  record_url: `https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA${index + 1}`,
}));
const payload = { lists: { '11': { list_id: '11', list: 'Fonds professionnels', list_sort: 'title', export_xlsx: '../exports/liste-11.xlsx' },
  '32': { list_id: '32', list: 'Autre sélection' } }, documents };

test.beforeEach(async ({ page }, testInfo) => {
  // Un test ne doit pas passer uniquement parce que le bon texte était déjà présent
  // avant une erreur JavaScript. Capturer aussi les erreurs non gérées de la page.
  testInfo.pageErrors = [];
  page.on('pageerror', error => testInfo.pageErrors.push(error.message));
});
test.afterEach(async ({}, testInfo) => {
  // Playwright prépare page AVANT d'exécuter beforeEach. Si le navigateur
  // ne démarre pas, pageErrors n'est jamais initialisé, mais afterEach est
  // quand même appelé. Laisser alors l'erreur initiale expliquer l'échec.
  // Sans erreur préalable, une initialisation oubliée doit toujours échouer.
  if (testInfo.pageErrors === undefined && testInfo.errors.length > 0) return;
  expect(testInfo.pageErrors).toEqual([]);
});

async function mount(page, attributes = {}, data = payload) {
  // Intercepter la requête JSON pour fournir les données du test. Aucun serveur
  // Koha ni fournisseur d'images n'est requis pour tester les interactions.
  await page.route('**/data/fixture.json', route => route.fulfill({ json: data }));
  await page.goto('/tests/fixtures/widget.html');
  await page.evaluate(async attributes => {
    // Le code de evaluate s'exécute DANS le navigateur ; le reste du test est dans Node.
    // On transmet donc explicitement les attributs comme argument de evaluate.
    await customElements.whenDefined('koha-list-widget');
    // Attendre l'enregistrement de la balise avant de créer l'instance à tester.
    const widget = document.createElement('koha-list-widget');
    for (const [key, value] of Object.entries(attributes)) if (value !== null) widget.setAttribute(key, value);
    document.querySelector('#mount').append(widget);
  }, { src: '/data/fixture.json', list_id: '11', ...attributes });
  const widget = page.locator('koha-list-widget').first();
  if (attributes.list_id !== null && attributes.list_id !== 'bad') {
    await expect(widget.locator('.books')).toBeAttached();
  }
  return widget;
}

for (const mode of ['carousel', 'grid', 'list', 'compact']) {
  // Une boucle déclare quatre tests identiques pour le contrat commun à tous les modes.
  test(`affichage ${mode}, limite et liens accessibles`, async ({ page }) => {
    const widget = await mount(page, { display: mode, 'show-list-name': '' });
    await expect(widget.getByRole('listitem')).toHaveCount(12);
    await expect(widget.getByRole('heading', { name: 'Fonds professionnels' })).toBeVisible();
    const first = widget.locator('.book-link').first();
    await expect(first).toHaveAttribute('target', '_blank');
    await expect(first).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(first).toHaveAccessibleName(/Document 01.*nouvel onglet/);
    await expect(first).toHaveAttribute('href', /33UCA_KOHA1$/);
    await expect(widget.locator('[part="cover"]')).toHaveCount(mode === 'compact' ? 0 : 12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('sélection invalide silencieuse, liste vide et liste inconnue', async ({ page }) => {
  let widget = await mount(page, { list_id: null });
  await expect(widget.locator('section')).toHaveCount(0);
  for (const value of ['bad', '0', '-1', '1.5', '9007199254740992']) {
    await widget.evaluate((node, value) => node.setAttribute('list_id', value), value);
    await expect(widget.locator('section')).toHaveCount(0);
  }
  await widget.evaluate(node => node.setAttribute('list_id', '32'));
  await expect(widget).toContainText('Cette sélection ne contient aucun document.');
  await widget.evaluate(node => node.setAttribute('list_id', '999'));
  await expect(widget).toContainText('Cette liste est introuvable.');
});

test('compact reste sur une ligne et conserve les textes longs', async ({ page }) => {
  // La présence de CSS ne suffit pas à prouver l'absence de retour à la ligne :
  // mesurer la hauteur réelle et vérifier que le titre déborde sa boîte d'affichage.
  const title = 'Un titre particulièrement long '.repeat(20);
  const widget = await mount(page, { display: 'compact' }, { ...payload, documents: [{ ...documents[0], title }] });
  await expect(widget.locator('.title')).toHaveText(title.trimEnd());
  const dimensions = await widget.locator('.compact-row').evaluate(node => ({
    height: node.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(node).lineHeight),
    titleWidth: node.querySelector('.title').clientWidth,
    titleScroll: node.querySelector('.title').scrollWidth,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.line + 2);
  expect(dimensions.titleScroll).toBeGreaterThan(dimensions.titleWidth);
  await expect(widget.locator('.book-link')).toHaveAccessibleName(new RegExp('Un titre particulièrement long'));
});

test('contenu traité comme texte et couverture résolue depuis le JSON', async ({ page }) => {
  // Les données hostiles sont intentionnelles. Le test vérifie qu'elles restent
  // du texte et que le navigateur n'utilise pas l'URL de couverture du fournisseur.
  const requested = [];
  page.on('request', request => requested.push(request.url()));
  await page.route('**/covers/test.jpg', route => route.fulfill({ status: 404 }));
  const widget = await mount(page, { display: 'grid' }, { ...payload, documents: [{ ...documents[0],
    title: '<img src=x onerror=alert(1)>', local_cover_url: '../covers/test.jpg', record_url: 'javascript:alert(1)' }] });
  await expect(widget.locator('.title')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(widget.locator('.placeholder')).toBeVisible();
  expect(requested.some(value => value.endsWith('/covers/test.jpg'))).toBe(true);
  expect(requested.some(value => value.includes('fournisseur.invalid'))).toBe(false);
  await expect(widget.locator('.book-link')).toHaveAttribute('href', /33UCA_KOHA1$/);
});

test('tri sur articles, auteurs manquants et dates', async ({ page }) => {
  const data = { ...payload, documents: [
    { ...documents[0], title: 'Le Zèbre', authors: '', date: 's.d.' },
    { ...documents[1], title: 'L’abeille', authors: 'Zoé', date: '2024' },
    { ...documents[2], title: 'The Bear', authors: 'André', date: '[2025]' },
  ] };
  const widget = await mount(page, { display: 'compact' }, data);
  await expect(widget.locator('.title')).toHaveText(['L’abeille', 'The Bear', 'Le Zèbre']);
  await widget.evaluate(node => node.setAttribute('sort', 'authors'));
  await expect(widget.locator('.title')).toHaveText(['The Bear', 'L’abeille', 'Le Zèbre']);
  await widget.evaluate(node => node.setAttribute('sort', 'date'));
  await expect(widget.locator('.title')).toHaveText(['The Bear', 'L’abeille', 'Le Zèbre']);
});

test('sortie clavier du Shadow DOM et contrôle axe', async ({ page }) => {
  // Tester le clavier réel de Playwright vérifie où va la touche Tab après le saut.
  // axe analyse ensuite des règles d'accessibilité automatisables ; il ne remplace
  // pas un essai humain avec lecteur d'écran.
  const widget = await mount(page, { display: 'grid', 'show-list-name': '' });
  const skip = widget.getByRole('button', { name: 'Passer cette sélection de documents' });
  await skip.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement === document.querySelector('koha-list-widget').nextElementSibling)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('#after')).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('recherche ET sans accents avant limite, exclusion des champs non recherchés', async ({ page }) => {
  const widget = await mount(page, { display: 'list', searchable: '', limit: '2', paginate: '1' });
  const search = widget.getByRole('searchbox');
  await search.fill('elodie 43');
  await expect(widget.locator('.title')).toHaveText(['Document 43']);
  for (const term of ['résuméintrouvable', 'coteintrouvable', '9782765409779', 'fournisseur']) {
    await search.fill(term);
    await expect(widget.locator('.book')).toHaveCount(0);
    await expect(widget.locator('[part="search-empty"]')).toContainText('Aucun document');
  }
  await search.fill('DOCUMENT cercle');
  await expect(widget.locator('.title')).toHaveText(['Document 01']);
  await expect(search).toBeFocused();
});

test('pagination synchronisée et focus conservé dans la pagination utilisée', async ({ page }) => {
  // La position 11 à la page 2 prouve que les numéros restent globaux à la sélection.
  const widget = await mount(page, { display: 'grid', searchable: '', limit: '43', paginate: '10' });
  const top = widget.getByRole('navigation', { name: 'Pagination en haut de la sélection' });
  const bottom = widget.getByRole('navigation', { name: 'Pagination en bas de la sélection' });
  await expect(top.getByRole('button', { name: 'Précédent' })).toBeDisabled();
  await bottom.getByRole('button', { name: 'Suivant' }).click();
  await expect(widget.locator('.title').first()).toHaveText('Document 11');
  await expect(widget.locator('.book').first()).toHaveAttribute('aria-posinset', '11');
  await expect(bottom.getByRole('button', { name: 'Suivant' })).toBeFocused();
  await expect(top.locator('[aria-current="page"]')).toHaveText('2');
  await top.getByRole('button', { name: 'Page 5', exact: true }).click();
  await expect(top.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  await expect(widget.locator('.book')).toHaveCount(3);
  await widget.getByRole('searchbox').fill('Élodie');
  await expect(top.locator('[aria-current="page"]')).toHaveText('1');
});

test('repli conserve nom et description, export complet reste indépendant', async ({ page }) => {
  // Le href de l'Excel doit rester le même avant et après filtrage : le fichier
  // contient la liste complète et n'est jamais reconstruit par le navigateur.
  const widget = await mount(page, { display: 'compact', searchable: '', visibility: 'collapsed',
    'show-list-name': '', description: 'Description de la sélection', export: 'xlsx', limit: '2' });
  await expect(widget.getByRole('heading', { name: 'Fonds professionnels' })).toBeVisible();
  await expect(widget.getByText('Description de la sélection')).toBeVisible();
  await expect(widget.locator('[part="collapsible-content"]')).toBeHidden();
  const toggle = widget.getByRole('button', { name: 'Afficher les documents' });
  await toggle.click();
  await expect(widget.locator('[part="visibility-toggle"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(widget.locator('[part="collapsible-content"]')).toBeVisible();
  const link = widget.getByRole('link', { name: 'Télécharger la liste complète au format Excel' });
  await expect(link).toHaveAttribute('href', 'http://127.0.0.1:4173/exports/liste-11.xlsx');
  await widget.getByRole('searchbox').fill('43');
  await expect(widget.locator('.title')).toHaveText(['Document 43']);
  await expect(link).toHaveAttribute('href', 'http://127.0.0.1:4173/exports/liste-11.xlsx');
  await widget.evaluate(node => node.setAttribute('visibility', 'invalid'));
  await expect(widget.locator('[part="visibility-toggle"]')).toHaveCount(0);
});

test('pas de lien Excel sans métadonnée et aucun état partagé entre instances', async ({ page }) => {
  const widget = await mount(page, { display: 'compact', export: 'xlsx', searchable: '' },
    { ...payload, lists: { '11': { list: 'Sans export' } } });
  await expect(widget.locator('.export')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#mount').append(document.querySelector('koha-list-widget').cloneNode()));
  const second = page.locator('koha-list-widget').nth(1);
  await expect(second.locator('.book')).toHaveCount(12);
  await widget.getByRole('searchbox').fill('43');
  await expect(widget.locator('.book')).toHaveCount(1);
  await expect(second.locator('.book')).toHaveCount(12);
});

test('texte tronqué visuellement mais complet pour recherche et accessibilité', async ({ page }) => {
  const title = 'Titre très long '.repeat(25) + 'motuniquefinal';
  const widget = await mount(page, { display: 'grid', searchable: '' }, { ...payload,
    documents: [{ ...documents[0], title, authors: 'Auteur '.repeat(20) }] });
  await expect(widget.locator('.title [aria-hidden]')).toHaveText(title.slice(0, 140) + '...');
  await expect(widget.locator('.book-link')).toHaveAccessibleName(/motuniquefinal/);
  await widget.getByRole('searchbox').fill('motuniquefinal');
  await expect(widget.locator('.book')).toHaveCount(1);
});

test('carrousel manuel au clavier et boutons, pagination ignorée', async ({ page }) => {
  const widget = await mount(page, { display: 'carousel', paginate: '2' });
  await expect(widget.locator('.book')).toHaveCount(12);
  await expect(widget.getByRole('navigation')).toHaveCount(0);
  await expect(widget.getByRole('button', { name: 'Documents précédents' })).toBeDisabled();
  await widget.getByRole('button', { name: 'Documents suivants' }).click();
  await expect.poll(() => widget.locator('.books').evaluate(node => node.scrollLeft)).toBeGreaterThan(100);
  await widget.locator('.book-link').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(widget.locator('.book-link').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(widget.locator('.book-link').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(widget.locator('.book-link').first()).toBeFocused();
});

async function autoplay(page, attributes = {}) {
  // L'horloge simulée contrôle les timers de la page : quelques millisecondes
  // de test suffisent à vérifier plusieurs secondes ou minutes de fonctionnement.
  // Installer puis figer l'horloge AVANT de créer le widget évite les timers mixtes.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const widget = await mount(page, { display: 'carousel', autoplay: '', ...attributes });
  // Stabiliser le layout avant de figer l'horloge de chaque scénario.
  await page.clock.runFor(100);
  return widget;
}
const scrollLeft = widget => widget.locator('.books').evaluate(node => node.scrollLeft);

test('autoplay défaut 5000 ms, boucle et silence de la région live', async ({ page }) => {
  const widget = await autoplay(page);
  await page.clock.runFor(4800);
  expect(await scrollLeft(widget)).toBe(0);
  await page.clock.runFor(500);
  expect(await scrollLeft(widget)).toBeGreaterThan(100);
  expect(await widget.locator('.sr-only[role="status"]').textContent()).toBe('');
  await widget.locator('.books').evaluate(node => { node.scrollLeft = node.scrollWidth; });
  await page.clock.runFor(350);
  await page.clock.runFor(5100);
  expect(await scrollLeft(widget)).toBe(0);
});

test('pause explicite persistante et reprise après un délai complet', async ({ page }) => {
  // click() dans evaluate déclenche ici le bouton sans y placer le focus souris.
  // Sinon la pause automatique liée au focus masquerait le comportement du bouton testé.
  const widget = await autoplay(page, { 'autoplay-delay': '1000' });
  await widget.locator('[part="autoplay-toggle"]').evaluate(node => node.click());
  await page.clock.runFor(4000);
  expect(await scrollLeft(widget)).toBe(0);
  await expect(widget.locator('[part="autoplay-toggle"]')).toHaveText('Reprendre le défilement');
  await widget.locator('[part="autoplay-toggle"]').evaluate(node => node.click());
  await page.clock.runFor(900);
  expect(await scrollLeft(widget)).toBe(0);
  await page.clock.runFor(200);
  expect(await scrollLeft(widget)).toBeGreaterThan(0);
});

test('autoplay suspendu pendant hover, focus, toucher et repli', async ({ page }) => {
  // Les événements synthétiques isolent chaque cause de suspension. Le comportement
  // tactile physique doit encore être vérifié sur un appareil réel.
  const widget = await autoplay(page, { 'autoplay-delay': '1000', visibility: 'collapsible' });
  await widget.dispatchEvent('pointerenter', { pointerType: 'mouse' });
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(0);
  await widget.dispatchEvent('pointerleave', { pointerType: 'mouse' });
  await widget.locator('.book-link').first().focus();
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(0);
  await page.locator('#after').focus();
  await widget.locator('.books').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(0);
  await widget.dispatchEvent('pointerup', { pointerType: 'touch' });
  await widget.locator('[part="visibility-toggle"]').evaluate(node => node.click());
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(0);
  await widget.locator('[part="visibility-toggle"]').evaluate(node => node.click());
  await page.clock.runFor(1100);
  expect(await scrollLeft(widget)).toBeGreaterThan(0);
});

test('reduced motion et modes autres que carousel désactivent autoplay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const widget = await autoplay(page, { 'autoplay-delay': '500' });
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(0);
  await expect(widget.locator('[part="autoplay-toggle"]')).toBeDisabled();
  for (const display of ['list', 'grid', 'compact']) {
    await widget.evaluate((node, mode) => node.setAttribute('display', mode), display);
    await expect(widget.locator('[part="autoplay-toggle"]')).toHaveCount(0);
  }
});

test('recherche réinitialise scroll et déconnexion nettoie les timers', async ({ page }) => {
  const widget = await autoplay(page, { 'autoplay-delay': '500', searchable: '' });
  await page.clock.runFor(700);
  expect(await scrollLeft(widget)).toBeGreaterThan(0);
  await widget.getByRole('searchbox').fill('43');
  await page.clock.runFor(250);
  await expect(widget.locator('.book')).toHaveCount(1);
  expect(await scrollLeft(widget)).toBe(0);
  await widget.evaluate(node => { window.detachedWidget = node; node.remove(); });
  await page.clock.runFor(10000);
  await page.evaluate(() => document.querySelector('#mount').append(window.detachedWidget));
  await expect(widget.locator('.book')).toHaveCount(1);
});

test('échec HTTP puis changement de source, format invalide et attributs dynamiques', async ({ page }) => {
  const widget = await mount(page, { display: 'compact' });
  await page.route('**/bad.json', route => route.fulfill({ status: 503 }));
  await widget.evaluate(node => node.setAttribute('src', '/bad.json'));
  await expect(widget).toContainText('Impossible de charger');
  await page.route('**/invalid.json', route => route.fulfill({ json: { documents: null } }));
  await widget.evaluate(node => node.setAttribute('src', '/invalid.json'));
  await expect(widget).toContainText('Impossible de charger');
  await widget.evaluate(node => { node.setAttribute('src', '/data/fixture.json'); node.setAttribute('limit', 'invalid'); });
  await expect(widget.locator('.book')).toHaveCount(12);
  await widget.evaluate(node => node.setAttribute('list_id', '32'));
  await expect(widget.locator('.book')).toHaveCount(0);
});

test('500 documents, pagination compacte et contrôle axe avec tous les contrôles', async ({ page }) => {
  const data = { ...payload, documents: Array.from({ length: 500 }, (_, i) => ({ ...documents[0], biblionumber: String(i + 1), title: `Titre ${i + 1}` })) };
  const widget = await mount(page, { display: 'compact', limit: '500', paginate: '40', searchable: '',
    'show-list-name': '', description: 'Sélection à explorer', export: 'xlsx', visibility: 'collapsible' }, data);
  await expect(widget.locator('.book')).toHaveCount(40);
  await expect(widget.locator('.summary').first()).toHaveText('Page 1 sur 13');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('requête ancienne ignorée après changement de src', async ({ page }) => {
  // Garder une requête en attente puis livrer sa réponse en retard reproduit une
  // course réseau : une ancienne source ne doit pas écraser la sélection actuelle.
  const widget = await mount(page);
  let release;
  const intercepted = new Promise(resolve => { release = resolve; });
  let pending;
  await page.route('**/slow.json', route => { pending = route; release(); });
  await widget.evaluate(node => node.setAttribute('src', '/slow.json'));
  await intercepted;
  await expect(widget).toContainText('Chargement de la sélection');
  await widget.evaluate(node => node.setAttribute('src', '/data/fixture.json'));
  await expect(widget.locator('.book')).toHaveCount(12);
  await pending.fulfill({ json: { ...payload, documents: [] } }).catch(() => {});
  await expect(widget.locator('.book')).toHaveCount(12);
});

test('autoplay absent, document unique, scroll manuel et préférence modifiée', async ({ page }) => {
  const widget = await autoplay(page, { 'autoplay-delay': '1000', autoplay: null });
  await page.clock.runFor(3000);
  expect(await scrollLeft(widget)).toBe(0);
  await expect(widget.locator('[part="autoplay-toggle"]')).toHaveCount(0);
  await widget.evaluate(node => node.setAttribute('autoplay', ''));
  await page.clock.runFor(100);
  // Attendre le vrai événement navigateur avant d'avancer l'horloge simulée.
  // Viser exactement une carte évite une animation de snap (280 → 276), dont
  // les frames ne sont pas synchronisées avec les timers simulés de Playwright.
  await widget.locator('.books').evaluate(node => new Promise(resolve => {
    node.addEventListener('scroll', () => resolve(), { once: true });
    node.scrollTo({ left: node.children[1].offsetLeft - node.children[0].offsetLeft, behavior: 'instant' });
  }));
  await page.clock.runFor(350);
  const manualPosition = await scrollLeft(widget);
  await page.clock.runFor(700);
  expect(await scrollLeft(widget)).toBe(manualPosition);
  await page.clock.runFor(500);
  expect(await scrollLeft(widget)).toBeGreaterThan(manualPosition);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(100);
  await expect(widget.locator('[part="autoplay-toggle"]')).toBeDisabled();
  const reducedPosition = await scrollLeft(widget);
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(reducedPosition);
  await widget.evaluate(node => node.setAttribute('limit', '1'));
  await page.clock.runFor(100);
  await expect(widget.locator('.book')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.runFor(2000);
  expect(await scrollLeft(widget)).toBe(0);
});

test('accessibilité du carrousel avec autoplay et focus visible', async ({ page }) => {
  const widget = await mount(page, { autoplay: '', searchable: '', visibility: 'collapsible', 'show-list-name': '' });
  await widget.locator('[part="autoplay-toggle"]').focus();
  expect(await widget.locator('[part="autoplay-toggle"]').evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
