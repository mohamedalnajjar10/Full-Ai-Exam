import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DifficultyLevel } from '@prisma/client';
import type { GenerateAssessmentRequest } from '@ai-exam/types';

export class GenerateAssessmentDto implements GenerateAssessmentRequest {
  @ApiProperty({
    description: 'Target subject ID to evaluate student capabilities in',
    example: 'clx0123456789abcdef01234',
  })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiPropertyOptional({
    enum: DifficultyLevel,
    description:
      'Optional difficulty level for the assessment (defaults to MEDIUM)',
    default: DifficultyLevel.MEDIUM,
  })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficultyLevel?: DifficultyLevel = DifficultyLevel.MEDIUM;

  @ApiPropertyOptional({
    description: 'Optional custom title for the assessment',
    example: 'اختبار تشخيصي لمادة الرياضيات',
  })
  @IsOptional()
  @IsString()
  title?: string;
}
