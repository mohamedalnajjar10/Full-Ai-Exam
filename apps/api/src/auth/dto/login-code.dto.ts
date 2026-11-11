import { IsEmail, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase().trim() : value;

/**
 * DTO for requesting a one-time sign-in code by email
 */
export class RequestLoginCodeDto {
  @ApiProperty({
    description: 'Account email address',
    example: 'ahmed@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @Transform(normalizeEmail)
  email: string;
}

/**
 * DTO for signing in with the emailed one-time code
 */
export class VerifyLoginCodeDto extends RequestLoginCodeDto {
  @ApiProperty({
    description: 'Six-digit code sent by email',
    example: '483920',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;
}
