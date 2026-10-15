# Ergonomie Rivebelle — 15 octobre 2026

## Modifications

- Navigation latérale repliable sur ordinateur ; préférence conservée localement.
- Planning : vue nommée « Services », dates françaises, commandes regroupées et colonnes plus compactes. Un service sans modèle porte un seul badge « Service ponctuel ». Les différences avec un modèle conservent leur signalement par poste.
- Équipe : actions secondaires dans le menu de chaque membre. Le propriétaire peut y ouvrir la gestion de son PIN ; le formulaire collectif ne précède plus la liste.
- Profil : choix du type de compte déplacé dans les réglages, descriptions simplifiées.
- Factures : cartes compactes, action principale selon le statut et menu secondaire. Création, modification et réutilisation affichées dans la page, avec repères Client / Prestation / Récapitulatif. Les coordonnées d'un client repris restent repliées et modifiables.
- Accueil : capture du planning retirée après contrôle, sa résolution était insuffisante en grand format. Suppression de la translation d'entrée appliquée à toute la page et remplacement de `overflow-x-hidden` par `overflow-x-clip` pour éviter un conteneur de défilement vertical parasite.
- Contraste du texte secondaire renforcé, focus clavier visible et respect de la réduction des animations.
- Connexion : explication du lien Rivebelle / Pascuans. Le texte du formulaire central est également modifié dans le dépôt voisin `auth-server`, fichier `templates/users/login.html`.

## Vérification

- `npm --prefix frontend run build` : réussi.
- `npm --prefix frontend test -- --reporter=dot` : 22 tests réussis.
- Depuis `frontend`, serveur Vite sur le port 5194 puis `node e2e/ergonomics.cjs` : vérifie navigation repliable, accès au PIN, actions de facture, réutilisation, écran sans modale, résumé client et absence de débordement horizontal à 390 px.
- Le parcours navigateur utilise des réponses API simulées : il ne valide pas les écritures sur le serveur de production. Les captures de contrôle sont dans `frontend/e2e/artifacts/` (ignorées par Git).

## Publication

Ces changements sont locaux à ce stade. Le frontend et le dépôt d'authentification ont des déploiements distincts. Aucun changement de schéma ni migration de données.

## Principes à conserver

Conserver les modifications ciblées des services, menus contextuels et sélections existants. Afficher les informations utiles à la décision avant les commandes secondaires. Les formulaires longs doivent disposer d'un espace de page ; les fenêtres restent réservées aux ajustements ciblés.
