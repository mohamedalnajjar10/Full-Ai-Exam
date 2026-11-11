import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Subject ID to scope this chat session',
    example: 'cmtd5k3ts0001physics',
  })
  @IsString()
  subjectId: string;
}
