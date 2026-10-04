import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateCommunicationDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(["INBOUND", "OUTBOUND"])
  direction?: string;
}
