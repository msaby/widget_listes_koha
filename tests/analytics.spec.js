import { test, expect } from '@playwright/test';

// Données locales : les tests ne contactent ni Primo ni un serveur Matomo.
const payload = {
  lists: { '11': { list: 'Sélection test', export_xlsx: '../exports/liste-11.xlsx' } },
  documents: Array.from({ length: 15 }, (_, index) => ({
    list_id: '11', biblionumber: String(index + 1), title: `Document ${index + 1}`,
    date: String(2000 + index), authors: index % 2 ? 'Pair' : 'Impair',
  })),
};
async function mount(page, attributes = {}) {
  await page.route('**/data/analytics.json', route => route.fulfill({ json: payload }));
  await page.goto('/tests/fixtures/widget.html');
  await page.evaluate(async attributes => {
    await customElements.whenDefined('koha-list-widget');
    window.interactions = [];
    document.addEventListener('koha-list-widget:interaction', event => window.interactions.push(event.detail));
    const widget = document.createElement('koha-list-widget');
    for (const [key, value] of Object.entries(attributes)) widget.setAttribute(key, value);
    document.querySelector('#mount').append(widget);
    // Annuler uniquement l'ouverture du lien, après son écouteur de suivi.
    // Le vrai clic/clavier reste utilisé, sans ouvrir d'onglet ou télécharger.
    for (const type of ['click', 'auxclick']) widget.shadowRoot.addEventListener(type, event => {
      if (event.target.closest('a')) event.preventDefault();
    });
  }, { src: '/data/analytics.json', list_id: '11', 'analytics-id': 'accueil-11', limit: '15', ...attributes });
  const widget = page.locator('koha-list-widget');
  await expect(widget.locator('.book')).toHaveCount(attributes.paginate ? Number(attributes.paginate) : 15);
  return widget;
}
const events = page => page.evaluate(() => window.interactions);
const adapter = page => page.addScriptTag({ url: '/widget/koha-list-widget-matomo.js' });

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.pageErrors = [];
  page.on('pageerror', error => testInfo.pageErrors.push(error.message));
});
test.afterEach(async ({}, testInfo) => {
  // Si la création de page échoue avant beforeEach, ne pas ajouter une erreur
  // sur un tableau inexistant. Les erreurs JavaScript collectées restent contrôlées.
  if (testInfo.pageErrors === undefined && testInfo.errors.length > 0) return;
  expect(testInfo.pageErrors).toEqual([]);
});

for (const display of ['carousel', 'grid', 'list', 'compact']) {
  test(`clic notice et Excel : contexte ${display}`, async ({ page }) => {
    const widget = await mount(page, { display, export: 'xlsx' });
    await widget.locator('.book-link').first().click();
    await widget.locator('.export').click();
    expect(await events(page)).toEqual([
      { event: 'document_click', widget: 'koha-list-widget', widget_id: 'accueil-11', list_id: 11,
        display, site: '127.0.0.1', page_path: '/tests/fixtures/widget.html',
        page_title: 'Tests du widget Koha', biblionumber: '1', position: 1, page: 1 },
      { event: 'excel_download', widget: 'koha-list-widget', widget_id: 'accueil-11', list_id: 11,
        display, site: '127.0.0.1', page_path: '/tests/fixtures/widget.html', page_title: 'Tests du widget Koha' },
    ]);
    // Sans adaptateur, le composant ne crée même pas de file Matomo.
    expect(await page.evaluate(() => '_paq' in window)).toBe(false);
  });
}

test('pagination haut/bas et position globale après tri, recherche et limite', async ({ page }) => {
  const widget = await mount(page, { display: 'compact', paginate: '3', sort: 'date', searchable: '' });
  await widget.locator('input').fill('Impair');
  await expect(widget.locator('.search-status')).toHaveText('8 documents affichés');
  await widget.locator('.pagination').first().getByRole('button', { name: 'Suivant', exact: true }).click();
  await widget.locator('.book-link').first().press('Enter');
  await widget.locator('.pagination').last().getByRole('button', { name: 'Page 3', exact: true }).click();
  await widget.locator('.pagination').last().getByRole('button', { name: 'Précédent', exact: true }).click();
  const result = await events(page);
  expect(result.map(item => item.event)).toEqual(['pagination_change', 'document_click', 'pagination_change', 'pagination_change']);
  expect(result[0]).toMatchObject({ from_page: 1, page: 2, page_size: 3, navigation_type: 'next', pagination_position: 'top' });
  expect(result[1]).toMatchObject({ biblionumber: '9', position: 4, page: 2 });
  expect(result[2]).toMatchObject({ from_page: 2, page: 3, navigation_type: 'page_number', pagination_position: 'bottom' });
  expect(result[3]).toMatchObject({ from_page: 3, page: 2, navigation_type: 'previous', pagination_position: 'bottom' });
  await widget.locator('.pagination').last().getByRole('button', { name: 'Page 2', exact: true }).click();
  await widget.locator('input').fill('aucun résultat');
  await expect(widget.locator('.book')).toHaveCount(0);
  expect(await events(page)).toHaveLength(4);
});

test('clic central suivi une seule fois, menu contextuel ignoré', async ({ page }) => {
  const widget = await mount(page, { display: 'compact' });
  await widget.locator('.book-link').first().click({ button: 'middle' });
  await widget.locator('.book-link').first().click({ button: 'right' });
  expect(await events(page)).toHaveLength(1);
});

test('carrousel : boutons et clavier après stabilisation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const widget = await mount(page);
  await widget.locator('[part="next"]').click();
  await expect.poll(async () => (await events(page)).length).toBe(1);
  expect((await events(page))[0]).toMatchObject({ event: 'carousel_navigate', navigation_type: 'button', direction: 'next', first_visible_position: 2 });
  await widget.locator('.books').press('Home');
  await expect.poll(async () => (await events(page)).length).toBe(2);
  expect((await events(page))[1]).toMatchObject({ navigation_type: 'scroll', direction: 'previous', first_visible_position: 1 });
});

test('carrousel : un événement par geste, aucun pour un scroll programmatique ou sans déplacement', async ({ page }) => {
  const widget = await mount(page);
  // Désactiver le snap dans ce scénario permet de vérifier une carte partielle.
  await widget.locator('.books').evaluate(books => { books.style.scrollSnapType = 'none'; books.scrollLeft = 100; });
  await page.waitForTimeout(400);
  expect(await events(page)).toEqual([]);
  await widget.locator('.books').dispatchEvent('wheel', { deltaX: 20 });
  await page.waitForTimeout(300);
  expect(await events(page)).toEqual([]);
  await widget.locator('.books').evaluate(books => {
    books.dispatchEvent(new WheelEvent('wheel', { deltaX: 100 }));
    books.scrollLeft = 150;
  });
  await page.waitForTimeout(100);
  await widget.locator('.books').evaluate(books => { books.scrollLeft = 200; });
  expect(await events(page)).toEqual([]);
  await expect.poll(async () => (await events(page)).length).toBe(1);
  expect((await events(page))[0]).toMatchObject({ navigation_type: 'scroll', direction: 'next', first_visible_position: 1 });
});

test('autoplay silencieux, pause/reprise explicites et annulation au changement de rendu', async ({ page }) => {
  const widget = await mount(page, { autoplay: '', 'autoplay-delay': '500', searchable: '' });
  await expect.poll(() => widget.locator('.books').evaluate(node => node.scrollLeft)).toBeGreaterThan(100);
  await page.waitForTimeout(1000);
  expect(await events(page)).toEqual([]);
  await widget.locator('[part="autoplay-toggle"]').click();
  await widget.locator('[part="autoplay-toggle"]').click();
  expect((await events(page)).map(item => item.state)).toEqual(['paused', 'playing']);
  await widget.locator('.books').evaluate(books => {
    books.dispatchEvent(new WheelEvent('wheel'));
    books.scrollLeft += 100;
    books.getRootNode().host.setAttribute('display', 'compact');
  });
  await page.waitForTimeout(400);
  expect(await events(page)).toHaveLength(2);
});

test('toucher maintenu avant le déplacement : suivi après relâchement', async ({ page }) => {
  const widget = await mount(page);
  await widget.locator('.books').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.waitForTimeout(350);
  await widget.locator('.books').evaluate(books => {
    books.style.scrollSnapType = 'none';
    books.scrollLeft = 300;
  });
  await page.waitForTimeout(350);
  expect(await events(page)).toEqual([]);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch' })));
  await expect.poll(async () => (await events(page)).length).toBe(1);
  expect((await events(page))[0]).toMatchObject({ navigation_type: 'scroll', direction: 'next', first_visible_position: 2 });
});

test('identifiants distincts et stables au nouveau rendu et à la reconnexion', async ({ page }) => {
  const widget = await mount(page, { display: 'compact' });
  const ids = await widget.evaluate(async first => {
    first.removeAttribute('analytics-id');
    const second = first.cloneNode();
    first.after(second);
    const details = [];
    document.addEventListener('koha-list-widget:interaction', event => details.push(event.detail.widget_id));
    first.emitInteraction('excel_download');
    second.emitInteraction('excel_download');
    first.setAttribute('sort', 'date');
    await Promise.resolve();
    first.remove();
    second.after(first);
    first.emitInteraction('excel_download');
    return details;
  });
  expect(ids[0]).not.toBe(ids[1]);
  expect(ids[0]).toBe(ids[2]);
});

test('adaptateur : file différée, nom déterministe et chargement en double', async ({ page }) => {
  const widget = await mount(page, { display: 'compact' });
  await adapter(page);
  await adapter(page);
  await widget.locator('.book-link').first().click();
  expect(await page.evaluate(() => window._paq)).toEqual([
    ['trackEvent', 'KohaListWidget', 'document_click',
      'list_id=11 | display=compact | widget_id=accueil-11 | site=127.0.0.1 | page_path=%2Ftests%2Ffixtures%2Fwidget.html | page_title=Tests%20du%20widget%20Koha | biblionumber=1 | position=1 | page=1'],
  ]);
});

test('adaptateur : cinq actions, liste blanche et rejet des événements invalides', async ({ page }) => {
  await mount(page);
  await adapter(page);
  const queue = await page.evaluate(() => {
    const base = { widget: 'koha-list-widget', widget_id: 'accueil | test', list_id: 11, display: 'carousel',
      site: location.hostname, page_path: location.pathname, page_title: document.title,
      email: 'secret@example.invalid', query: 'recherche privée', target_url: 'https://secret.invalid' };
    const send = detail => document.dispatchEvent(new CustomEvent('koha-list-widget:interaction', { detail: { ...base, ...detail } }));
    send({ event: 'document_click', biblionumber: '1', position: 1, page: 1 });
    send({ event: 'pagination_change', from_page: 1, page: 2, page_size: 3, navigation_type: 'next', pagination_position: 'top' });
    send({ event: 'carousel_navigate', navigation_type: 'scroll', direction: 'next', first_visible_position: 2 });
    send({ event: 'autoplay_toggle', state: 'paused' });
    send({ event: 'excel_download' });
    send({ event: 'unknown' });
    send({ event: 'toString' });
    send({ event: 'excel_download', list_id: -1 });
    send({ event: 'document_click', biblionumber: '1', position: 0, page: 1 });
    send({ event: 'excel_download', widget: 'other' });
    return window._paq;
  });
  expect(queue.map(command => command[2])).toEqual(['document_click', 'pagination_change', 'carousel_navigate', 'autoplay_toggle', 'excel_download']);
  expect(JSON.stringify(queue)).not.toMatch(/secret|privée|email|query|target_url/);
  expect(queue[0][3]).toContain('widget_id=accueil%20%7C%20test');
});

test('adaptateur : conserve le tracker existant et tolère sa panne', async ({ page }) => {
  const widget = await mount(page, { display: 'compact', paginate: '3' });
  await page.evaluate(() => {
    window.commands = [];
    window.tracker = window._paq = { push: command => window.commands.push(command) };
  });
  await adapter(page);
  await widget.locator('.book-link').first().click();
  expect(await page.evaluate(() => window._paq === window.tracker && window.commands.length === 1)).toBe(true);
  await page.evaluate(() => { window._paq.push = () => { throw new Error('Tracker indisponible'); }; });
  await widget.locator('.pagination').first().getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(widget.locator('.book-link').first()).toContainText('Document 4');
  expect(await events(page)).toHaveLength(2);
});
