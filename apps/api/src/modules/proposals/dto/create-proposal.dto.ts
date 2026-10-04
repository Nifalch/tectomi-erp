import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class ProposalBlockInput {
  @IsString()
  heading!: string;

  @IsString()
  content!: string;

  // How many weeks this phase spans — drives the timeline Gantt visualization
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationWeeks?: number;
}

export enum DeliverableKindInput {
  INCLUDED = "INCLUDED",
  EXCLUDED = "EXCLUDED",
}

class ProposalDeliverableInput {
  @IsEnum(DeliverableKindInput)
  kind!: DeliverableKindInput;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Per-feature price for the pricing breakdown page (only meaningful when kind = INCLUDED)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class CreateProposalDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsString()
  projectName!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  projectUnderstanding?: string;

  @IsString()
  timeline!: string;

  @IsString()
  pricing!: string;

  @IsOptional()
  @IsString()
  paymentTermsText?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalBlockInput)
  blocks!: ProposalBlockInput[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ProposalDeliverableInput)
  deliverables?: ProposalDeliverableInput[];
}

export class UpdateProposalDto {
  // Allow reassigning the proposal to a different client / project. The
  // service uses these to update the FK references; null on projectId
  // clears any existing project link without rejecting the request.
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() projectId?: string | null;

  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() projectUnderstanding?: string;
  @IsOptional() @IsString() timeline?: string;
  @IsOptional() @IsString() pricing?: string;
  @IsOptional() @IsString() paymentTermsText?: string;
  @IsOptional() @IsDateString() validUntil?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalBlockInput)
  blocks?: ProposalBlockInput[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalDeliverableInput)
  deliverables?: ProposalDeliverableInput[];
}
