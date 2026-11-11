import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssessmentAttemptStatus } from '@prisma/client';

export class AssessmentHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter attempts by subject ID',
    example: 'clx0123456789abcdef01234',
  })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({
    enum: AssessmentAttemptStatus,
    description: 'Filter attempts by status (PENDING or COMPLETED)',
  })
  @IsOptional()
  @IsEnum(AssessmentAttemptStatus)
  status?: AssessmentAttemptStatus;
}
