import { defineConfig, devices } from '@playwright/test';

// Playwright lit ce fichier quand on lance npm test. Il orchestre les navigateurs,
// le serveur local et les rapports ; aucun de ces outils n'est chargé par le widget.

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  // Les tests sont isolés ; deux processus peuvent les exécuter simultanément.
  workers: 2,
  timeout: 20000,
  // Les durées sont en millisecondes. Conserver la trace seulement en cas d'échec
  // permet d'inspecter ensuite les actions et l'état de la page au moment du problème.
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    // Un « projet » rejoue les mêmes tests avec un profil différent. Le profil
    // Pixel 7 simule un écran mobile et le tactile dans Chromium, pas un vrai téléphone.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // process.execPath réutilise le Node qui exécute les tests. Playwright attend
    // que l'URL réponde avant de démarrer les scénarios, puis arrête son serveur.
    command: `"${process.execPath}" scripts/serve.mjs`,
    url: 'http://127.0.0.1:4173/tests/fixtures/widget.html',
    reuseExistingServer: !process.env.CI,
    // En local, réutiliser un serveur déjà lancé ; en intégration continue (CI),
    // exiger un serveur propre pour ne pas tester accidentellement une ancienne instance.
  },
});
