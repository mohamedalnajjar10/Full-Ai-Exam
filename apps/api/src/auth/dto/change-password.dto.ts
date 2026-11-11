import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for changing the password of a signed-in user. currentPassword is
 * required unless the account has none yet (created with Google).
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password. Omit only for accounts without a password.',
    example: 'StrongPass123',
    required: false,
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({
    description:
      'New password - at least 8 characters with letters and numbers',
    example: 'NewStrongPass456',
  })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @MaxLength(100, { message: 'password must not exceed 100 characters' })
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one number' })
  newPassword: string;
}
