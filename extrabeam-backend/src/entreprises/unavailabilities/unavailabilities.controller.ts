// src/entreprises/unavailabilities/unavailabilities.controller.ts
// -------------------------------------------------------------
// Contrôleur : Entreprises › Indisponibilités
// -------------------------------------------------------------
//
// 📌 Description :
//   - Gère les indisponibilités d’une entreprise
//   - Lecture publique (GET)
//   - Création / mise à jour / suppression réservées à l’owner/admin
//
// 📍 Endpoints :
//   - GET    /api/entreprises/:ref/unavailabilities
//   - POST   /api/entreprises/:ref/unavailabilities
//   - PUT    /api/entreprises/:ref/unavailabilities/:id
//   - DELETE /api/entreprises/:ref/unavailabilities/:id
//
// 🔒 Règles d’accès :
//   - GET : public (slots d’indisponibilités visibles)
//   - POST, PUT, DELETE : owner/admin uniquement
//
// -------------------------------------------------------------

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/guards/jwt.guard';
import { User } from '../../common/auth/decorators/user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';

import { UnavailabilitiesService } from './unavailabilities.service';

@Controller('entreprises/:ref/unavailabilities')
export class UnavailabilitiesController {
  constructor(private readonly service: UnavailabilitiesService) {}

  // -------------------------------------------------------------
  // 📅 GET → Liste des indisponibilités (publique)
  // -------------------------------------------------------------
  @Get()
  async list(
    @Param('ref') ref: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @User() user: AuthUser | null, // facultatif
  ) {
    if (!start || !end) {
      throw new BadRequestException('Les paramètres start et end sont requis');
    }

    return this.service.listUnavailabilities(ref, start, end, user ?? null);
  }

  // -------------------------------------------------------------
  // ➕ POST → Créer une indisponibilité
  // -------------------------------------------------------------
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('ref') ref: string,
    @Body() body: any,
    @User() user: AuthUser, // garanti par JwtAuthGuard
  ) {
    return this.service.createUnavailability(ref, body, user);
  }

  // -------------------------------------------------------------
  // ✏️ PUT → Modifier une indisponibilité
  // -------------------------------------------------------------
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('ref') ref: string,
    @Param('id') id: string,
    @Body() body: any,
    @User() user: AuthUser,
  ) {
    const unavailabilityId = Number(id);
    if (isNaN(unavailabilityId)) {
      throw new BadRequestException('ID indisponibilité invalide');
    }

    return this.service.updateUnavailability(ref, unavailabilityId, body, user);
  }

  // -------------------------------------------------------------
  // ❌ DELETE → Supprimer une indisponibilité
  //    ou supprimer UNE occurrence (via ?date=YYYY-MM-DD)
  // -------------------------------------------------------------
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(
    @Param('ref') ref: string,
    @Param('id') id: string,
    @User() user: AuthUser,
    @Query('date') date?: string, // optionnel
  ) {
    const unavailabilityId = Number(id);
    if (isNaN(unavailabilityId)) {
      throw new BadRequestException('ID indisponibilité invalide');
    }

    return this.service.deleteUnavailability(ref, unavailabilityId, date, user);
  }
}
