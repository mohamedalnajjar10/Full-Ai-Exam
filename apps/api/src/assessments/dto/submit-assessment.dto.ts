import { IsString, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import type {
  SubmitAssessmentAnswerItem,
  SubmitAssessmentRequest,
} from '@ai-exam/types';

export class SubmitAnswerItemDto implements SubmitAssessmentAnswerItem {
  @ApiProperty({
    description: 'The assessment question ID being answered',
    example: 'clx0123456789abcdef01234',
  })
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @ApiProperty({
    description: 'The student answer choice (e.g. A, B, C, D or choice text)',
    example: 'A',
  })
  @IsString()
  @IsNotEmpty()
  answer: string;
}

export class SubmitAssessmentDto implements SubmitAssessmentRequest {
  @ApiProperty({
    type: [SubmitAnswerItemDto],
    description: 'List of student answers for each question in the assessment',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerItemDto)
  answers: SubmitAnswerItemDto[];
}
