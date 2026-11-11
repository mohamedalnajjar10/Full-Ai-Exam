import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** "student" أو معرّف دور فريق (super_admin, reviewer...) */
const ROLE_VALUE = /^[a-z][a-z0-9_]{1,39}$/;

/* ───────── المستخدمون ───────── */

export class ListUsersDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Matches(ROLE_VALUE) role?: string;
  @IsOptional() @IsIn(['active', 'suspended', 'unverified']) status?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class UpdateUserDto {
  /** "student" أو معرّف دور فريق */
  @IsOptional() @Matches(ROLE_VALUE) role?: string;

  /** null = حصة الدور/الافتراضية */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  dailyQuota?: number | null;
}

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class InviteUserDto {
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsOptional() @IsString() @MaxLength(100) name?: string;

  @Matches(ROLE_VALUE) roleId: string;
}

/* ───────── الأدوار ───────── */

export class SaveRoleDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;

  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions: string[];

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  dailyQuota?: number | null;
}

export class CreateRoleDto extends SaveRoleDto {
  /** معرّف ثابت بالأحرف اللاتينية الصغيرة (بيبيّن بالسجلات والـ API) */
  @Matches(/^[a-z][a-z0-9_]{2,39}$/, {
    message: 'المعرّف: أحرف إنجليزية صغيرة وأرقام و_ فقط.',
  })
  id: string;
}

export class MatrixRowDto {
  @Matches(ROLE_VALUE) id: string;

  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions: string[];
}

/** تعديل صلاحيات كل الأدوار مرة وحدة (حفظ المصفوفة) */
export class SaveMatrixDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MatrixRowDto)
  roles: MatrixRowDto[];
}

/* ───────── المحادثات ───────── */

export class ListConversationsDto {
  @IsOptional()
  @IsIn(['all', 'flagged', 'errors', 'off_topic'])
  filter?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class FlagConversationDto {
  @IsBoolean() flagged: boolean;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/* ───────── الاستهلاك ───────── */

export class UsageLimitsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  dailyQuota?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  perRequestMax?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  monthlyBudgetUsd?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  alertAtPct?: number;
  @IsOptional() @IsBoolean() hardStop?: boolean;
}

/** حصص أدوار الفريق (null = بلا حد) */
export class RoleQuotaDto {
  @Matches(ROLE_VALUE) id: string;

  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  dailyQuota: number | null;
}

export class RoleQuotasDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RoleQuotaDto)
  roles: RoleQuotaDto[];
}

/* ───────── الفروع والمواد ───────── */

export class SaveUnitsDto {
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  units: string[];
}

export class RenameBranchDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
}

/* ───────── إعدادات النظام والذكاء الاصطناعي ───────── */

export class TaskRouteDto {
  @IsString() @IsNotEmpty() task: string;
  @IsString() @IsNotEmpty() label: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsNotEmpty() model: string;
  @IsNumber() @Min(0) @Max(2) temperature: number;
  @IsInt() @Min(50) @Max(32000) maxTokens: number;
  @IsArray() @IsString({ each: true }) needs: ('image' | 'pdf' | 'structured')[];
}

export class SaveAiRoutesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskRouteDto)
  routes: TaskRouteDto[];
}

export class PromptHistoryDto {
  @IsInt() version: number;
  @IsString() when: string;
  @IsString() by: string;
  @IsString() note: string;
}

export class PromptTemplateDto {
  @IsString() @IsNotEmpty() id: string;
  @IsString() @IsNotEmpty() task: string;
  @IsString() @IsNotEmpty() name: string;
  @IsInt() @Min(1) version: number;
  @IsString() updated: string;
  @IsString() by: string;
  @IsArray() @IsString({ each: true }) variables: string[];
  @IsString() body: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromptHistoryDto)
  history: PromptHistoryDto[];
}

export class SaveAiPromptsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromptTemplateDto)
  prompts: PromptTemplateDto[];
}

export class SaveAiGuardrailsDto {
  @IsOptional() @IsIn(['lenient', 'balanced', 'strict']) strictness?: 'lenient' | 'balanced' | 'strict';
  @IsOptional() @IsArray() categories?: boolean[];
  @IsOptional() @IsNumber() @Min(0) @Max(1) confidenceThreshold?: number;
  @IsOptional() @IsBoolean() fileValidationEnabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(1) fileConfidenceThreshold?: number;
  @IsOptional() @IsBoolean() piiMaskingEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(300) rateLimitPerMinute?: number;
  @IsOptional() @IsBoolean() autoSuspendAbuse?: boolean;
  @IsOptional() @IsString() rejectionMessage?: string;
}

export class PlatformGeneralSettingsDto {
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() slogan?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @IsString() supportEmail?: string;
  @IsOptional() @IsString() phone?: string;
}

export class PlatformAuthSettingsDto {
  @IsOptional() @IsBoolean() openRegistration?: boolean;
  @IsOptional() @IsBoolean() verifyEmail?: boolean;
  @IsOptional() @IsBoolean() allowGoogleLogin?: boolean;
  @IsOptional() @IsBoolean() enforceAdmin2fa?: boolean;
}

export class PlatformEmailSettingsDto {
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() smtpPort?: number;
  @IsOptional() @IsString() senderName?: string;
  @IsOptional() @IsString() senderEmail?: string;
}

export class PlatformStorageSettingsDto {
  @IsOptional() @IsIn(['local', 's3']) driver?: 'local' | 's3';
  @IsOptional() @IsString() bucket?: string;
  @IsOptional() @IsString() endpoint?: string;
}

export class PlatformFeaturesSettingsDto {
  @IsOptional() @IsBoolean() aiAssistant?: boolean;
  @IsOptional() @IsBoolean() styleMatching?: boolean;
  @IsOptional() @IsBoolean() ministerialQuizzes?: boolean;
  @IsOptional() @IsBoolean() dailyPlan?: boolean;
  @IsOptional() @IsBoolean() successStories?: boolean;
  @IsOptional() @IsBoolean() bookDownload?: boolean;
}

export class PlatformMaintenanceSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() message?: string;
}

export class SavePlatformSettingsDto {
  @IsOptional() @ValidateNested() @Type(() => PlatformGeneralSettingsDto) general?: PlatformGeneralSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => PlatformAuthSettingsDto) auth?: PlatformAuthSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => PlatformEmailSettingsDto) email?: PlatformEmailSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => PlatformStorageSettingsDto) storage?: PlatformStorageSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => PlatformFeaturesSettingsDto) features?: PlatformFeaturesSettingsDto;
  @IsOptional() @ValidateNested() @Type(() => PlatformMaintenanceSettingsDto) maintenance?: PlatformMaintenanceSettingsDto;
}

export class AuditLogsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) range?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

