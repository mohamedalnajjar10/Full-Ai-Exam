import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RedeemVoucherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;
}

export class CreateVoucherDto {
  @IsString()
  @IsNotEmpty()
  planCode: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}

export class GrantSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  planCode: string;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  planCode: string;
}
