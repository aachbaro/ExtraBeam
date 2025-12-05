// src/client-contacts/client-contacts.controller.ts
// -------------------------------------------------------------
// Contrôleur : Contacts client
// -------------------------------------------------------------
//
// 📌 Description :
//   - Expose les routes `/api/clients/contacts` pour gérer les favoris
//     des clients (entreprises sauvegardées).
//
// 🔒 Règles d’accès :
//   - Authentification JWT
//   - Rôle `client`
// -------------------------------------------------------------

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';

import type { AuthUser } from '../common/auth/auth.types';
import { User } from '../common/auth/decorators/user.decorator';
import { JwtAuthGuard } from '../common/auth/guards/jwt.guard';
import type { CreateClientContactDto } from './dto/create-client-contact.dto';
import { ClientContactsService } from './client-contacts.service';

@Controller('clients/contacts')
@UseGuards(JwtAuthGuard)
export class ClientContactsController {
  constructor(private readonly clientContactsService: ClientContactsService) {}

  @Get()
  async list(@User() user: AuthUser) {
    return this.clientContactsService.listContacts(user);
  }

  @Post()
  async add(@Body() dto: CreateClientContactDto, @User() user: AuthUser) {
    return this.clientContactsService.addContact(dto, user);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number, @User() user: AuthUser) {
    return this.clientContactsService.deleteContact(id, user);
  }
}
