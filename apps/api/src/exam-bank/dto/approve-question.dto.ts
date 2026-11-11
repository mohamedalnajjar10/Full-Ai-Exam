import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';

export class ApproveQuestionDto {
  @ApiProperty({ enum: DifficultyLevel, description: 'Question difficulty' })
  @IsEnum(DifficultyLevel)
  difficulty: DifficultyLevel;

  @ApiProperty({
    enum: BloomTaxonomyLevel,
    description: "Bloom's taxonomy cognitive level",
  })
  @IsEnum(BloomTaxonomyLevel)
  bloomTaxonomy: BloomTaxonomyLevel;

  @ApiPropertyOptional({ description: 'Optional topic tag / label' })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiPropertyOptional({
    description: 'Corrected question text (overrides extracted text)',
  })
  @IsOptional()
  @IsString()
  correctedQuestionText?: string;
}
