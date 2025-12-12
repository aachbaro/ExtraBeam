// src/clients/clients.controller.ts
// -------------------------------------------------------------
// Contrôleur : Clients
// -------------------------------------------------------------
//
// 📌 Description :
//   - Expose les routes pour gérer les liens client ↔ entreprise
//
// 📍 Endpoints :
//   - GET    /api/clients
//   - POST   /api/clients/attach
//   - DELETE /api/clients/:id
//
// 🔒 Règles d’accès :
//   - JwtAuthGuard (owner/admin)
//
// -------------------------------------------------------------

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';

import type { AuthUser } from '../common/auth/auth.types';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import { StrictValidationPipe } from '../common/pipes/strict-validation.pipe';
import { AttachClientDto } from './dto/attach-client.dto';
import { ClientContactWithRelations, ClientsService } from './clients.service';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async list(
    @Query('entrepriseRef') entrepriseRef: string,
    @User() user: AuthUser,
  ): Promise<{ contacts: ClientContactWithRelations[] }> {
    return this.clientsService.listClients(entrepriseRef ?? '', user);
  }

  @Post('attach')
  @UsePipes(StrictValidationPipe)
  async attach(
    @Body() dto: AttachClientDto,
    @Query('entrepriseRef') entrepriseRef: string,
    @User() user: AuthUser,
  ): Promise<{ attached: true }> {
    return this.clientsService.attachClient(entrepriseRef ?? '', dto, user);
  }

  @Delete(':id')
  async detach(
    @Param('id', ParseUUIDPipe) clientId: string,
    @Query('entrepriseRef') entrepriseRef: string,
    @User() user: AuthUser,
  ): Promise<{ detached: true }> {
    return this.clientsService.detachClient(entrepriseRef ?? '', clientId, user);
  }
}
