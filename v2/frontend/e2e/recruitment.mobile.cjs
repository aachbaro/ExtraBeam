/* Real browser + Django scenario. No mocked recruitment HTTP responses.
 * Configure DEMO_PYTHON, SQLITE_PATH and serve the isolated backend/frontend.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.DEMO_BASE_URL || 'http://127.0.0.1:5193';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'This scenario must run against a local server.');
const output = path.join(__dirname, 'artifacts');
fs.mkdirSync(output, { recursive: true });
function fixture(action, id) {
  return JSON.parse(execFileSync(process.env.DEMO_PYTHON || 'python', [path.join(__dirname, 'recruitment_fixtures.py'), action, ...(id ? [id] : [])], { env: process.env, encoding: 'utf8' }).trim());
}
const data = fixture('seed');
const errors = [];
const steps = [];
let browser;
let pages = {};
async function shot(page, label) {
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true, animations: 'disabled' });
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert(dimensions.width <= dimensions.viewport + 1, `${label}: horizontal overflow ${dimensions.width}/${dimensions.viewport}`);
  steps.push(label); console.log('PASS', label);
}
async function checkText(page, text) { await page.getByText(text, { exact: false }).first().waitFor(); }
async function login(page, persona) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Adresse email').fill(persona.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(data.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL(/\/extras\//);
}
async function responseAfter(page, predicate, action) {
  const response = page.waitForResponse(predicate);
  await action(); const value = await response;
  assert(value.ok(), `HTTP ${value.status()} ${value.url()} ${await value.text()}`);
  return value.json();
}
async function getNotification(page, title) {
  await page.goto(`${base}/notifications`);
  await page.getByRole('link').filter({ hasText: title }).first().click();
  await page.waitForURL(/\/requests\//);
}
(async () => {
  browser = await chromium.launch({ headless: true });
  for (const name of ['restaurant', 'adam', 'extra_b']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
    pages[name] = page;
  }
  const r = pages.restaurant, a = pages.adam, b = pages.extra_b;
  await r.goto(`${base}/extras/${data.adam.slug}`);
  await r.getByRole('button', { name: 'Proposer une mission à Adam' }).click();
  await r.getByLabel('Établissement', { exact: true }).fill('Restaurant A');
  await r.getByLabel('Adresse complète du service').fill('1 rue du Test, 75001 Paris');
  await r.getByLabel('Début du service').fill(data.start_local);
  await r.getByLabel('Fin du service').fill(data.end_local);
  await r.getByLabel('Nombre d’extras').fill('2');
  await r.getByLabel('Tarif HT par extra').selectOption('hourly');
  await r.getByLabel('€/heure HT').fill('18');
  await r.getByLabel('Tenue demandée (facultatif)').fill('Chemise noire');
  await r.getByLabel(/Si Adam est indisponible/).check();
  await shot(r, '01-proposition-mobile');
  await r.getByRole('link', { name: 'Créer un compte restaurateur' }).click();
  await r.getByLabel('Nom affiche').fill('Restaurant A');
  await r.getByLabel('Adresse email').fill(data.restaurant_email);
  await r.getByLabel('Mot de passe', { exact: true }).fill(data.password);
  await r.locator('#confirmPassword').fill(data.password);
  await r.getByRole('button', { name: 'Creer mon compte', exact: true }).click();
  await r.waitForURL(new RegExp(`/extras/${data.adam.slug}`));
  assert.equal(await r.getByLabel('Nombre d’extras').inputValue(), '2');
  const req = await responseAfter(r, response => response.url().endsWith('/api/requests/') && response.request().method() === 'POST',
    () => r.getByRole('button', { name: 'Envoyer la demande', exact: true }).click());
  const url = `${base}/requests/${req.id}`;
  await r.waitForURL(url); await checkText(r, '2 place(s) restante(s)');
  await shot(r, '02-demande-envoyee-restaurant');
  await login(a, data.adam); await getNotification(a, 'Une proposition de mission vous attend');
  await checkText(a, 'Je suis intéressé'); await shot(a, '03-proposition-recue-adam');
  await a.getByRole('button', { name: 'Non, sauf si personne d’autre accepte' }).click();
  await checkText(a, 'Revenir en dernier'); await shot(a, '04-adam-passe');
  await login(b, data.extra_b); await getNotification(b, 'Une proposition de mission vous attend');
  await b.getByRole('button', { name: 'Je suis intéressé', exact: true }).click();
  await checkText(b, 'La mission sera confirmée lorsque le restaurateur vous sélectionnera');
  await shot(b, '05-extra-b-interesse');
  fixture('advance', req.id);
  await getNotification(a, 'Des places restent');
  await a.getByRole('button', { name: 'Je suis intéressé', exact: true }).click();
  await r.reload(); await checkText(r, '2 candidature(s) en attente');
  await shot(r, '06-deux-candidatures');
  for (const name of ['Adam', 'Extra B']) {
    const card = r.locator('section').filter({ has: r.getByRole('link', { name, exact: true }) });
    await card.getByRole('button', { name: 'Confirmer cet extra' }).click();
    await card.getByText('Confirmé', { exact: true }).waitFor();
  }
  await checkText(r, 'Équipe confirmée'); await shot(r, '07-equipe-confirmee');
  const adamCard = r.locator('section').filter({ has: r.getByRole('link', { name: 'Adam', exact: true }) });
  await adamCard.getByRole('button', { name: 'Conversation', exact: true }).click();
  await adamCard.getByLabel('Votre message').fill('Adam : entrée du personnel côté cour.');
  await adamCard.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await checkText(r, 'Adam : entrée du personnel côté cour.');
  await b.reload(); await b.getByRole('button', { name: 'Conversation', exact: true }).click();
  assert.equal(await b.getByText('Adam : entrée du personnel côté cour.', { exact: true }).count(), 0);
  await a.reload(); await a.getByRole('button', { name: 'Conversation', exact: true }).click();
  await checkText(a, 'Adam : entrée du personnel côté cour.');
  await a.getByLabel('Votre message').fill('Bien reçu, à vendredi !');
  await a.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await shot(a, '08-chat-prive-adam');
  fixture('finish', req.id);
  await a.reload(); await a.getByLabel('Heures travaillées', { exact: true }).fill('6');
  await a.getByLabel('Minutes', { exact: true }).fill('20');
  await a.getByRole('button', { name: 'Soumettre mes heures' }).click();
  await checkText(a, 'À valider par le restaurateur');
  await shot(a, '09-heures-soumises');
  await r.reload();
  await r.getByRole('button', { name: 'Valider les 6 h 20', exact: true }).click();
  await a.reload(); await checkText(a, 'Heures validées');
  await shot(a, '10-heures-validees');
  await r.getByText('Coordonnées de facturation réutilisables').click();
  await r.getByLabel('Raison sociale', { exact: true }).fill('Restaurant A SAS');
  await r.getByLabel('SIREN (9 chiffres)', { exact: true }).fill('987654321');
  await r.getByLabel('Adresse de facturation', { exact: true }).fill('1 rue du Test');
  await r.getByLabel('Code postal', { exact: true }).fill('75001');
  await r.getByLabel('Ville', { exact: true }).fill('Paris');
  await r.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await checkText(r, 'Coordonnées enregistrées.');
  await a.getByRole('button', { name: 'Préparer le brouillon de facture' }).click();
  await a.getByRole('link', { name: 'Ouvrir mes factures' }).click();
  await a.getByRole('button', { name: 'Finaliser la facture' }).waitFor();
  await shot(a, '11-brouillon-facture');
  await a.getByRole('button', { name: 'Finaliser la facture' }).click();
  await a.getByRole('button', { name: 'Envoyer électroniquement' }).waitFor();
  await checkText(a, '114,00');
  const invoiceA = await a.locator('p').filter({ hasText: /^RB-\d{4}-00001$/ }).first().innerText();
  await shot(a, '12-facture-finalisee');
  await r.goto(`${base}/client`); await r.getByRole('button', { name: 'Missions', exact: true }).click();
  await checkText(r, 'RB-'); await shot(r, '13-facture-restaurant');
  await b.goto(url); await b.getByLabel('Heures travaillées', { exact: true }).fill('6');
  await b.getByLabel('Minutes', { exact: true }).fill('20');
  await b.getByRole('button', { name: 'Soumettre mes heures' }).click();
  await checkText(b, 'À valider par le restaurateur');
  await r.goto(url);
  await r.getByRole('button', { name: 'Valider les 6 h 20', exact: true }).click();
  await b.reload(); await b.getByRole('button', { name: 'Préparer le brouillon de facture' }).click();
  await b.getByRole('link', { name: 'Ouvrir mes factures' }).click();
  await b.getByRole('button', { name: 'Finaliser la facture' }).click();
  await b.getByRole('button', { name: 'Envoyer électroniquement' }).waitFor();
  await checkText(b, '114,00');
  const invoiceB = await b.locator('p').filter({ hasText: /^RB-\d{4}-00001$/ }).first().innerText();
  assert.equal(invoiceA, invoiceB, 'Each independent issuer starts its own sequence');
  await shot(b, '14-facture-extra-b');
  await r.goto(`${base}/client`); await r.getByRole('button', { name: 'Missions', exact: true }).click();
  await r.getByRole('heading', { name: invoiceA, exact: true }).first().waitFor();
  assert.equal(await r.getByRole('heading', { name: invoiceA, exact: true }).count(), 2);
  await shot(r, '15-deux-factures-restaurant');
  // Adam receives a separate future request and stays signed in through the flow.
  await r.goto(`${base}/extras/${data.adam.slug}`);
  await r.getByRole('button', { name: 'Proposer une mission à Adam' }).click();
  await r.getByLabel('Établissement', { exact: true }).fill('Restaurant A — autre service');
  await r.getByLabel('Adresse complète du service').fill('1 rue du Test, 75001 Paris');
  await r.getByLabel('Début du service').fill(data.start_local);
  await r.getByLabel('Fin du service').fill(data.end_local);
  const another = await responseAfter(r, response => response.url().endsWith('/api/requests/') && response.request().method() === 'POST',
    () => r.getByRole('button', { name: 'Envoyer la demande', exact: true }).click());
  await a.goto(`${base}/requests/${another.id}`);
  await a.getByRole('button', { name: 'Je suis intéressé', exact: true }).click();
  await r.reload(); await r.getByRole('button', { name: 'Confirmer cet extra', exact: true }).click();
  await a.reload(); await checkText(a, 'Mission confirmée.');
  assert.equal(await a.getByText('Vous avez une indisponibilité ou une mission sur ce créneau.', { exact: true }).count(), 0);
  await shot(a, '16-autre-mission-adam');
  for (const page of [r, a, b]) { await page.setViewportSize({ width: 360, height: 780 }); }
  await shot(a, '17-ecran-etroit');
  const guestData = fixture('seed');
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const g = await guestContext.newPage(); pages.guest = g;
  g.on('pageerror', error => errors.push(`guest: ${error.message}`));
  const guestEmail = guestData.restaurant_email.replace('restaurant-', 'guest-restaurant-');
  await g.goto(`${base}/extras/${guestData.adam.slug}`);
  await g.getByRole('button', { name: 'Proposer une mission à Adam' }).waitFor();
  await shot(g, '18-profil-creme-jaune');
  await g.getByRole('button', { name: 'Proposer une mission à Adam' }).click();
  await g.getByLabel('Établissement', { exact: true }).fill('Restaurant sans compte');
  await g.getByLabel('Adresse complète du service').fill('1 rue du Test, Paris');
  await g.getByLabel('Début du service').fill(guestData.start_local);
  await g.getByLabel('Fin du service').fill(guestData.end_local);
  assert.equal(await g.getByLabel(/Chercher aussi dans le réseau/).isChecked(), true);
  await g.getByLabel('Votre adresse email').fill(guestEmail);
  await shot(g, '19-demande-sans-compte');
  await g.getByRole('button', { name: 'Recevoir mon lien et envoyer la demande' }).click();
  await checkText(g, 'Un dernier clic dans votre boîte mail');
  await shot(g, '20-confirmation-email-attendue');
  const emailLink = fixture('email-link', guestEmail);
  const parsedLink = new URL(emailLink.url);
  await g.goto(`${base}${parsedLink.pathname}${parsedLink.hash}`);
  await g.getByRole('heading', { name: 'Restaurant sans compte · Service en salle' }).waitFor();
  const guestResponse = await g.request.get(`${base}/api/health/`); assert(guestResponse.ok());
  await shot(g, '21-suivi-sans-compte');
  const guestExtraContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const guestExtra = await guestExtraContext.newPage(); pages.guest_extra = guestExtra;
  guestExtra.on('pageerror', error => errors.push(`guest_extra: ${error.message}`));
  await login(guestExtra, guestData.adam);
  await getNotification(guestExtra, 'Une proposition de mission vous attend');
  await guestExtra.getByRole('button', { name: 'Je suis intéressé', exact: true }).click();
  await g.reload(); await g.getByRole('button', { name: 'Confirmer cet extra' }).click();
  await checkText(g, 'Équipe confirmée');
  await g.getByRole('button', { name: 'Conversation', exact: true }).click();
  await g.getByLabel('Votre message').fill('Message envoyé sans compte.');
  await g.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await checkText(g, 'Message envoyé sans compte.');
  await shot(g, '22-selection-chat-sans-compte');
  await g.getByRole('link', { name: 'Créer un compte', exact: true }).click();
  await g.getByLabel('Nom affiche').fill('Restaurant sans compte');
  await g.getByLabel('Adresse email').fill(guestEmail);
  await g.getByLabel('Mot de passe', { exact: true }).fill(data.password);
  await g.locator('#confirmPassword').fill(data.password);
  await g.getByRole('button', { name: 'Creer mon compte', exact: true }).click();
  await g.getByRole('button', { name: 'Rattacher cette demande à mon compte' }).click();
  await g.waitForURL(/\/requests\//);
  await checkText(g, 'Équipe confirmée');
  await shot(g, '23-demande-rattachee-au-compte');
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, mobile: 'Chromium 390×844, touch, Europe/Paris', steps, errors }, null, 2));
})().catch(async error => {
  console.error(error.stack); fs.writeFileSync(path.join(output, 'failure.txt'), error.stack || String(error));
  for (const [name, page] of Object.entries(pages)) await page.screenshot({ path: path.join(output, `failure-${name}.png`), fullPage: true }).catch(() => {});
  process.exitCode = 1;
}).finally(async () => { await browser?.close(); });
