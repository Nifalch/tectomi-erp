import { IsBoolean, IsEmail, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

/** GET /contacts query DTO — filter by clientId. Declared explicitly so the
 *  strict ValidationPipe doesn't reject ?clientId=... with "property
 *  clientId should not exist". */
export class ListContactsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  clientId?: string;
}

export class CreateContactDto {
  @IsString()
  clientId!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
