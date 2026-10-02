# Parcours extras — recrutement, mission, heures et facture

Le formulaire public du profil envoie une `MissionRequest`, après connexion avec
un compte restaurateur. La saisie est conservée pendant la connexion locale,
Google ou OIDC. La page `/requests/<uuid>` sert au suivi. Le dashboard restaurateur
a un onglet Demandes ; l’extra retrouve les offres dans Missions.

## États et diffusion

- La demande passe par `recruiting`, `filled`, `exhausted`, `expired` ou `canceled`.
  `filled` signifie que toutes les places ont été confirmées. Une demande terminée
  reste consultable avec ses missions, conversations et relevés.
- Une offre passe par `queued`, `offered`, `interested`, `deferred`, `rejected`,
  `selected`, `declined` ou `closed`. L’intérêt n’engage pas le restaurateur.
- Vagues : profil destinataire, contacts/anciens collaborateurs du restaurateur,
  contacts mutuels du destinataire, réseau général ayant activé les propositions.
  Les postes souhaités et indisponibilités filtrent la diffusion. La proximité
  géographique n’est pas déduite des adresses ni utilisée comme filtre.
- Délai par défaut : 15 minutes, réglable via `RECRUITMENT_WAVE_MINUTES`.
  Passer/refuser avance immédiatement. Si les intéressés suffisent pour les places
  restantes, la diffusion attend la sélection du restaurateur.
- Les extras différés sont invités une seule seconde fois à la fin. Les offres
  déjà envoyées restent ouvertes jusqu’au remplissage, à l’annulation ou au début
  du service. Les disponibilités déclarées sont distinguées de l’absence d’info.
- La sélection vérifie à nouveau le quota et les conflits de créneaux dans une
  transaction. Elle crée une Mission et son créneau, ferme les autres offres quand
  le quota est atteint. Les anciennes routes ne peuvent modifier cette mission.
- La conversation est privée par candidat, continue après sélection et reste
  lisible après fermeture. Les autres extras n’accèdent ni aux noms ni aux chats.

Les demandes multi-services se font pour l’instant par demandes séparées (un
créneau, sept jours au maximum). Les missions confirmées ne peuvent pas être
annulées automatiquement ; leur annulation nécessite un échange et un traitement
support. Le planning, les pièces jointes et les SMS sont hors de ce lot.

## Worker et notifications

`v2/docker-compose.yml` ajoute `extrabeam-v2-worker`. Il utilise la même base et les
mêmes variables que Django. Il attend les migrations au démarrage, avance les
vagues toutes les cinq secondes et traite la file durable de notifications.

En local ou pour un diagnostic ponctuel :

```bash
python manage.py recruitment_worker
# Service continu
python manage.py recruitment_worker --loop
```

Les notifications in-app fonctionnent sans fournisseur. Email et push sont
indépendants et désactivables dans `/notifications`. Six échecs de livraison
mettent le canal en échec ; les tentatives sont espacées de cinq minutes. Un crash
après envoi et avant confirmation peut occasionner un email en double.
Les emails de chat contiennent un lien, jamais le contenu privé du message.

Renseigner dans `v2/backend/.env.prod`, uniquement sur le serveur :

```dotenv
RECRUITMENT_PUBLIC_URL=https://rivebelle.app
RECRUITMENT_WAVE_MINUTES=15
EMAIL_HOST=<serveur SMTP>
EMAIL_PORT=587
EMAIL_HOST_USER=<utilisateur>
EMAIL_HOST_PASSWORD=<secret>
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=Rivebelle <notifications@rivebelle.app>
WEBPUSH_PUBLIC_KEY=<clé publique VAPID base64url>
WEBPUSH_PRIVATE_KEY=/app/data/webpush-private.pem
WEBPUSH_SUBJECT=mailto:contact@rivebelle.app
```

Configurer l’expéditeur SMTP chez le fournisseur (et les DNS qu’il demande).
Pour réutiliser Brevo via son API, renseigner `BREVO_API_KEY` au lieu des paramètres
SMTP : Django choisit automatiquement l’adaptateur Brevo si cette clé existe.
`DEFAULT_FROM_EMAIL` doit désigner un expéditeur vérifié dans ce compte.
Pour Brevo SMTP : hôte `smtp-relay.brevo.com`, port 587 avec TLS, identifiant SMTP
et **clé SMTP** comme mot de passe (la clé API n’est pas une clé SMTP).
[Configuration officielle Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

Les variables vides laissent les envois en attente sans prétendre qu’ils ont été
livrés. Les écrans signalent si SMTP ou push ne sont pas configurés.

Générer une seule paire VAPID dans le volume du serveur, sans afficher la clé
privée. Après avoir déployé l’image qui installe `pywebpush` :

```bash
docker compose exec extrabeam-v2-back python -c "import os,base64; from pathlib import Path; from cryptography.hazmat.primitives.asymmetric import ec; from cryptography.hazmat.primitives import serialization as s; p=Path('/app/data/webpush-private.pem'); assert not p.exists(), 'Une clé existe déjà'; k=ec.generate_private_key(ec.SECP256R1()); fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(fd,k.private_bytes(s.Encoding.PEM,s.PrivateFormat.PKCS8,s.NoEncryption())); os.close(fd); print(base64.urlsafe_b64encode(k.public_key().public_bytes(s.Encoding.X962,s.PublicFormat.UncompressedPoint)).rstrip(b'=').decode())"
```

Copier seulement la sortie publique dans `WEBPUSH_PUBLIC_KEY`, garder le PEM dans
le volume puis recréer backend et worker pour charger l’environnement. Ne pas
changer cette paire sans réabonner les appareils.

Le service worker ne met pas en cache l’application. Il affiche les push et ouvre
la demande après clic. L’autorisation est demandée uniquement par le bouton de
l’utilisateur. Les endpoints sont limités aux fournisseurs Chrome, Firefox,
Windows et Apple pour éviter les appels vers des réseaux internes ; ajouter un
fournisseur nécessite `WEBPUSH_ALLOWED_HOSTS` côté serveur. Chaque appareil
s’abonne séparément. Sur iPhone : application ajoutée à l’écran d’accueil.
Le son reste soumis aux réglages du système, aucune sonnerie d’appel garantie.
Référence : [Push API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

## Demandes sans compte

`POST /api/guest/requests/` reçoit l'adresse email et le formulaire. Il crée un
brouillon privé et une notification de confirmation, sans contacter les extras.
Le lien email `/guest/<uuid>#access=<signature>` confirme l'adresse et diffuse
la demande. La signature n'est pas dans les requêtes URL ni dans les journaux
d'accès : le navigateur la transmet via `X-Guest-Access`. Le lien est limité à
sa demande, expire après 90 jours et autorise sélection, chat, annulation avant
confirmation, heures et coordonnées de facturation. Il ne connecte pas à un
compte et ne donne pas accès aux autres demandes ni aux préférences.

L'identité technique est inactive, sans mot de passe ; son email de connexion
reste vide pour permettre une inscription normale à la même adresse. L'email
de suivi est privé. Le rattachement nécessite un compte restaurateur, le lien
personnel et la même adresse email ; il reprend les missions et conversations
et révoque le lien invité. Le compte conserve ses coordonnées existantes.
L'email est envoyé via le worker avec ses reprises habituelles. Sans fournisseur
email configuré, l'API refuse l'envoi invité avec un message proposant la connexion.

## Heures et facturation

Après le service, l’extra soumet ses heures. Le restaurateur valide ou propose une
correction motivée. L’extra confirme la correction ou demande sa révision (les
heures d’origine sont conservées). Seules les heures approuvées terminent la
mission et autorisent le brouillon de facture.

La saisie distingue les heures et les minutes. Les quantités sont conservées à
quatre décimales : 6 h 20 à 18 €/h donnent une facture de 114,00 € HT.

L’identité client est saisie une fois : raison sociale, SIREN, adresse complète,
TVA si applicable et email comptabilité facultatif. L’extra fournit son identité
fiscale dans les réglages existants. Le brouillon reprend ces données, les heures,
le taux HT ou le forfait par extra. Sans tarif convenu, l’extra doit en renseigner
un avant de créer le brouillon. Pour un forfait, la ligne est d’une unité de
service. Le taux de TVA reste à vérifier par l’émetteur.

La finalisation attribue aux nouveaux brouillons générés une séquence annuelle
`RB-AAAA-00001`, distincte des factures manuelles. Elle est atomique par émetteur ;
une validation échouée ne consomme aucun numéro. Puis l’extra utilise les actions
existantes de finalisation et d’envoi SUPER PDP. Aucun envoi fiscal automatique.
Les paiements Stripe/virement conservent le fonctionnement déjà présent.

Recherche légale (2 octobre 2026) : une facture B2B française comporte notamment
les identités, adresses et immatriculations pertinentes, numéro chronologique,
date d’émission et de prestation, description, quantités/prix HT, TVA ou exonération,
totaux, échéance, escompte et pénalités, indemnité de recouvrement de 40 €. Les
mentions supplémentaires de la réforme, dont SIREN client et nature de l’opération,
s’appliquent selon le calendrier de l’émetteur : septembre 2026 pour grandes
entreprises/ETI, septembre 2027 pour PME/micro. La collecte anticipée du SIREN sert
ici à préparer l’émission structurée. Ce lot concerne les prestations B2B françaises.
[Source officielle : Service Public Entreprendre](https://entreprendre.service-public.gouv.fr/vosdroits/F31808).

L’intégration SUPER PDP est testée avec des doubles de fournisseur. Un envoi
sandbox réel nécessite encore les identifiants et le compte fournisseur connecté,
comme expliqué dans [EINVOICING.md](EINVOICING.md). Les vrais SMTP/push doivent être
testés sur un compte et un appareil choisis, une fois les variables configurées.

## Vérification et déploiement

```bash
python manage.py test api.test_recruitment api.test_einvoicing
python manage.py check
# Dans v2/frontend
npm test
npm run build
```

Les migrations `0020` à `0024` ajoutent le parcours, les préférences, l’email
comptabilité, la précision des heures et les liens invités. Sauvegarder SQLite avant déploiement. Le déploiement full stack doit
reconstruire et démarrer les trois services ; vérifier avec `docker compose ps`
que le worker est lancé et consulter ses logs. Le webhook décrit dans `AGENTS.md`
reste le point d’entrée, avec le token fourni localement. Une validation mobile
réelle et un test de livraison restent nécessaires avant d’annoncer les push.
