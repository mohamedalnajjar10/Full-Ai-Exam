import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';

class ChoiceItem {
  @IsString()
  label: string;

  @IsString()
  text: string;
}

export class UpdateBankQuestionDto {
  @ApiPropertyOptional({ description: 'Updated question text' })
  @IsOptional()
  @IsString()
  questionText?: string;

  @ApiPropertyOptional({ description: 'Updated choices', type: [ChoiceItem] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceItem)
  choices?: ChoiceItem[];

  @ApiPropertyOptional({ description: 'Updated correct answer label' })
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional({ description: 'Updated explanation' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;

  @ApiPropertyOptional({ enum: BloomTaxonomyLevel })
  @IsOptional()
  @IsEnum(BloomTaxonomyLevel)
  bloomTaxonomy?: BloomTaxonomyLevel;

  @ApiPropertyOptional({ description: 'Topic tag' })
  @IsOptional()
  @IsString()
  topicId?: string;
}
