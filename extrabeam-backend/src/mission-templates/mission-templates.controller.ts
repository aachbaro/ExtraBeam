// src/mission-templates/mission-templates.controller.ts
// -------------------------------------------------------------
// Contrôleur : Modèles de mission (mission_templates)
// -------------------------------------------------------------
//
// 📌 Description :
//   - Migration NestJS des endpoints historiques `/api/clients/templates`
//   - Expose les routes pour la gestion des modèles côté client authentifié
//
// 📍 Endpoints :
//   - GET    /api/clients/templates        → Liste des templates du client
//   - POST   /api/clients/templates        → Création d’un template
//   - PUT    /api/clients/templates/:id    → Mise à jour d’un template
//   - DELETE /api/clients/templates/:id    → Suppression d’un template
//
// 🔒 Sécurité :
//   - JwtAuthGuard obligatoire
//   - Rôle requis : client
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
  UseGuards,
  UsePipes,
} from '@nestjs/common';

import type { AuthUser } from '../common/auth/auth.types';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { StrictValidationPipe } from '../common/pipes/strict-validation.pipe';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { MissionTemplatesService } from './mission-templates.service';

@Controller('clients/templates')
@UseGuards(JwtAuthGuard)
export class MissionTemplatesController {
  constructor(private readonly missionTemplatesService: MissionTemplatesService) {}

  @Get()
  async list(@User() user: AuthUser) {
    return this.missionTemplatesService.listTemplates(user);
  }

  @Post()
  @UsePipes(StrictValidationPipe)
  async create(@Body() dto: CreateTemplateDto, @User() user: AuthUser) {
    return this.missionTemplatesService.createTemplate(dto, user);
  }

  @Put(':id')
  @UsePipes(StrictValidationPipe)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
    @User() user: AuthUser,
  ) {
    return this.missionTemplatesService.updateTemplate(id, dto, user);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number, @User() user: AuthUser) {
    return this.missionTemplatesService.deleteTemplate(id, user);
  }
}
