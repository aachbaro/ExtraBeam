# ExtraBeam — contexte pour agents IA

## Déploiement

Le home serveur est accessible depuis n'importe où via un webhook sécurisé.

**URL :** `https://deploy.pascuans.dev`  
**Token :** `fQ__hcpsl-M03fCSkjoOvG1aSwzxfaF95EsS2EfA7E8`

### Déployer une app

```bash
curl -s -X POST https://deploy.pascuans.dev/deploy \
  -H "Authorization: Bearer fQ__hcpsl-M03fCSkjoOvG1aSwzxfaF95EsS2EfA7E8" \
  -H "Content-Type: application/json" \
  -d '{"app": "extrabeam-v2-front"}'
```

Retourne `{"job_id": "...", "poll": "/status/<job_id>"}`. Poller jusqu'à `status == "done"` ou `"failed"` :

```bash
curl -s https://deploy.pascuans.dev/status/<job_id> \
  -H "Authorization: Bearer fQ__hcpsl-M03fCSkjoOvG1aSwzxfaF95EsS2EfA7E8"
```

### Apps disponibles

| app | description |
|-----|-------------|
| `extrabeam-v2-front` | Frontend React (nginx) |
| `extrabeam-v2-back` | Backend Django |
| `extrabeam-v2` | Full stack (front + back) |

Pour ajouter une app : éditer `/home/pascuans/deploy-server/apps.yml` sur le serveur, puis `sudo systemctl restart deploy-server`.

### Accès SSH direct (réseau local uniquement)

```
Host: 192.168.1.14
User: pascuans
Repo: /home/pascuans/roadToDev/pascuans/extrabeam
```

## Stack

- **Frontend :** React + Vite + TypeScript + Tailwind (`v2/frontend/`)
- **Backend :** Django REST Framework (`v2/backend/`)
- **Infra :** Docker Compose (`v2/docker-compose.yml`), nginx en reverse proxy
- **Branche active :** `feature/stripe-billing-referral`
