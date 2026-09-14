import { existsSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Ce test complète les données simulées de widget.spec.js avec les fichiers
// réellement produits par Python. Il est facultatif sur un dépôt fraîchement cloné.

test('démo avec les données générées, captures des quatre modes', async ({ page }, testInfo) => {
  test.skip(!existsSync('data/data.json'), 'Générer les données avec csv_to_json.py --skip-covers pour ce test de démonstration.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Désactiver les mouvements rend les captures stables, même dans les démos autoplay.
  await page.goto('/demo/index.html');
  for (const mode of ['carousel', 'grid', 'list', 'compact']) {
    const widget = page.locator(`koha-list-widget[display="${mode}"]`).first();
    await expect(widget.locator('.book').first()).toBeVisible();
    await widget.screenshot({ path: testInfo.outputPath(`${mode}.png`) });
    // outputPath sépare les captures par test et par profil (ordinateur/mobile).
    // Ces images servent à une inspection visuelle, pas à une comparaison pixel par pixel.
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // La livraison doit inclure les vrais fichiers annoncés par le JSON.
  // Un XLSX est une archive ZIP : ses deux premiers octets sont « PK ».
  const exports = await page.locator('koha-list-widget .export').evaluateAll(links => [...new Set(links.map(link => link.href))]);
  expect(exports).toHaveLength(2);
  for (const url of exports) {
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('spreadsheetml.sheet');
    expect((await response.body()).subarray(0, 2).toString()).toBe('PK');
  }
  // Une page plus large que la fenêtre signalerait un débordement horizontal global.
  expect(errors).toEqual([]);
});

test('démo à la racine : exemples et journal local utilisables', async ({ page }) => {
  // Ce petit jeu local garde la recette du guide utilisable sur un clone neuf.
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/data/data.json', route => route.fulfill({ json: {
    lists: { '11': { list: 'Liste test' }, '32': { list: 'Autre test' } },
    documents: [{ list_id: '11', biblionumber: '1', title: 'Exemple' },
      { list_id: '32', biblionumber: '2', title: 'Autre exemple' }],
  } }));
  await page.goto('/');
  await expect(page.locator('.integration-example')).toHaveCount(6);
  await page.locator('#compact .integration-example summary').click();
  await expect(page.locator('#compact .integration-example code')).toContainText('src="/data/data.json"');
  await expect(page.locator('#compact .integration-example code')).toContainText('list_id="32"');
  const widget = page.locator('#compact koha-list-widget');
  // Conserver l'activation clavier, mais éviter toute navigation vers Primo.
  await widget.evaluate(node => node.shadowRoot.addEventListener('click', event => event.preventDefault()));
  await widget.locator('.book-link').press('Enter');
  await page.locator('#analytics summary').click();
  await expect(page.locator('#event-log')).toContainText('document_click');
  await expect(page.locator('#event-log')).toContainText('demo-compact-32');
  expect(await page.evaluate(() => window._paq.length)).toBe(1);
  await page.getByRole('button', { name: 'Effacer le journal local' }).click();
  await expect(page.locator('#event-log')).toHaveText('Aucune interaction pour le moment.');
  expect(await page.evaluate(() => window._paq.length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('démo sans données : instructions de préparation accessibles', async ({ page }) => {
  await page.route('**/data/data.json', route => route.fulfill({ status: 404 }));
  await page.goto('/demo/index.html');
  await page.getByText('Démarrer et intégrer la démonstration', { exact: true }).click();
  await expect(page.getByText('python scripts/csv_to_json.py --skip-covers', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.integration-example')).toHaveCount(6);
  await expect(page.locator('#grid koha-list-widget .message')).toBeVisible();
});
