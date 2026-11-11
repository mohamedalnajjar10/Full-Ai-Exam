import { IsString, IsInt, IsNotEmpty, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UploadExamDto {
  @ApiProperty({ description: 'Branch ID the exam belongs to' })
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @ApiProperty({ description: 'Subject ID the exam belongs to' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ description: 'Exam year', example: 2025 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number;

  @ApiProperty({
    description: 'Exam term/semester',
    example: 'First',
  })
  @IsString()
  @IsNotEmpty()
  term: string;
}
