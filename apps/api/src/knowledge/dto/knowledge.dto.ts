import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeSourceKind } from '@prisma/client';
import { OPTION_LIMITS } from '../knowledge.types';

/** multipart بيبعت كل شي نص — "true"/"false" لازم يتحولوا */
const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : value;

export class IngestionOptionsDto {
  @IsOptional() @Transform(toBool) @IsBoolean() ocr?: boolean;
  @IsOptional() @IsIn(['local', 'ai']) ocrEngine?: 'local' | 'ai';
  @IsOptional() @IsIn(['ara+eng', 'ara', 'eng']) ocrLang?:
    'ara+eng' | 'ara' | 'eng';
  @IsOptional() @IsIn(['structure', 'semantic', 'fixed']) strategy?:
    'structure' | 'semantic' | 'fixed';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(OPTION_LIMITS.chunkSize.min)
  @Max(OPTION_LIMITS.chunkSize.max)
  chunkSize?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(OPTION_LIMITS.overlap.min)
  @Max(OPTION_LIMITS.overlap.max)
  overlap?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() stripHeaders?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() keepLatex?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() embedNow?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() dedupe?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() autoApprove?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(OPTION_LIMITS.threshold.min)
  @Max(OPTION_LIMITS.threshold.max)
  threshold?: number;
}

export class UploadKnowledgeDto {
  @ApiProperty({ enum: KnowledgeSourceKind })
  @IsEnum(KnowledgeSourceKind)
  kind: KnowledgeSourceKind;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Exam year (exams only)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Exam term (exams only)' })
  @IsOptional()
  @IsString()
  term?: string;

  @ApiPropertyOptional({ description: '"1", "2" or "all" (books only)' })
  @IsOptional()
  @IsIn(['1', '2', 'all'])
  bookPart?: string;

  @ApiPropertyOptional({ description: 'Textbook edition year (books only)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  bookEdition?: number;

  @ApiPropertyOptional({ description: 'Processing options as a JSON string' })
  @IsOptional()
  // multipart بيبعت الخيارات كنص JSON؛ لازم نحوّلها لـ instance حتى
  // ValidateNested والـ whitelist يشتغلوا على حقولها
  @Transform(({ value }) => {
    let parsed: unknown = value;
    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value) as unknown;
      } catch {
        return value as unknown;
      }
    }
    return parsed && typeof parsed === 'object'
      ? plainToInstance(IngestionOptionsDto, parsed)
      : parsed;
  })
  @ValidateNested()
  options?: IngestionOptionsDto;
}

export class RechunkDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IngestionOptionsDto)
  options?: IngestionOptionsDto;
}

export class PauseDto {
  @IsBoolean()
  paused: boolean;
}

export class ListJobsDto {
  @IsOptional() @IsIn(['all', 'running', 'done', 'failed']) status?: string;
  @IsOptional() @IsEnum(KnowledgeSourceKind) kind?: KnowledgeSourceKind;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ChunkQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class RetrievalTestDto {
  @IsString() @IsNotEmpty() subjectId: string;
  @IsString() @IsNotEmpty() query: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}
