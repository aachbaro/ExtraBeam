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
  const app = await NestFactory.create(AppModule, { cors: true });

  // -------------------------------------------------------------
  // 🌍 Configuration CORS (support complet Vercel)
  // -------------------------------------------------------------
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',

    // Ton domaine en production
    'https://extrabeam.app',
    'https://www.extrabeam.app',
  ];

  // Regex autorisant tous les déploiements Vercel
  const vercelRegex = /^https:\/\/.*\.vercel\.app$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl / Postman

      if (
        allowedOrigins.includes(origin) ||
        vercelRegex.test(origin)
      ) {
        return callback(null, true);
      }

      console.warn(`❌ CORS refusé pour l'origine : ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // -------------------------------------------------------------
  // 🛡️ Sécurité
  // -------------------------------------------------------------
  app.use(helmet());

  // -------------------------------------------------------------
  // 💳 Stripe Webhook (raw body)
  // -------------------------------------------------------------
  app.use(
    '/api/payments/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // -------------------------------------------------------------
  // 📦 JSON global
  // -------------------------------------------------------------
  app.use(bodyParser.json({ limit: '10mb' }));

  // -------------------------------------------------------------
  // ⚙️ Préfixe global API
  // -------------------------------------------------------------
  app.setGlobalPrefix('api');

  // -------------------------------------------------------------
  // 🧱 Validation DTO
  // -------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // -------------------------------------------------------------
  // 🚨 Gestion erreurs
  // -------------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

  // -------------------------------------------------------------
  // 🚀 Start
  // -------------------------------------------------------------
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  console.log(`🚀 ExtraBeam backend prêt sur : http://localhost:${port}/api`);
}

bootstrap();
