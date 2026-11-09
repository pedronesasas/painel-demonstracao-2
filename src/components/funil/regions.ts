/** Regiões e canais da área de Funis (constantes compartilhadas). */

export type Region = "BR" | "LATAM" | "ALE" | "FRA" | "ITA" | "EUA";
export type OfferChannel = "frontend" | "backend";

export const REGIONS: Region[] = ["BR", "LATAM", "ALE", "FRA", "ITA", "EUA"];

export const REGION_LABEL: Record<Region, string> = {
  BR: "Brasil", LATAM: "LATAM", ALE: "Alemanha", FRA: "França", ITA: "Itália", EUA: "EUA",
};

export const REGION_COLOR: Record<Region, string> = {
  BR: "#22c55e",
  LATAM: "#eab308",
  ALE: "#ef4444",
  FRA: "#3b82f6",
  ITA: "#16a34a",
  EUA: "#60a5fa",
};
