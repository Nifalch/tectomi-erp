import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class GenerateProposalDto {
  /** Free-text description of the engagement. The AI uses this as the source of truth. */
  @IsString()
  @MinLength(12, { message: "Please describe the requirement in at least a sentence or two." })
  requirement!: string;

  /** Optional hint — pre-fills the project title in the generated payload. */
  @IsOptional()
  @IsString()
  projectName?: string;

  /** Optional hint — name of the client (used in copy, not as the proposal's clientId). */
  @IsOptional()
  @IsString()
  clientName?: string;

  /** Optional hint — target engagement duration. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  durationWeeks?: number;

  /** Optional override of the org's default hourly rate (used to compute pricing). */
  @IsOptional()
  @IsInt()
  @Min(1)
  hourlyRate?: number;
}
