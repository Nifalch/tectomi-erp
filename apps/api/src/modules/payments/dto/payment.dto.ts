import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { ExpenseCategory, PaymentMethod, PaymentType } from "@prisma/client";
import { PaginationDto } from "../../../common/pagination/pagination.dto";

/** Query DTO for GET /payments — adds an optional `type` filter on top of pagination. */
export class ListPaymentsDto extends PaginationDto {
  @IsOptional() @IsEnum(PaymentType) type?: PaymentType;
}

export class PaymentAllocationDto {
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() billId?: string;
  @Type(() => Number) @IsNumber() amount!: number;
}

export class CreatePaymentDto {
  @IsEnum(PaymentType) type!: PaymentType;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsDateString() paymentDate!: string;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsString() bankAccountId?: string;
  /** Only meaningful for type=MADE — categorises the outflow for the expenses dashboard. */
  @IsOptional() @IsEnum(ExpenseCategory) expenseCategory?: ExpenseCategory;
  /** Set when this payment was auto-generated from a RecurringExpense template. */
  @IsOptional() @IsString() recurringExpenseId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

export class UpdatePaymentDto {
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}
