# ============================
# 1) Image de build
# ============================
FROM node:22-slim AS builder

# Répertoire de travail
WORKDIR /app

# Copier package.json + package-lock.json
COPY package*.json ./

# Installer les dépendances (production + dev)
RUN npm install

# Copier le reste des sources
COPY . .

# Build NestJS → dist/
RUN npm run build


# ============================
# 2) Image finale (Run)
# ============================
FROM node:22-slim AS runner

WORKDIR /app

# Copier seulement ce qui est nécessaire pour exécuter NestJS
COPY package*.json ./
RUN npm install --omit=dev

# Copier les fichiers compilés depuis builder
COPY --from=builder /app/dist ./dist

# Variables d’environnement conseillées
ENV NODE_ENV=production
ENV PORT=3000

# Exposer le port utilisé par NestJS
EXPOSE 3000

# Commande de lancement
CMD ["node", "dist/main.js"]
