import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class ContactUsDto {
  @IsString()
  @IsNotEmpty({ message: 'الاسم مطلوب' })
  @Length(2, 100, { message: 'يجب أن يكون الاسم بين حرفين و100 حرف' })
  name: string;

  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: 'رقم الهاتف طويل جداً' })
  phone?: string;

  @IsString()
  @IsNotEmpty({ message: 'الرسالة مطلوبة' })
  @Length(10, 3000, { message: 'يجب ألا تقل الرسالة عن 10 أحرف' })
  message: string;
}
