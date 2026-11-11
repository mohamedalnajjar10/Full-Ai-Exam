import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateSubjectDto {
  @ApiProperty({
    type: String,
    description: 'Subject name (e.g., رياضيات, فيزياء, لغة عربية)',
    example: 'رياضيات',
  })
  @IsString()
  @IsNotEmpty({ message: 'Subject name is required' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    type: String,
    description: 'Branch ID that this subject belongs to',
    example: 'clx123abc456',
  })
  @IsString()
  @IsNotEmpty({ message: 'Branch ID is required' })
  branchId: string;
}
