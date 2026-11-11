import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateFromStyleDto {
  @ApiProperty({ description: 'ID of the processed StyleSourceUpload' })
  @IsString()
  styleUploadId: string;

  @ApiProperty({ description: 'Target subject ID for curriculum grounding' })
  @IsString()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Optional topic or chapter tag' })
  @IsOptional()
  @IsString()
  topicId?: string;

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
