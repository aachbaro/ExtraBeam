# Backend v2

Backend Django minimal pour la reconstruction d'ExtraBeam v2.

Facturation électronique et paiements optionnels : voir [EINVOICING.md](EINVOICING.md) pour configuration, connexion OAuth, tests sandbox et production.

## Ce qui est en place

- projet Django configure pour du dev local
- SQLite locale
- CORS autorise pour le frontend v2
- endpoint `GET /api/health/`
- client OIDC `pascuans_oidc` pour le compte partage
- bridge backend -> frontend apres login OIDC
- endpoint `POST /api/auth/login/`
- endpoint `POST /api/auth/register/`
- endpoint `POST /api/auth/google/`
- persistance minimale des comptes locaux, Google et OIDC via `AccountProfile`

Pour l'instant, le backend expose deux couches:

- un flow principal de compte partage via `auth-server`
- un socle local / Google qui reste utile pour le debug

## Setup local

### Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8002
```

Ou depuis `extrabeam/v2/`:

```bash
./start-dev.sh
```

### Windows

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8002
```

API disponible sur `http://127.0.0.1:8002/api`.

## Mode prod

Le backend est maintenant integre au compose `extrabeam/v2/docker-compose.yml`.

Fichiers utiles:

- `backend/.env.prod.example`
- `backend/Dockerfile`
- `backend/entrypoint.sh`

## Variables d'environnement

Copier `.env.example` vers `.env` si tu veux surcharger les valeurs par defaut.

Variables utiles pour Google:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_ALLOWED_ORIGINS=http://127.0.0.1:5180,http://localhost:5180
```

Le backend utilise l'origine du frontend comme `redirect_uri` pour le flow popup Google. Cette origine doit donc etre:

- dans `GOOGLE_OAUTH_ALLOWED_ORIGINS`
- dans les `Authorized JavaScript origins` du client OAuth Google

Variables utiles pour le compte partage:

```env
FRONTEND_URL=http://127.0.0.1:5180
OIDC_ISSUER_URL=http://127.0.0.1:8001
OIDC_CLIENT_ID=extrabeam-web
OIDC_CLIENT_SECRET=
```

Le client `extrabeam-web` doit exister cote `auth-server` avec cette redirect URI:

```txt
http://127.0.0.1:8002/api/auth/social/complete/pascuans_oidc/
```

## Tests rapides

Health:

```powershell
Invoke-WebRequest http://127.0.0.1:8002/api/health/ | Select-Object -ExpandProperty Content
```

Login de dev:

```powershell
Invoke-WebRequest `
  -Uri http://127.0.0.1:8002/api/auth/login/ `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"email":"adam@extrabeam.fr","password":"test"}' `
  | Select-Object -ExpandProperty Content
```

Inscription locale:

```powershell
Invoke-WebRequest `
  -Uri http://127.0.0.1:8002/api/auth/register/ `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"display_name":"Adam","email":"adam@extrabeam.fr","password":"bonjour123"}' `
  | Select-Object -ExpandProperty Content
```

Google de dev sans credentials reels:

```powershell
Invoke-WebRequest `
  -Uri http://127.0.0.1:8002/api/auth/google/ `
  -Method POST `
  -Headers @{
    Origin = 'http://127.0.0.1:5180'
    'X-Requested-With' = 'XmlHttpRequest'
  } `
  -ContentType 'application/json' `
  -Body '{"code":"dev-google-code"}' `
  | Select-Object -ExpandProperty Content
```

Flow OIDC partage:

- frontend: `http://127.0.0.1:5180/login`
- bouton principal -> `GET /api/auth/social/login/pascuans_oidc/`
- callback backend -> `GET /api/auth/social/bridge/`
- retour frontend -> `/auth/callback`

## Setup Google Console

1. Cree un client OAuth de type `Web application` dans Google Cloud Console.
2. Dans `Authorized JavaScript origins`, ajoute:
   - `http://127.0.0.1:5180`
   - `http://localhost:5180`
3. Renseigne `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET` dans `backend/.env`.
4. Redemarre le backend Django.

## Etat actuel de l'auth

- le bouton principal de login utilise maintenant le compte central `pascuans`
- `register` cree encore un compte local en base pour le mode debug
- `login` authentifie encore les comptes locaux en base pour le mode debug
- `google` cree ou rattache encore un compte persistant a partir du compte Google pour le mode debug
- un login OIDC central rattache le compte local par email et stocke aussi `oidc_sub`
- le fallback `password = test` reste disponible en dev si aucun compte local n'existe encore pour cet email
