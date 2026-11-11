import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StagedQuestionStatus } from '@prisma/client';

export class QueryStagedDto {
  @ApiPropertyOptional({ description: 'Filter by exam file ID' })
  @IsOptional()
  @IsString()
  examFileId?: string;

  @ApiPropertyOptional({
    enum: StagedQuestionStatus,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(StagedQuestionStatus)
  status?: StagedQuestionStatus;

  @ApiPropertyOptional({ description: 'Filter by subject ID' })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({
    description: 'Only low-confidence or flagged questions',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  flaggedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 20;
}
