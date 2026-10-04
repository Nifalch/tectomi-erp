import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { BankAccountType, BankTxnType } from "@prisma/client";

export class CreateBankAccountDto {
  @IsString() name!: string;
  @IsOptional() @IsEnum(BankAccountType) type?: BankAccountType;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() currency?: string;
  @Type(() => Number) @IsNumber() openingBalance!: number;
  @IsOptional() @IsString() accountId?: string;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(BankAccountType) type?: BankAccountType;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() openingBalance?: number;
  @IsOptional() @IsString() accountId?: string;
}

export class CreateBankTransactionDto {
  @IsDateString() date!: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsEnum(BankTxnType) type!: BankTxnType;
  @IsString() description!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() categoryId?: string;
}
