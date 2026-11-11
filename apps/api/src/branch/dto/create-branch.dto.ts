import {
  IsString,
  IsArray,
  ArrayMinSize,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateBranchDto {
  @ApiProperty({
    type: String,
    description: 'Academic branch name (e.g., علمي, أدبي, صناعي, شرعي)',
    example: 'علمي',
  })
  @IsString()
  @IsNotEmpty({ message: 'Branch name is required' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    type: [String],
    description: 'List of subject names (1–100 characters each)',
    minItems: 1,
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMinSize(1)
  subjects: string[];
}
