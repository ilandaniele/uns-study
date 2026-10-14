import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { emailAudienceSchema, emailCampaignInputSchema, type EmailAudience, type EmailCampaignDto, type EmailCampaignInput, type EmailConfigDto, type EmailRecipientPreviewDto } from "@sala/contracts";
import { AdminGuard, AdminOnlyGuard } from "../users/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { RequestUser } from "../auth/request-user.js";
import { ZodBodyPipe } from "../common/zod-body.pipe.js";
import { UuidParamPipe } from "../common/uuid-param.pipe.js";
import { EmailCampaignsService } from "./email-campaigns.service.js";

/** Explicit audience without the create default, so a PATCH that omits it never resets it to "all". */
const emailCampaignPatchSchema = emailCampaignInputSchema.extend({ audience: emailAudienceSchema }).partial();

/** Reading is open to MODERATOR too; creating, editing and sending campaigns is ADMIN only. */
@Controller("admin/email-campaigns")
@UseGuards(AdminGuard)
export class AdminEmailController {
  constructor(@Inject(EmailCampaignsService) private readonly campaigns: EmailCampaignsService) {}

  @Get()
  async list(): Promise<EmailCampaignDto[]> {
    return this.campaigns.list();
  }

  @Get("config")
  config(): EmailConfigDto {
    return this.campaigns.config();
  }

  @Get("recipients/count")
  async recipientCount(@Query("audience", new ZodBodyPipe(emailAudienceSchema.default("all"))) audience: EmailAudience): Promise<EmailRecipientPreviewDto> {
    return this.campaigns.previewCount(audience);
  }

  @Post()
  @UseGuards(AdminOnlyGuard)
  async create(@CurrentUser() user: RequestUser, @Body(new ZodBodyPipe(emailCampaignInputSchema)) body: EmailCampaignInput): Promise<EmailCampaignDto> {
    return this.campaigns.create(body, user.id);
  }

  @Patch(":id")
  @UseGuards(AdminOnlyGuard)
  async update(
    @Param("id", new UuidParamPipe()) id: string,
    @Body(new ZodBodyPipe(emailCampaignPatchSchema)) body: Partial<EmailCampaignInput>,
  ): Promise<EmailCampaignDto> {
    return this.campaigns.update(id, body);
  }

  /** Enqueues the campaign for delivery. The web UI only calls this after the admin confirms the recipient count. */
  @Post(":id/send")
  @UseGuards(AdminOnlyGuard)
  async send(@CurrentUser() user: RequestUser, @Param("id", new UuidParamPipe()) id: string): Promise<EmailCampaignDto> {
    return this.campaigns.send(id, user.id);
  }
}
