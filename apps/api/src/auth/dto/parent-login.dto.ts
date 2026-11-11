import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ParentLoginDto {
  @ApiPropertyOptional({
    description: 'Parent mobile phone number (strictly begins with 056 or 059)',
    example: '0591234567',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Cryptographically generated 6-digit family PIN',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  pin?: string;

  @ApiPropertyOptional({
    description: 'High-entropy 32-byte hexadecimal single-use magic token',
    example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  })
  @IsOptional()
  @IsString()
  magicToken?: string;
}
