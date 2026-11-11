import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description:
      'The student message. Can be natural language like "أريد أسئلة مشابهة لامتحان التكامل 2020" or a direct command.',
    maxLength: 2000,
    example: 'أريد 5 أسئلة صعبة في وحدة التكامل',
  })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    description:
      'Optional locale hint for response language (ar = Arabic, en = English). Defaults to Arabic.',
    example: 'ar',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}
