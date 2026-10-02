# Vérification du parcours mobile — 2 octobre 2026

Scénario exécuté dans Chromium tactile, en français, fuseau Europe/Paris,
390 × 844 puis 360 × 780. Trois sessions indépendantes utilisent le vrai frontend
et une API Django locale avec une base SQLite temporaire. Aucun appel de
recrutement n'est simulé. Le temps est avancé dans cette base pour la relance et
la fin du service. Le lien public représente la destination du QR ; la caméra
et l'impression de la carte ne sont pas testées.

## Résultat

Les 17 étapes passent : formulaire conservé après inscription du restaurant,
demande de deux extras, Adam passe, Extra B reçoit par un contact explicite,
Adam est relancé, deux sélections, chat privé inaccessible à l'autre candidat,
6 h 20 déclarées et validées, coordonnées client réutilisées, deux brouillons
puis deux factures finalisées de 114 € HT à 18 €/h, visibles côté restaurant.
Chaque émetteur possède sa séquence RB-AAAA-00001. Adam accepte ensuite une
autre mission sans nouvelle connexion. Aucun débordement horizontal ni erreur
JavaScript constaté dans ce scénario.

## Frictions corrigées

- L'inscription pouvait détourner vers le dashboard et empêcher le retour au formulaire.
- Le lien vers Factures ouvrait le profil au lieu de l'onglet demandé.
- Une connexion locale remplaçait le nom personnalisé par un ancien nom.
- La saisie décimale des heures rendait 6 h 20 ambigu : deux champs et précision de quatre décimales.
- Les contacts génériques du restaurant sont désormais pris en compte dans sa première vague.
- L'origine de chaque candidat et la différence entre intérêt et confirmation sont explicites.
- Une mission sélectionnée n'affiche plus sa propre réservation comme un conflit de disponibilité.

## Rejouer localement

Installer les dépendances frontend et Chromium avec `npx playwright install chromium --only-shell`.
Dans un environnement Python possédant les dépendances backend, démarrer Django
avec DEBUG, une base `SQLITE_PATH` sous le répertoire temporaire, les migrations
appliquées et `EMAIL_BACKEND=django.core.mail.backends.locmem.EmailBackend`.
Servir l'API sur 127.0.0.1:8813 et Vite sur 127.0.0.1:5193 avec
`VITE_API_URL=http://127.0.0.1:8813/api`.
Définir `DEMO_PYTHON` vers cet interpréteur et le même `SQLITE_PATH`, puis exécuter
`npm run test:scenario`. `DEMO_BASE_URL` permet de changer l'URL locale.
Les fixtures refusent une base hors du répertoire temporaire ; le navigateur
refuse une URL distante. Chaque exécution crée des personnages fictifs distincts.
Les captures et `result.json` sont dans `artifacts/`, ignoré par Git.

## Vérifications restantes sur appareil et services réels

Sur iPhone : scan réel de la carte, Safari, ajout à l'écran d'accueil,
autorisation push, réception application fermée et ouverture après notification.
L'authentification Google, les emails SMTP/Brevo, les push, l'envoi SUPER PDP et
le paiement n'ont pas été exécutés contre leurs services réels dans ce scénario.
Les factures sont visibles dans l'application ; aucun email de facture n'est envoyé ici.

Les vagues selon l'urgence, l'annulation négociée, le chat collectif, le préfixe
personnalisé et l'optimisation du worker restent différés conformément à la demande.
