import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';

export class GenerateQuestionsDto {
  @ApiProperty({ description: 'Target subject ID' })
  @IsString()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Optional topic or chapter tag' })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiProperty({
    enum: DifficultyLevel,
    description: 'Target difficulty level',
  })
  @IsEnum(DifficultyLevel)
  difficulty: DifficultyLevel;

  @ApiPropertyOptional({
    enum: BloomTaxonomyLevel,
    description: "Target Bloom's Taxonomy level",
  })
  @IsOptional()
  @IsEnum(BloomTaxonomyLevel)
  bloomTaxonomy?: BloomTaxonomyLevel;

  @ApiProperty({
    minimum: 1,
    maximum: 20,
    description: 'Number of questions to generate (1–20)',
    default: 5,
  })
  @IsInt()
  @Min(1)
  @Max(20)
  count: number = 5;
}
