import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for rotating a refresh token into a new access/refresh token pair
 */
export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'The refresh token previously issued at register/login (optional if sent via HttpOnly cookie)',
    example: 'eyJhbGciOiJIUzI1NiIs...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
