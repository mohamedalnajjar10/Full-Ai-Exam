import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BranchActionDto {
  @ApiProperty({ description: 'Branch ID to select or change to' })
  @IsString()
  @IsNotEmpty()
  branchId: string;
}
