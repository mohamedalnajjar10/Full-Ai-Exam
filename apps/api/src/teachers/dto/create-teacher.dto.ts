import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class CreateTeacherDto {
  @ApiProperty({
    type: String,
    description: 'Teacher full name (with honorific, e.g. أ. أمل محمود)',
    example: 'أ. أمل محمود',
  })
  @IsString()
  @IsNotEmpty({ message: 'Teacher name is required' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    type: String,
    description:
      'Teacher specialization / title (e.g. معلمة رياضيات, معلم فيزياء)',
    example: 'معلمة رياضيات',
  })
  @IsString()
  @IsNotEmpty({ message: 'Teacher title is required' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title: string;

  @ApiProperty({
    type: String,
    description: 'Teacher bio and teaching experience description',
    example:
      'خبرة أكثر من 12 عاماً في تدريس المناهج وتجهيز الطلاب للامتحانات الوزارية.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Teacher bio is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bio: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Direct image URL or CDN link (if not uploading a file)',
    example: 'https://storage.example.com/teachers/amal-mahmoud.jpg',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional ID of the associated curriculum Subject',
    example: 'clx123abc456',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined,
  )
  subjectId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Years of teaching experience',
    example: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Whether the teacher is active and displayed on the website',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Display order priority in the showcase grid (lower numbers appear first)',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number = 0;
}
