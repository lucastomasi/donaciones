export const DISCORD_HREF = "https://discord.gg/WjkmSeC7Jv";

export type PointRow = {
  name: string;
  points: number;
  archiveName: string | null;
  note?: string;
};

/** Streamlabs chat ranking. These figures are palancoins, not pesos and not Kick gifts. */
export const POINT_BOARD: PointRow[] = [
  {
    name: "Soylucastomasi",
    points: 4725020,
    archiveName: "soylucastomasi",
    note: "En Kick es raffsody. Misma persona.",
  },
  { name: "IggyNoise1", points: 1775165, archiveName: null },
  { name: "CheFacu", points: 1399447, archiveName: null },
  { name: "Maravillandri", points: 1012716, archiveName: "Maravillandri" },
  { name: "SokaLuis", points: 984145, archiveName: null },
  { name: "muscifede", points: 950394, archiveName: "MusciFede" },
  { name: "rodrinovas7929", points: 924300, archiveName: null },
  { name: "fernandoferreira8022", points: 897850, archiveName: null },
  { name: "pajandrista01", points: 836650, archiveName: "Pajandrista01" },
  { name: "TNMGTNMGTNMG", points: 825197, archiveName: null },
];

export type GiftRow = {
  name: string;
  gifts: number;
  archiveName: string | null;
  note?: string;
};

/** Each gifted Kick membership is worth this many dollars, for every user. */
export const GIFT_USD = 5;
export const KICK_GIFTS: GiftRow[] = [
  { name: "raffsody", gifts: 76, archiveName: "soylucastomasi", note: "soylucastomasi en el archivo" },
  { name: "DAROPO", gifts: 13, archiveName: null },
  { name: "Na_aru", gifts: 10, archiveName: null },
  { name: "TheDiegoNG", gifts: 5, archiveName: null },
  { name: "LeandroMore", gifts: 5, archiveName: null },
  { name: "SotZz27", gifts: 2, archiveName: null },
  { name: "AlexisMol", gifts: 2, archiveName: "AlexisMol", note: "También está en el archivo" },
  { name: "sebaszz007", gifts: 1, archiveName: null },
  { name: "ElclondeConan", gifts: 1, archiveName: "ElClondeConan", note: "También está en el archivo" },
  { name: "Davidinsa2379", gifts: 1, archiveName: null },
];

