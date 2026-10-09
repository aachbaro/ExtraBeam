# Facturation électronique V2

Contrat vérifié le 1 octobre 2026 : [OpenAPI SUPER PDP 1.36.0.beta](https://api.superpdp.tech/openapi/superpdp.json),
[OAuth](https://www.superpdp.tech/documentation/4),
[synchronisation](https://www.superpdp.tech/documentation/14),
[e-reporting](https://www.superpdp.tech/documentation/15).

## Configuration

Installer `requirements.txt`, puis `python manage.py migrate`. Les migrations 0018/0019 sont additives : aucune donnée existante supprimée.
Configurer côté backend uniquement :

| Variable | Valeur |
|---|---|
| SUPERPDP_BASE_URL | https://api.superpdp.tech (même hôte pour sandbox/production) |
| SUPERPDP_CLIENT_ID / SUPERPDP_CLIENT_SECRET | Application OAuth créée dans SUPER PDP |
| SUPERPDP_REDIRECT_URI | URL exacte enregistrée dans SUPER PDP, terminant par `/api/einvoicing/callback/` |
| SUPERPDP_ENVIRONMENT | sandbox ou production ; le mode réel du compte est aussi vérifié via `/companies/me` |
| EINVOICE_TOKEN_KEY | Clé Fernet dédiée conservée hors Git et sauvegardée avec les secrets ; sa perte impose une reconnexion |
| SUPERPDP_WEBHOOK_SECRET | Réservée, inutilisée tant que le contrat signé n'est pas publié |
| STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET | Facultatives, pour les liens Checkout et leur webhook |
| STRIPE_LIVE_MODE | False en test, True en production |

Génération locale de la clé (copier dans `.env`, jamais dans Git) :

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

En production : HTTPS, `DEBUG=False`, `FRONTEND_URL` et origines CORS explicites.
Utiliser le même site pour frontend/backend et le même hostname en local (127.0.0.1 des deux côtés, ou localhost des deux côtés),
afin que le cookie OAuth HttpOnly SameSite=Lax accompagne le retour navigateur. Le connect se fait avec `credentials: include`.
Ne pas journaliser les URLs de callback avec leur query string (code OAuth), ni les en-têtes Authorization.

## Connexion et factures

Dans Paramètres → Facturation électronique → Connecter SUPER PDP, autoriser sa propre entreprise.
Le state aléatoire est lié au profil et à un cookie navigateur, expire après 10 minutes et ne peut être utilisé qu'une fois ; PKCE S256 est envoyé.
Les tokens sont chiffrés côté serveur et le refresh token est remplacé à chaque rotation.
Une autorisation OAuth peut rester en vérification : cliquer Synchroniser jusqu'à validation de l'identité/entreprise.
Une entreprise fournisseur ne peut être rattachée à plusieurs freelances Rivebelle ; une reconnexion conserve la même entreprise.

Renseigner raison sociale, SIREN/SIRET, adresse, TVA dans le profil ; renseigner le client et les mentions légales dans la facture.
Le SIREN peut être déduit du SIRET. Les factures existantes deviennent des brouillons sans modification des anciens montants.
La finalisation valide les données et fige les coordonnées de l'émetteur ; seules les confirmations d'encaissement restent modifiables.
La mission liée doit être terminée. Le PDF local réutilise l'identité figée et les lignes.
Dans Factures : Finaliser → Envoyer électroniquement → Synchroniser le statut. Les lignes multiples et leurs taux sont pris en charge.

Le JSON EN16931 est envoyé à `/invoices/convert?from=en16931&to=cii`, puis le XML est validé via `/validation_reports`,
puis transmis à `/invoices?external_id=…&processing_rule=B2B`. Les erreurs Schematron sont retournées.
L'acceptation technique de l'envoi n'est pas une preuve de réception ; consulter les événements asynchrones.

## Synchronisation et notifications

Le contrat officiel publié décrit le polling paginé par entreprise avec `starting_after_id` et `has_after`.
Aucun format/signature de webhook SUPER PDP n'est publié dans les documents consultés.
`POST /api/webhooks/superpdp/` renvoie donc 501 et ne modifie rien, même si un secret est configuré.
Pour des statuts automatiques, exécuter `python manage.py sync_einvoices` toutes les minutes via le planificateur du serveur.
Les événements sont journalisés sans credentials, dédupliqués par compte et identifiant ; les événements PPF restent archivés sans écraser le statut métier.

SUPER PDP présente ses statuts comme des événements, sans machine d'états. L'UI montre le dernier événement métier connu, et l'historique brut reste en base.
Si le POST d'envoi expire, la transmission passe à `unknown` et ne peut pas être renvoyée depuis l'UI.
La synchronisation recherche l'identifiant externe parmi les factures sortantes et rejoue l'historique.
L'API ne garantit pas l'idempotence de `external_id` : si aucune facture n'est retrouvée, vérifier avec SUPER PDP avant toute réparation manuelle.

## Stripe et encaissement

`Facture → Payment (Stripe)` et `Facture → ElectronicInvoiceTransmission (provider)` sont indépendants.
L’ancien endpoint Stripe `POST /api/invoices/{id}/checkout/` reste compatible, mais son bouton n’est plus proposé dans les factures.
Le checkout conserve le comportement plateforme du legacy (fonds vers le compte Stripe configuré) ; ce travail n'ajoute pas de Stripe Connect par freelance.
Configurer le webhook Stripe `/api/webhooks/stripe/` pour `checkout.session.completed` et `checkout.session.async_payment_succeeded`.
Signature officielle, statut paid, mode, session enregistrée, montant et devise sont contrôlés avant paiement local.
Les anciennes sessions/subscriptions ne sont pas rattachées à une facture V2 par simple metadata.

Une prestation soumise à TVA sur encaissement déclenche l'événement officiel `fr:212` via le provider après paiement total.
L'encaissement manuel déclenche le même traitement. Pour la franchise TVA ou l'option TVA sur débits, aucune déclaration de TVA sur encaissement n'est ajoutée.
Une facture déjà payée lors de l'envoi déclenche également ce traitement après transmission.
Le paiement local reste acquis si SUPER PDP échoue ; `sync_einvoices` reprend les erreurs survenues avant l'envoi.
Un résultat d'encaissement incertain n'est jamais renvoyé automatiquement ; un événement `fr:212` reçu le réconcilie.

## Test sandbox final

Les credentials étaient absents au développement. Aucun envoi externe ni déploiement n'a été effectué.

1. Créer une application OAuth SUPER PDP sandbox et enregistrer l'URI callback exacte.
2. Renseigner `.env`, installer les dépendances, migrer, puis démarrer backend/frontend :

```powershell
cd v2/backend
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8002
# Dans un autre terminal : cd v2/frontend ; npm ci ; npm run dev
```

3. Se connecter comme freelance Rivebelle et connecter une entreprise **sandbox** dans les paramètres. Vérifier le statut Connectée.

Dans Réglages → Facturation électronique, **Créer une facture de test** génère un document fictif officiel et ouvre l’onglet Factures. Cliquer ensuite sur **Envoyer électroniquement**, puis **Synchroniser le statut** pour suivre la réception. Cette génération est bloquée côté serveur en production et pour les comptes restaurateurs.
4. Dans un terminal configuré avec le même `.env` :

```powershell
python manage.py superpdp_sandbox --owner-slug MON_SLUG --send-fictitious-invoice
python manage.py sync_einvoices
```

La commande demande au générateur officiel une facture fictive et son destinataire sandbox ; elle crée une facture locale identifiable comme test,
convertit/valide/envoie par les mêmes services, appelle deux fois la soumission et vérifie qu'une seule transmission existe.
Les identifiants d'adressage sandbox de la fixture sont conservés, au lieu de les remplacer par de vrais SIRENs.
Les factures habituelles sont bloquées avant transmission dans ce mode : seuls les documents fictifs générés pour le compte sandbox sont utilisés.
Un refus explicite HTTP 400 du fournisseur reste réessayable et ne devient pas un « envoi incertain ». Les timeouts et erreurs serveur conservent la protection contre les doublons.
Cette fixture est exclusivement créée côté serveur par la commande, n'est pas éditable via l'API et est rejetée en production.
Elle vérifie le transport réel ; le mapper de factures françaises est testé séparément avec des fixtures locales.
Relancer la synchronisation pour les statuts asynchrones et vérifier le `provider_invoice_id` affiché dans le résultat et en base.
Ne jamais utiliser de vraie facture client pour ce test. OAuth exige une autorisation dans le navigateur ; la commande ne contourne pas ce consentement.

## Production et limites

Passer à des credentials/entreprises de production, mettre `SUPERPDP_ENVIRONMENT=production`, enregistrer la callback HTTPS exacte,
reconnecter chaque freelance et vérifier son SIREN, son régime TVA et son inscription à l'annuaire SUPER PDP.
Un compte déjà lié au sandbox doit être conservé pour l'historique : utiliser une base/profil de production séparé.
Configurer le planificateur de synchronisation et le webhook Stripe séparément.

Le périmètre actuel est la vente de prestations B2B françaises en EUR, y compris franchise article 293 B.
B2C, international, avoirs, acomptes, règlements partiels et adressages d'annuaire avec suffixes ne sont pas implémentés.
Les destinataires doivent avoir une adresse d'annuaire active ; le précontrôle SUPER PDP reste activé.
Pas de déclaration e-reporting supplémentaire pour les factures B2B : SUPER PDP gère le flux 1.
La validation réglementaire réelle, PKCE, OAuth/refresh réel et réception distante restent à confirmer avec les credentials sandbox.
Les migrations ont été exécutées sur bases de test uniquement ; sauvegarder la base de production avant migration.

Tests : `python manage.py test api.test_einvoicing` ; côté frontend `npm test` et `npm run build`.

Vérification au développement : 35 tests backend ajoutés et 5 tests frontend passent ; build TypeScript/Vite et contrôle des migrations API passent.
Les payloads franchise et TVA à plusieurs lignes passent aussi le schéma OpenAPI officiel téléchargé (sans appel de transmission).
Quatre échecs existants ont été reproduits sur HEAD intact : fuseau horaire d'abonnement, nettoyage du fichier avatar Windows,
et le même cas de qualification planning dans deux classes de tests resto. Un écart de migration resto `locked` existe aussi sur la base active ; aucune migration resto n'a été ajoutée.
