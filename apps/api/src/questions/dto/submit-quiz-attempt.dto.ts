import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsNumber,
  IsArray,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum QuizAttemptSource {
  GENERATED = 'GENERATED',
  CHAT = 'CHAT',
  RETAKE = 'RETAKE',
}

export class SubmitQuizAttemptDto {
  @ApiProperty({ description: 'Target subject ID' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ description: 'Subject name in Arabic' })
  @IsString()
  subjectName: string;

  @ApiProperty({
    description: 'Number of correctly answered questions',
    minimum: 0,
    maximum: 100,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  correct: number;

  @ApiProperty({
    description: 'Total number of questions in quiz',
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  total: number;

  @ApiProperty({
    description: 'Duration in seconds spent solving the quiz',
    minimum: 0,
    maximum: 86400,
  })
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSec: number;

  @ApiProperty({
    enum: QuizAttemptSource,
    description: 'Source mode: GENERATED, CHAT, or RETAKE',
    default: QuizAttemptSource.GENERATED,
  })
  @IsEnum(QuizAttemptSource)
  source: QuizAttemptSource;

  @ApiPropertyOptional({ description: 'Difficulty level of the quiz' })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({
    description: 'Previous score achieved before retaking (if applicable)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  previousScore?: number;

  @ApiPropertyOptional({
    description: 'Full questions array with choices and explanations',
  })
  @IsOptional()
  @IsArray()
  questions?: any[];

  @ApiPropertyOptional({
    description: 'Map of questionId to student chosen answer label',
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, string | null>;
}
