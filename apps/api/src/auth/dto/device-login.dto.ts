import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeviceLoginDto {
  @ApiProperty({
    description:
      'Encrypted Device Trust Token stored in localStorage (60-day validity for Safari cookie loss resiliency)',
    example:
      'dGhpcyBpcyBhIHNhbXBsZSBpdi4u.YXV0aFRhZ1NhbXBsZQ.Y2lwaGVydGV4dFNhbXBsZQ',
  })
  @IsString()
  @IsNotEmpty({ message: 'deviceTrustToken is required' })
  deviceTrustToken: string;
}
