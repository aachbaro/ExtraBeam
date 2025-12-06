// src/main.ts
// -------------------------------------------------------------
// Entrée principale du backend ExtraBeam (NestJS)
// -------------------------------------------------------------
//
// Compatible Render / Vercel
// CORS full dynamic (origin: true)
// Helmet, rawBody Stripe, DTO validation, erreurs globales
// -------------------------------------------------------------

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/utils/filters/all-exceptions.filter';

async function bootstrap() {
  // -------------------------------------------------------------
  // 🏁 App NestJS
  // -------------------------------------------------------------
  const app = await NestFactory.create(AppModule);

  // -------------------------------------------------------------
  // 🌍 CORS — autorise toutes les origines (recommandé sur Render)
  // -------------------------------------------------------------
  app.enableCors({
    origin: true, // ← dynamique : renvoie l’origine exacte du navigateur
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // -------------------------------------------------------------
  // 🛡️ Sécurité HTTP
  // -------------------------------------------------------------
  app.use(helmet());

  // -------------------------------------------------------------
  // 💳 Stripe Webhook : raw body obligatoire
  // -------------------------------------------------------------
  app.use(
    '/api/payments/webhook',
    bodyParser.raw({ type: 'application/json' })
  );

  // -------------------------------------------------------------
  // 📦 JSON global
  // -------------------------------------------------------------
  app.use(bodyParser.json({ limit: '10mb' }));

  // -------------------------------------------------------------
  // ⚙️ Préfixe global des routes API
  // -------------------------------------------------------------
  app.setGlobalPrefix('api');

  // -------------------------------------------------------------
  // 🧱 Validation DTOs
  // -------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // -------------------------------------------------------------
  // 🚨 Gestion centralisée des erreurs
  // -------------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

  // -------------------------------------------------------------
  // 🚀 Lancement serveur
  // -------------------------------------------------------------
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  console.log(`🚀 ExtraBeam backend prêt sur : http://localhost:${port}/api`);
}

bootstrap();
