import {
  IsArray,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsInt,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TeacherOrderItemDto {
  @ApiProperty({ description: 'Teacher ID', example: 'clx123abc456' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'New display order sequence index', example: 1 })
  @IsInt()
  displayOrder: number;
}

export class ReorderTeachersDto {
  @ApiProperty({
    type: [TeacherOrderItemDto],
    description: 'Array of teacher IDs and their new display order',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => TeacherOrderItemDto)
  orders: TeacherOrderItemDto[];
}
