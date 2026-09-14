// Serveur local de démonstration et de tests, limité aux fichiers publics.
// .mjs indique un module JavaScript exécuté par Node.js, pas par le navigateur.
// Aucun framework serveur n'est nécessaire : les modules node: sont fournis avec Node.
// Lancer avec npm start ; arrêter avec Ctrl+C dans le même terminal.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// import.meta.url localise ce script, même si le terminal est ouvert ailleurs.
// Les types MIME indiquent au navigateur comment interpréter chaque extension ;
// un module JavaScript doit notamment être servi avec un type JavaScript correct.
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const port = Number(process.env.PORT || 4173);
http.createServer(async (request, response) => {
  // Cette fonction est appelée pour chaque requête (HTML, script, image, JSON…).
  // await readFile attend le disque sans bloquer le traitement des autres requêtes.
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'demo/index.html' : pathname.slice(1);
    if (!/^(demo|widget|data|covers|exports|tests\/fixtures)\//.test(relative)
        // Ne pas exposer tout le dépôt : autoriser seulement les dossiers publics
        // et refuser les segments cachés ou les séparateurs de chemin Windows.
        || relative.split('/').some(segment => segment.startsWith('.')) || relative.includes('\\')) {
      response.writeHead(404).end();
      return;
    }
    const target = path.resolve(root, relative);
    // Le chemin calculé doit rester sous la racine du projet.
    if (!target.startsWith(root)) { response.writeHead(404).end(); return; }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      // no-store est pratique en développement : une modification est visible
      // au rechargement sans devoir vider manuellement le cache du navigateur.
      'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end('Ressource introuvable'); }
}).listen(port, '127.0.0.1', () => console.log(`Démo : http://127.0.0.1:${port}`));
// 127.0.0.1 limite l'écoute à cet ordinateur. Ce serveur sert la démo locale ;
// la publication finale peut utiliser un serveur statique habituel.
