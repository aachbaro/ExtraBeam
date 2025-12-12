// src/missions/missions.controller.ts
// -------------------------------------------------------------
// Contrôleur : Missions
// -------------------------------------------------------------
//
// 📌 Description :
//   - Gère les routes HTTP liées aux missions.
//   - Permet la création publique (visiteurs) et privée (entreprises connectées).
//
// 📍 Endpoints :
//   - GET    /api/missions
//   - GET    /api/missions/:id
//   - POST   /api/missions                → création authentifiée
//   - POST   /api/missions/public         → création anonyme (publique)
//   - PUT    /api/missions/:id
//   - DELETE /api/missions/:id
//   - POST   /api/missions/:id/status
//
// 🔒 Règles d’accès :
//   - Lecture & mutations protégées par JwtAuthGuard (sauf /public)
//   - Vérification fine dans le service via AccessService
//
// -------------------------------------------------------------

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { StrictValidationPipe } from '../common/pipes/strict-validation.pipe';
import { MissionCreateDto } from './dto/mission-create.dto';
import { MissionUpdateDto } from './dto/mission-update.dto';
import { MissionUpdateStatusDto } from './dto/update-mission-status.dto';
import { MissionsService, type MissionWithRelations } from './missions.service';
import type { AuthUser } from '../common/auth/auth.types';
import type { Database } from '../types/database';

// -------------------------------------------------------------
// Typages Supabase dérivés
// -------------------------------------------------------------
type MissionStatus = Database['public']['Enums']['mission_status'];
type MissionRow = Database['public']['Tables']['missions']['Row'];

@Controller('missions')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  // -------------------------------------------------------------
  // 📅 Liste des missions (auth requise)
  // -------------------------------------------------------------
  @Get()
  @UseGuards(JwtAuthGuard)
  async listMissions(
    @Query('entrepriseRef') entrepriseRef?: string,
    @Query('week') week?: string,
    @Query('status') status?: MissionStatus,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @User() user?: AuthUser | null,
  ): Promise<{ missions: MissionWithRelations[] }> {
    const missions = await this.missionsService.listMissions(
      {
        entrepriseRef: entrepriseRef ?? undefined,
        week: week ?? undefined,
        status: status ?? undefined,
        page: page ? Number(page) : undefined,
        size: size ? Number(size) : undefined,
      },
      user ?? null,
    );

    return { missions };
  }

  // -------------------------------------------------------------
  // 🔍 Détails d’une mission (auth requise)
  // -------------------------------------------------------------
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getMission(
    @Param('id', ParseIntPipe) id: number,
    @User() user?: AuthUser | null,
  ): Promise<{ mission: MissionWithRelations }> {
    const mission = await this.missionsService.getMission(id, user ?? null);
    return { mission };
  }

  // -------------------------------------------------------------
  // 🧱 Création authentifiée (entreprise connectée)
  // -------------------------------------------------------------
  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(StrictValidationPipe)
  async createMission(
    @Body() dto: MissionCreateDto,
    @User() user?: AuthUser | null,
  ): Promise<{ mission: MissionRow }> {
    const mission = await this.missionsService.createMission(dto, user ?? null);
    return { mission };
  }

  // -------------------------------------------------------------
  // 🌍 Création publique (visiteur non connecté)
  // -------------------------------------------------------------
  @Post('public')
  @UsePipes(StrictValidationPipe)
  async createPublicMission(
    @Body() dto: MissionCreateDto,
  ): Promise<{ mission: MissionRow }> {
    const mission = await this.missionsService.createPublicMission(dto);
    return { mission };
  }

  // -------------------------------------------------------------
  // 🔄 Mise à jour (auth requise)
  // -------------------------------------------------------------
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @UsePipes(StrictValidationPipe)
  async updateMission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MissionUpdateDto,
    @User() user?: AuthUser | null,
  ): Promise<{ mission: MissionWithRelations }> {
    const mission = await this.missionsService.updateMission(
      id,
      dto,
      user ?? null,
    );
    return { mission };
  }

  // -------------------------------------------------------------
  // ❌ Suppression (auth requise)
  // -------------------------------------------------------------
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteMission(
    @Param('id', ParseIntPipe) id: number,
    @User() user?: AuthUser | null,
  ): Promise<{ success: true }> {
    await this.missionsService.deleteMission(id, user ?? null);
    return { success: true };
  }

  // -------------------------------------------------------------
  // 🔁 Mise à jour du statut (auth requise)
  // -------------------------------------------------------------
  @Post(':id/status')
  @UseGuards(JwtAuthGuard)
  @UsePipes(StrictValidationPipe)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MissionUpdateStatusDto,
    @User() user?: AuthUser | null,
  ): Promise<{ mission: MissionRow }> {
    const mission = await this.missionsService.updateMissionStatus(
      id,
      dto.status,
      user ?? null,
    );
    return { mission };
  }
}
