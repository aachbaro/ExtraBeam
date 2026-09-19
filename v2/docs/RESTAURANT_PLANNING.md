# Planning des restaurants

## Utilisation

Chaque restaurant conserve son équipe, ses services et ses contrats, indépendamment de Lulu. Dans Planning, sélectionner une plage dans l’agenda ouvre un service prérempli. Sur écran tactile ou au clavier, utiliser le bouton + du jour ou Nouveau service. Le calendrier présente les heures de 0 à 24 h ; une fin après minuit porte la mention +1 j. Ouvrir une carte affiche son équipe, les disponibilités et les contraintes. Une récurrence crée entre 1 et 26 occurrences, espacées de 1 à 4 semaines (deux séries alternées permettent A/B). Chaque occurrence est indépendante ; supprimer un service ne supprime pas la série. Un membre fixe facultatif est affecté et verrouillé sur toutes les occurrences, après validation de chaque date dans une transaction unique.

Dans Équipe, renseigner le contrat hebdomadaire, les compétences supplémentaires et les préférences (0/1/2). Le poste principal est automatiquement une compétence. Les autres codes de poste utilisent ceux du formulaire (serveur, plongeur, cuisinier, etc.) ; les habilitations libres doivent être orthographiées de la même façon dans la fiche et le service. La disponibilité habituelle est À confirmer initialement. Le responsable peut renseigner une réponse pour un service au nom d’un salarié sans compte lié. Les membres liés peuvent répondre eux-mêmes.

## Disponibilités et génération

Les indisponibilités ponctuelles/récurrentes du profil ExtraBeam et ses créneaux liés à une mission sont bloquants. Les exceptions de récurrence sont respectées. Vient ensuite la réponse explicite pour le service, puis un créneau libre du profil couvrant entièrement les horaires, puis la disponibilité habituelle du membre. Une disponibilité inconnue ne permet pas l’affectation automatique. De préférence non (maybe dans l’API) est un choix de repli, jamais une indisponibilité ferme.

La génération couvre une à six semaines déjà préparées. Elle ne crée pas les besoins. Elle remplace seulement les propositions automatiques non verrouillées des services en brouillon. Les affectations manuelles/fixes, confirmées et les services publiés sont conservés. Le moteur traite les services rares en premier puis cherche à équilibrer les heures du mois rapportées au contrat, en tenant compte des préférences. C’est une heuristique : un poste libre ne démontre pas qu’aucun échange ne pourrait le remplir. Le détail affiche les candidats et leurs blocages.

Les compétences, disponibilités fermes, chevauchements, repos entre journées et plafonds de temps sont vérifiés en génération et en affectation manuelle. Les affectations d’un même profil dans d’autres restaurants sont prises en compte. Paramètres techniques par défaut du prototype : 10 h/jour, 48 h/semaine, 11 h entre journées, 6 jours/semaine ; ils ne constituent pas une validation de conformité contractuelle. Les dates sont interprétées dans Europe/Paris.

## Heures et publication

La pause est configurable par service, 30 minutes par défaut. Les heures sont rattachées à la date de début. Objectif mensuel : contrat hebdomadaire × jours calendaires du mois / 7. Jauge foncée : publié ; claire : brouillon. Un dépassement reste visible dans le texte et par un repère. Ce sont des heures prévues, pas du pointage réel.

Dans Lulu, les jauges se trouvent sous le planning et avant les points à vérifier/notifications. Le mois suit initialement la semaine affichée et peut être changé. Le filtre d’employé s’applique aussi aux jauges. Une semaine révisée utilise son brouillon à la place de sa publication, sans double compte. Les semaines non préparées sont signalées.

Les services restaurant utilisent leur statut publié/brouillon existant ; ils n’ont pas encore l’historique de snapshots de Lulu. La modification de leur structure ou de leurs affectations les remet en brouillon. Les préférences sont persistantes par membre, sans variantes hebdomadaires à ce stade. Aucun transfert des données ni des comptes PIN de Lulu n’est effectué.

## Architecture et vérification

backend/resto/scheduling.py centralise les calculs de durée, la résolution de disponibilité, les contrôles et la génération. Les champs sont introduits par 0002_restaurant_planning_rules_and_more. Les écritures sont transactionnelles et les opérations de responsable verrouillent le restaurant. Les données d’équipe et de planning nécessitent d’appartenir au restaurant ; les écritures de planification sont réservées aux responsables.

frontend/src/components/agenda/WeekTimeGrid.tsx fournit une grille horaire indépendante des API, dans le même esprit que l’agenda des profils. frontend/src/components/HoursGauge.tsx est partagé par les restaurants et Lulu.

Validation : python backend/manage.py test resto ; npm --prefix frontend run build. Le scénario navigateur .dev/resto-planning-smoke.cjs utilise des fixtures isolées : sélection 11 h–15 h 30, récurrence, jauge mensuelle, édition de contrat et absence de débordement de page sur mobile. Les tests backend couvrent récurrence et minuit, refus atomique, verrous manuels, conflits, disponibilités inconnues/fermes/souples, compétences, exceptions du profil, publication/heures et isolation entre utilisateurs.

## Services et modèles hebdomadaires (10 septembre 2026)

La page restaurant distingue maintenant trois niveaux :

- `ServiceTemplate` : jour de la semaine, horaires clients/cuisine/rangement, besoins par rôle, tâches récurrentes et consignes.
- `RestaurantService` : occurrence datée, copie des tâches, notes et ajustements propres à cette date, référence et instantané du modèle.
- `RestaurantShift` : besoin de personnel dans ce service, avec rôle, nombre de postes, horaires de présence, pause et compétences. Les affectations et disponibilités existantes restent attachées à ce niveau.

Exemple : service mercredi midi 12:00–14:30, rangement jusqu’à 15:30 ; trois serveurs 11:00–15:30 et un cuisinier 09:00–15:30. Pour une personne ayant les clés de 10:00 à 15:30, ajouter une ligne d’un poste avec la compétence requise et réduire l’autre ligne à deux postes. Les heures contractuelles et la génération utilisent les horaires de présence des postes, jamais les horaires clients.

### Utilisation

1. Sélectionner une plage dans l’agenda ou « Nouveau service ».
2. Définir les horaires du service, ses rôles et effectifs, tâches de début/pendant/fin, notes.
3. Cocher « Enregistrer aussi comme modèle hebdomadaire » pour le réutiliser. Le jour est celui de la première date. La création peut produire 1 à 26 occurrences espacées de 1 à 4 semaines.
4. « Préparer depuis les modèles » instancie les modèles sur la période sélectionnée (1 à 6 semaines), avant de générer les affectations. Un modèle déjà instancié à une date n’est pas dupliqué.
5. Ouvrir un service : affecter les employés depuis leurs disponibilités, cocher les tâches, ou « Modifier ce service » pour ajouter un renfort, retirer un besoin, modifier les horaires et ajouter une livraison ou une tâche ponctuelle.
6. « Modifier le modèle » propose une option explicite de propagation aux occurrences futures en brouillon. Le nouveau jour habituel s’applique à la préparation de nouvelles semaines ; les occurrences existantes ne sont pas déplacées.

Les tâches sont recréées décochées pour chaque occurrence. Cocher une tâche agit uniquement sur l’occurrence concernée. Les membres de l’équipe peuvent cocher ; seuls les responsables modifient les besoins, modèles ou définitions.

### Propagation et conservation

La propagation utilise une fusion à trois versions : ancien modèle, occurrence courante, nouveau modèle. Un champ modifié sur une occurrence reste prioritaire. Les tâches terminées restent cochées ; les tâches ajoutées/supprimées localement et les lignes de postes ajustées sont préservées. Une suppression de ligne contenant des affectations est conservée lors de la propagation, et refusée lors d’une suppression explicite ; retirer les affectations d’abord. Une modification de poste incompatible avec une affectation conservée est refusée et toute la modification du modèle est annulée (transaction). Une occurrence contenant au moins un poste publié est exclue de la propagation.

Une propagation ne décale pas les dates et n’effectue pas de nouvelle génération automatique. Les affectations manuelles restent verrouillées. La préparation de plusieurs modèles se fait modèle par modèle : en cas d’erreur réseau, relancer la préparation est sans doublon grâce à la contrainte `(template, date)`.

Migration `0004` : regroupement des anciens postes par restaurant/date/type de service, sans changer ni supprimer les affectations, disponibilités ou horaires de travail. Les horaires clients n’existaient pas : les bornes de présence sont reprises provisoirement, avec une note demandant de préciser ouverture clients et fermeture cuisine. Aucun changement du modèle de données Lulu.

### API et vérifications

- `/api/resto/restaurants/:slug/service-templates/` GET/POST, détail PATCH/DELETE ; PATCH accepte `apply_future`.
- `/api/resto/restaurants/:slug/services/` GET filtré `from`/`to`, POST définition/modèle + date/récurrence.
- Détail service PATCH `{definition}` ou `{task_key, done}`, DELETE protégé contre les affectations existantes.
- Tous les endpoints sont restreints au restaurant et à ses membres/responsables.
- Tests Django : création de plusieurs rôles, horaires distincts, tâches indépendantes, idempotence, ajustements, propagation, exclusion des publiés, validation et permissions. Vérification navigateur sur données isolées : création, modèle, tâches, vue mobile, réutilisation de factures.

## Réutilisation des factures extras

« Réutiliser » ouvre une nouvelle facture depuis une facture existante : coordonnées client, tarif, TVA et mentions sont reprises ; numéro suggéré, dates, statut et liaison de mission sont réinitialisés. Heures et montants sont à renseigner. L’original n’est jamais modifié par cette action.

Le formulaire propose les clients déjà présents dans l’historique privé des factures, avec les données de la facture la plus récemment créée par client (SIRET/SIREN, sinon nom et adresse). Ce choix copie uniquement les coordonnées, jamais le paiement ou la mission. Il s’agit d’un accès aux clients déjà facturés, pas d’un carnet client indépendant : supprimer toutes les factures d’un client le retire de cette liste.

Le raccourci date/début/fin remplace la description par la prestation datée et calcule sa durée brute, y compris après minuit. Les heures restent modifiables pour déduire les pauses. L’enregistrement et le téléchargement restent des actions explicites de l’utilisateur.

## Révision du 14 septembre 2026 : récurrence permanente et accès employés

Cette section remplace les indications précédentes sur les récurrences finies, la suppression bloquée par des affectations et la saisie des disponibilités par le responsable.

- Dans le formulaire, Entrée dans un champ simple confirme/quitte ce champ sans soumettre le service. Les retours à la ligne d’une note restent possibles ; « Enregistrer » valide le service.
- Les compétences requises utilisent un catalogue partagé et des tags. La création demande de choisir les employés habilités, puis enregistre la compétence et leurs habilitations atomiquement. Une sélection existante ne modifie pas les habilitations. La comparaison des compétences ignore la casse Unicode. Le contrat et les compétences restent gérés par le responsable.
- « Service hebdomadaire, sans date de fin » est disponible à la création et pour convertir un service ponctuel. Le nombre d’occurrences a disparu de l’interface. Les anciens paramètres de création sont encore acceptés par l’API pour compatibilité.
- La règle hebdomadaire est permanente ; ses occurrences sont matérialisées sur une période bornée (94 jours maximum par appel), automatiquement lorsque le responsable ou l’employé consulte une semaine. La génération matérialise aussi la période avant de traiter ses postes. Les tâches repartent décochées. Aucune affectation n’est faite automatiquement par cette préparation.
- Un changement sur un service peut concerner cette date seule ou cette date et les prochains brouillons. Les versions datées de la définition empêchent cette seconde option de changer rétroactivement des semaines antérieures pas encore matérialisées. Les ajustements locaux et les cases déjà cochées sont conservés ; les autres services publiés ne sont pas réécrits.
- La suppression présente un choix « cette date » ou « cette date et les suivantes ». Après confirmation, elle retire les postes, affectations, disponibilités, tâches et notes des services concernés. Une annulation datée empêche de recréer l’occurrence supprimée. L’arrêt de récurrence fixe sa dernière date autorisée ; les services antérieurs restent présents. Aucun service réel n’a été supprimé automatiquement lors du déploiement.

### Compte employé propre au restaurant

Page : `/resto/:slug/acces`. L’employé sélectionne son nom et entre son PIN ; il consulte les horaires des postes correspondant à ses rôles et compétences, répond sur chaque poste ou définit sa disponibilité habituelle. Ses affectations ne sont affichées comme telles que lorsqu’elles sont publiées. Les disponibilités du profil relié restent prioritaires lorsqu’elles constituent une indisponibilité.

Le propriétaire configure les PIN dans l’onglet Équipe, section « Accès des employés ». Les autres responsables ne peuvent pas réinitialiser les PIN. Seuls les employés actifs avec un PIN configuré figurent sur la page publique ; seules leurs identités d’affichage (id, nom) y sont exposées. Aucun PIN initial n’est attribué automatiquement.

Les PIN de 4 à 8 chiffres sont hachés par Django. Les sessions sont aléatoires, stockées hachées en base, limitées à un restaurant et expirent après 7 jours ; le navigateur conserve la session dans `sessionStorage` par restaurant. Cinq échecs verrouillent le compte pendant 15 minutes, avec compteur persistant en base. Un changement de PIN révoque toutes les sessions PIN de l’employé. Ces sessions ne donnent pas accès au compte central, à l’administration, aux compétences ou aux contrats.

Le responsable ne peut plus renseigner la disponibilité d’un autre employé depuis le détail d’un service ni modifier sa disponibilité habituelle. Le serveur refuse aussi ces opérations, indépendamment de l’interface. Les données de disponibilité déjà présentes sont conservées ; aucune réponse n’est réinitialisée par la migration.

Nouveaux endpoints (préfixe `/api/resto/restaurants/:slug/`) :

- `prepare/` POST : matérialisation bornée et idempotente des règles hebdomadaires pour l’équipe authentifiée.
- `skills/` GET/POST : catalogue et création avec `member_ids`, accès responsable.
- `members/:id/pin/` POST : attribution/réinitialisation, propriétaire uniquement.
- `access/people/` GET, `access/login/` POST, `access/board/` POST, `access/availability/` POST, `access/logout/` POST. Les trois derniers utilisent `X-Resto-Session`, sans privilège central. Les requêtes de disponibilité agissent toujours sur le membre de la session, jamais sur un identifiant d’employé fourni par le client.

Validation : 18 tests Django couvrant aussi les annulations, l’arrêt de récurrence, les versions datées, les droits des responsables, le catalogue, les sessions PIN, leur révocation et le verrouillage des tentatives. Scénario navigateur isolé : Entrée, tags, choix des habilitations, hebdomadaire, portée des modifications/suppressions, configuration et connexion PIN, disponibilité personnelle et viewport mobile.

## Semaine type et édition ciblée — 19 septembre 2026

Le planning restaurant propose **Planning** (dates réelles) et **Semaine type** (une seule semaine habituelle du lundi au dimanche). Cette dernière utilise les `ServiceTemplate` existants sans migration ni réinitialisation.

### Règle d’ergonomie à conserver

Les cartes sont le point d’entrée de l’édition. Les fenêtres doivent rester courtes et limitées à l’élément choisi : ne pas rouvrir le formulaire complet d’un service depuis son en-tête. Les vues par service et semaine type utilisent le même composant `ServiceDayCard` pour éviter de faire diverger leurs interactions.

- **Ajouter un service** crée directement une carte vide dans le jour choisi. Nom et horaires sont ensuite modifiables dans son en-tête ; les postes, notes et tâches se complètent indépendamment.
- **Cliquer l’en-tête** édite seulement le nom, les horaires et la fermeture cuisine, dans la carte.
- **Cliquer les horaires d’un poste** ouvre une petite fenêtre pour ce poste : rôle, horaires, effectif, pause et compétences. « Ajouter un shift » utilise la même fenêtre.
- **Notes et tâches** dispose de son panneau dédié. Entrée ajoute une note ou tâche à la liste sans enregistrer le service. Le texte des éléments existants peut être modifié. L’avancement des tâches se coche uniquement sur les services datés, jamais sur le modèle.
- **Menu … ou clic droit** : horaires, ajout de poste, copie, duplication, suppression. « Édition complète » a été retiré de ce menu.
- **Sélection** : clic sur le fond d’une carte, Maj+clic pour plusieurs modèles, Ctrl/Cmd+C puis un jour ou Ctrl/Cmd+V. Échap efface la sélection et la copie. Les raccourcis sont ignorés pendant la saisie et dans les petites fenêtres.
- **Glisser une carte sur un jour** la copie, comme dans le planning existant. Les déplacements de notes, tâches et postes utilisent des données de glissement distinctes entre modèles et services datés. La destination est enregistrée avant de retirer la source pour éviter une perte si la destination refuse la modification. Les deux requêtes ne sont pas atomiques : un échec de retrait peut laisser une copie ; l’erreur reste affichée.

Dans la semaine type, l’option « Appliquer aussi mes modifications aux prochains brouillons » est décochée initialement. Une fois cochée, les modifications de modèles effectuées dans cette vue utilisent la propagation existante, avec conservation des ajustements ponctuels et exclusion des publiés. Les affectations sur la carte modèle sont des affectations fixes ; elles sont enregistrées dans `fixed_member_ids`, via l’API des modèles. Les identifiants des postes présentés dans cette vue sont des indices locaux : ils ne doivent jamais être envoyés aux endpoints des postes datés.

Retirer un modèle demande confirmation et conserve les services déjà créés. Les récurrences terminées apparaissent séparément. Le planning daté affiche « Semaine type » ou « Modifié pour cette semaine » ; la comparaison ignore l’avancement des tâches et les métadonnées d’affectation fixe.

### Vérifications

Build TypeScript/Vite réussi. Scénario navigateur isolé `.dev/weekly-template-smoke.cjs` : ajout direct sans formulaire, édition d’en-tête, Entrée sans soumission globale, fenêtre de poste, notes et tâches, conservation des employés fixes, propagation, clic droit/copie, sélection multiple et clavier, création/édition datée, débordement mobile et absence d’erreurs JavaScript.

Le test backend ajouté vérifie le repère d’ajustement : progression des tâches et affectations fixes ne suffisent pas, une note ponctuelle le déclenche. Lors de la vérification backend de cette refonte, 17 tests sur 19 passent. Deux exécutions du test hérité `test_unknown_and_unqualified_not_generated` échouent : le moteur modifié précédemment accepte une disponibilité `unknown`, contrairement à l’attente du test. Cette refonte ne modifie pas cette règle.

### Repérage des ajustements ponctuels

Dans les cartes datées, les notes et tâches ajoutées ou modifiées sont visibles en tête de carte dans un encadré ambré « Ce service uniquement ». Elles ne sont pas répétées dans le volet des éléments habituels. Les postes ajoutés ou ajustés ont le même fond ambré et une mention textuelle. Les petites fenêtres de postes et de notes/tâches rappellent que leur enregistrement ne modifie que cette occurrence.

L'API expose `template_snapshot`, la définition de référence attachée à l'occurrence. `serviceExceptions.ts` compare les clés et le contenu des tâches/postes (sans considérer l'avancement des tâches ou les affectations) ; les notes sont comparées ligne par ligne, en conservant le nombre d'occurrences des lignes identiques. Un service ponctuel sans modèle contient uniquement des éléments propres à sa date. Une ancienne API sans snapshot ne permet pas de classer les éléments d'un service récurrent : on n'invente alors pas de différences. Aucun marquage ponctuel n'apparaît dans la semaine type.

Vérifié : instantané conservé après une modification ponctuelle côté API ; affichage des notes/tâches au-dessus des postes, couleur/mention des postes ajoutés, conservation des notes habituelles sans duplication dans le scénario navigateur.
