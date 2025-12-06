// src/main.ts
// -------------------------------------------------------------
// Entrée principale de l’application NestJS (bootstrap)
// -------------------------------------------------------------
//
// 📌 Description :
//   - Point d’entrée du backend ExtraBeam
//   - Initialise l’application NestJS et configure la sécurité, le CORS,
//     le préfixe global /api, la validation et le handler global des erreurs.
//
// ⚙️ Stack :
//   - NestJS + Supabase + Stripe + Brevo (emails)
//   - Compatible Render/Vercel (Node >= 20)
//
// 🔒 Sécurité & stabilité :
//   - Helmet pour les headers HTTP
//   - BodyParser avec support Stripe Webhook (rawBody)
//   - ValidationPipe pour filtrer les DTOs
//   - AllExceptionsFilter pour unifier les erreurs HTTP
//
// -------------------------------------------------------------

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/utils/filters/all-exceptions.filter';

async function bootstrap() {
  // -------------------------------------------------------------
  // 🏁 Création de l’application Nest
  // -------------------------------------------------------------
  const app = await NestFactory.create(AppModule, { cors: true });

  // -------------------------------------------------------------
  // 🌍 Configuration CORS
  // -------------------------------------------------------------
  const allowedOrigins = [
    'http://localhost:5173', // Frontend local (Vite)
    'http://127.0.0.1:5173', // Variante locale
    'https://extrabeam.app', // Domaine prod
    'https://www.extrabeam.app',
    'https://dispo-dr8xocbcu-adams-projects-adee5a2a.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Autorise les requêtes sans origin (ex: Postman, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`❌ CORS refusé pour l'origine : ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // -------------------------------------------------------------
  // 🛡️ Sécurité de base
  // -------------------------------------------------------------
  app.use(helmet());

  // -------------------------------------------------------------
  // 💳 Support Stripe Webhook
  // -------------------------------------------------------------
  // Stripe exige d'accéder au "raw body" pour vérifier la signature.
  // Ce middleware doit être défini avant tout autre middleware JSON.
  app.use(
    '/api/payments/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // -------------------------------------------------------------
  // 📦 Middleware global JSON (pour les autres routes)
  // -------------------------------------------------------------
  app.use(bodyParser.json({ limit: '10mb' }));

  // -------------------------------------------------------------
  // ⚙️ Préfixe global des routes API
  // -------------------------------------------------------------
  app.setGlobalPrefix('api');

  // -------------------------------------------------------------
  // 🧱 Validation automatique des DTOs
  // -------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ignore les champs non déclarés
      forbidNonWhitelisted: true, // lève une erreur si champ inconnu
      transform: true, // convertit automatiquement les types primitifs
    }),
  );

  // -------------------------------------------------------------
  // 🚨 Gestion centralisée des erreurs
  // -------------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

  // -------------------------------------------------------------
  // 🚀 Lancement du serveur
  // -------------------------------------------------------------
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  console.log(`🚀 ExtraBeam backend prêt sur : http://localhost:${port}/api`);
}

bootstrap();
