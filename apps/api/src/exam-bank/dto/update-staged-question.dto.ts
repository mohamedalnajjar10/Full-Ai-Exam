import { IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ChoiceItem {
  @IsString()
  label: string;

  @IsString()
  text: string;
}

export class UpdateStagedQuestionDto {
  @ApiPropertyOptional({ description: 'Corrected question text' })
  @IsOptional()
  @IsString()
  questionText?: string;

  @ApiPropertyOptional({
    description: 'Corrected choices array',
    type: [ChoiceItem],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChoiceItem)
  choices?: ChoiceItem[];

  @ApiPropertyOptional({ description: 'Corrected correct answer label' })
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional({ description: 'Corrected explanation' })
  @IsOptional()
  @IsString()
  explanation?: string;
}
