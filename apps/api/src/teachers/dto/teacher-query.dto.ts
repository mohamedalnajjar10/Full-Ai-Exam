import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class TeacherQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Search across teacher name, title, and bio',
    example: 'رياضيات',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined,
  )
  search?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter teachers by associated Subject ID',
    example: 'clx123abc456',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined,
  )
  subjectId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Filter by active status (defaults to true for public showcase if not specified)',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: Number,
    description: 'Page number for pagination (starts at 1)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    description: 'Number of items per page (maximum 50)',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @ApiPropertyOptional({
    type: String,
    enum: ['displayOrder', 'createdAt', 'name', 'yearsOfExperience'],
    description: 'Sort field',
    default: 'displayOrder',
    example: 'displayOrder',
  })
  @IsOptional()
  @IsIn(['displayOrder', 'createdAt', 'name', 'yearsOfExperience'])
  sortBy: string = 'displayOrder';

  @ApiPropertyOptional({
    type: String,
    enum: ['asc', 'desc'],
    description: 'Sort direction',
    default: 'asc',
    example: 'asc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
