import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateParentLinkDto {
  @ApiProperty({
    description: 'Full name of the parent',
    example: 'أحمد السعيد',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Parent name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Parent name cannot exceed 100 characters' })
  parentName: string;

  @ApiProperty({
    description: 'Parent mobile phone number (strictly begins with 056 or 059)',
    example: '0591234567',
  })
  @IsString()
  @IsNotEmpty({ message: 'Parent phone number is required' })
  parentPhone: string;
}
