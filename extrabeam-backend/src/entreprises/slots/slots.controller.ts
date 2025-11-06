// src/entreprises/slots/slots.controller.ts
// -------------------------------------------------------------
// Contrôleur : Entreprises › Slots
// -------------------------------------------------------------
//
// 📌 Description :
//   - Gère les créneaux horaires (slots) d’une entreprise
//   - Supporte la lecture publique (visiteurs) et la création/modification/suppression
//     pour les propriétaires ou administrateurs.
//
// 📍 Endpoints :
//   - GET    /api/entreprises/:ref/slots         → liste des slots (publique / privée)
//   - POST   /api/entreprises/:ref/slots         → création d’un slot (owner/admin)
//   - PUT    /api/entreprises/:ref/slots/:id     → mise à jour d’un slot (owner/admin)
//   - DELETE /api/entreprises/:ref/slots/:id     → suppression d’un slot (owner/admin)
//
// 🔒 Règles d’accès :
//   - Lecture (GET) :
//       • publique : retourne uniquement les slots de missions validées/completed/paid
//       • propriétaire/admin : accès complet + flags "pending"/"active"
//   - Mutations (POST, PUT, DELETE) :
//       • réservées à l’owner de l’entreprise ou admin
//
// ⚠️ Remarques :
//   - Les slots sont liés à une entreprise et, optionnellement, à une mission.
//   - Validation stricte des champs start/end.
//   - Renvoie des statuts adaptés en cas d’accès interdit ou mission invalide.
//
// -------------------------------------------------------------

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/guards/jwt.guard';
import { SlotsService } from './slots.service';
import { User } from '../../common/auth/decorators/user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import type { Database } from '../../types/database';

// -------------------------------------------------------------
// Typages dérivés
// -------------------------------------------------------------
type SlotRow = Database['public']['Tables']['slots']['Row'];
type MissionRow = Database['public']['Tables']['missions']['Row'];

// -------------------------------------------------------------
// Contrôleur principal
// -------------------------------------------------------------
@Controller('entreprises/:ref/slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  // -------------------------------------------------------------
  // 📅 GET → Liste des slots d'une entreprise
  // -------------------------------------------------------------
  //
  // 🔓 Accès public :
  //   - filtre sur les missions validées, paid, completed
  // 👤 Accès owner/admin :
  //   - accès complet avec statut "pending"/"active"
  //
  @Get()
  async listSlots(
    @Param('ref') ref: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mission_id') missionId?: string,
    @User() user?: AuthUser | null,
  ): Promise<{ slots: (SlotRow & { status_slot?: string })[] }> {
    if (!ref) throw new BadRequestException('Référence entreprise manquante');
    const slots = await this.slotsService.listSlots(ref, user ?? null, {
      from,
      to,
      missionId,
    });
    return { slots };
  }

  // -------------------------------------------------------------
  // ➕ POST → Créer un slot
  // -------------------------------------------------------------
  //
  // 🔒 Accès : owner/admin uniquement
  //
  @Post()
  @UseGuards(JwtAuthGuard)
  async createSlot(
    @Param('ref') ref: string,
    @Body() body: { start: string; end: string; title?: string; mission_id?: number },
    @User() user: AuthUser,
  ): Promise<{ slot: SlotRow }> {
    if (!ref) throw new BadRequestException('Référence entreprise manquante');
    return this.slotsService.createSlot(ref, body, user);
  }

  // -------------------------------------------------------------
  // ✏️ PUT → Modifier un slot
  // -------------------------------------------------------------
  //
  // 🔒 Accès : owner/admin uniquement
  //
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateSlot(
    @Param('ref') ref: string,
    @Param('id') id: string,
    @Body() body: Partial<SlotRow>,
    @User() user: AuthUser,
  ): Promise<{ slot: SlotRow }> {
    if (!ref) throw new BadRequestException('Référence entreprise manquante');
    const slotId = Number(id);
    if (isNaN(slotId)) throw new BadRequestException('ID slot invalide');
    return this.slotsService.updateSlot(ref, slotId, body, user);
  }

  // -------------------------------------------------------------
  // ❌ DELETE → Supprimer un slot
  // -------------------------------------------------------------
  //
  // 🔒 Accès : owner/admin uniquement
  //
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteSlot(
    @Param('ref') ref: string,
    @Param('id') id: string,
    @User() user: AuthUser,
  ): Promise<{ success: true }> {
    if (!ref) throw new BadRequestException('Référence entreprise manquante');
    const slotId = Number(id);
    if (isNaN(slotId)) throw new BadRequestException('ID slot invalide');
    await this.slotsService.deleteSlot(ref, slotId, user);
    return { success: true };
  }
}
