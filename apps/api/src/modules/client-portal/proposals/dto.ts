import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class DecideDto {
  @IsEnum(["ACCEPTED", "REJECTED"])
  decision!: "ACCEPTED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
