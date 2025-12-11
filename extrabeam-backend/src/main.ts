// src/main.ts
// -------------------------------------------------------------
// Entrée principale du backend ExtraBeam (NestJS)
// -------------------------------------------------------------
// - CORS dynamique
// - Helmet
// - Webhooks Stripe (raw body)
// - Validation DTO
// - Gestion globale des erreurs
// -------------------------------------------------------------

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/utils/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // -------------------------------------------------------------
  // 🌍 CORS
  // -------------------------------------------------------------
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // -------------------------------------------------------------
  // 🛡️ Sécurité HTTP
  // -------------------------------------------------------------
  app.use(helmet());

  // -------------------------------------------------------------
  // ⚠️ Stripe Webhook : corps brut obligatoire
  // -------------------------------------------------------------
  // Pour les factures (paiements à l’unité)
  app.use(
    '/api/payments/webhook',
    bodyParser.raw({ type: 'application/json' }),
  );

  // Pour les abonnements (Stripe Billing)
  app.use('/api/subscription/webhook', bodyParser.raw({ type: '*/*' }));

  // -------------------------------------------------------------
  // 📦 JSON standard
  // -------------------------------------------------------------
  app.use(bodyParser.json({ limit: '10mb' }));

  // -------------------------------------------------------------
  // 🌐 Préfixe global API
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
    }),
  );

  // -------------------------------------------------------------
  // 🚨 Gestion globale des erreurs
  // -------------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

  // -------------------------------------------------------------
  // 🚀 Lancement serveur
  // -------------------------------------------------------------
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  console.log(`🚀 ExtraBeam backend lancé : http://localhost:${port}/api`);
}

bootstrap();
