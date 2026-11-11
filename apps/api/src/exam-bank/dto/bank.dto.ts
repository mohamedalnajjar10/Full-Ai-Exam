import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  BloomTaxonomyLevel,
  DifficultyLevel,
  EmbeddingStatus,
} from '@prisma/client';

export class BankListDto {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional({ enum: DifficultyLevel })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;
  @ApiPropertyOptional({ enum: BloomTaxonomyLevel })
  @IsOptional()
  @IsEnum(BloomTaxonomyLevel)
  bloomTaxonomy?: BloomTaxonomyLevel;
  @ApiPropertyOptional({ enum: EmbeddingStatus })
  @IsOptional()
  @IsEnum(EmbeddingStatus)
  embeddingStatus?: EmbeddingStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

class ChoiceDto {
  @IsString() @IsNotEmpty() label: string;
  @IsString() text: string;
}

export class CreateBankQuestionDto {
  @IsString() @IsNotEmpty() subjectId: string;
  @IsString() @IsNotEmpty() questionText: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  choices: ChoiceDto[];
  @IsString() @IsNotEmpty() correctAnswer: string;
  @IsOptional() @IsString() explanation?: string;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year: number;
  @IsString() @IsNotEmpty() term: string;
  @IsEnum(DifficultyLevel) difficulty: DifficultyLevel;
  @IsEnum(BloomTaxonomyLevel) bloomTaxonomy: BloomTaxonomyLevel;
  @IsOptional() @IsString() topicId?: string;
}

export class BulkBankActionDto {
  @IsIn(['reembed', 'difficulty', 'delete']) action:
    'reembed' | 'difficulty' | 'delete';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids: string[];
  @IsOptional() @IsEnum(DifficultyLevel) difficulty?: DifficultyLevel;
}

export class ImportCsvDto {
  @IsString() @IsNotEmpty() subjectId: string;
}
