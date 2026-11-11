import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SubjectQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Filter subjects by branch ID',
    example: 'clx123abc456',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Search subjects by name (case-insensitive substring)',
    example: 'رياضيات',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
