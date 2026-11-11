import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Fields a student can change on their own profile */
export class UpdateProfileDto {
  @ApiProperty({ description: 'Full name', example: 'أحمد علي' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  @MaxLength(100, { message: 'name must not exceed 100 characters' })
  name: string;
}
