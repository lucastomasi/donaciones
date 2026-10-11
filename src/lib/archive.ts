export type Donation = {
  id: number;
  nombre: string;
  mensaje: string;
  monto_usd: number;
  monto_ars: number;
  privado: boolean;
  fecha_relativa: string;
  fecha_aprox: string | null;
  devuelta: boolean;
  devolucion: string | null;
};

export type DonorStat = {
  nombre: string;
  aliases: string[];
  count: number;
  ars: number;
  usd: number;
  giftUsd?: number;
};

export type Bracket = {
  label: string;
  count: number;
};

export type PeriodPoint = {
  key: string;
  label: string;
  count: number;
  ars: number;
  usd: number;
};

export type WordTerm = {
  key: string;
  label: string;
  count: number;
};

export type DonorProfile = DonorStat & {
  nameKey: string;
  first: Donation;
  last: Donation;
  biggest: Donation;
  refundedCount: number;
  refundedArs: number;
  refundedUsd: number;
  giftUsd: number;
};

export type ParetoStep = {
  label: string;
  donors: number;
  usdShare: number;
};

export type YoutubeVideo = {
  id: string;
  count: number;
  usd: number;
  donors: number;
  title: string;
  author: string;
  href: string;
};

export type ChatRank = {
  nombre: string;
  count: number;
  share: number;
};

export type ChatMine = {
  named: ChatRank[];
  funny: ChatRank[];
  witty: ChatRank[];
};

export type BehaviorRow = {
  key: string;
  label: string;
  count: number;
  share: number;
  usdShare: number;
  avgArs: number;
};

export type Conducta = {
  rows: BehaviorRow[];
  habituales: number;
  deClip: number;
  deRelato: number;
};

export type Mining = {
  medianArs: number;
  meanArs: number;
  repeatDonors: number;
  repeatDonorShare: number;
  repeatDonationShare: number;
  topPercentCount: number;
  topPercentUsdShare: number;
  top10UsdShare: number;
  rawNames: number;
  modeArs: number;
  modeCount: number;
  onceDonorShare: number;
  onceUsdShare: number;
  repeatUsdShare: number;
  roundHundredShare: number;
  fxMode: number;
  fxModeShare: number;
  halfUsdDonors: number;
  eightyUsdDonors: number;
  ladderShare: number;
  smallCountShare: number;
  smallUsdShare: number;
  largeCountShare: number;
  largeUsdShare: number;
  loyalDonors: number;
  loyalDonorShare: number;
  loyalUsdShare: number;
  pareto: ParetoStep[];
};

export type ArchiveMeta = {
  source: string;
  username: string;
  scrapedAt: string;
  count: number;
  totalArs: number;
  totalUsd: number;
  donorCount: number;
  privateCount: number;
  note: string;
  listedCount: number;
  refundedCount: number;
  refundedArs: number;
  refundedUsd: number;
  refundNote: string;
  refunds: Donation[];
  topByUsd: DonorStat[];
  topByCount: DonorStat[];
  brackets: Bracket[];
  periods: PeriodPoint[];
  words: WordTerm[];
  youtubeMessages: number;
  linkMessages: number;
  linkTotal: number;
  youtubeLinks: number;
  youtubeWatch: number;
  youtubeShortlink: number;
  youtubeShorts: number;
  youtubeLive: number;
  youtubeUnique: number;
  youtubeOnce: number;
  videos: YoutubeVideo[];
  chat: ChatMine;
  conducta: Conducta;
  mining: Mining;
};

export type SortKey = "reciente" | "antigua" | "mayor" | "menor";

export type Filters = {
  q: string;
  donor: string;
  sort: SortKey;
  min: number | null;
  page: number;
};

export type ListSearch = {
  q?: string;
  donor?: string;
  sort?: SortKey;
  page?: number;
  min?: number;
};

export type PageResult = {
  total: number;
  pages: number;
  page: number;
  rows: Donation[];
};

export const PAGE_SIZE = 40;

const SORTS: SortKey[] = ["reciente", "antigua", "mayor", "menor"];

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function clip(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

function sortOf(value: string): SortKey {
  return SORTS.includes(value as SortKey) ? (value as SortKey) : "reciente";
}

function pageOf(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(str(value) || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 100_000);
}

function minOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? String(value) : str(value);
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 1_000_000_000);
}

export function parseListSearch(raw: Record<string, unknown>): ListSearch {
  const search: ListSearch = {
    q: clip(str(raw.q), 200),
    donor: clip(str(raw.donor), 160),
    sort: sortOf(str(raw.sort)),
    page: pageOf(raw.page),
  };
  const min = minOf(raw.min);
  if (min !== null) search.min = min;
  return search;
}

export function parseFilters(input: unknown): Filters {
  return toFilters(parseListSearch(asRecord(input)));
}

export function toFilters(search: ListSearch, donorOverride?: string): Filters {
  return {
    q: search.q ?? "",
    donor: donorOverride ?? search.donor ?? "",
    sort: search.sort ?? "reciente",
    min: search.min ?? null,
    page: search.page && search.page > 0 ? search.page : 1,
  };
}

export function readDonorName(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function donorHref(name: string) {
  return `/donante/${encodeURIComponent(name)}`;
}

export function formatAliases(aliases: string[], primary?: string) {
  return aliases.filter((name) => name !== primary).join(" · ");
}

export function filtersToSearch(filters: Filters, page?: number, basePath = "/") {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.donor && basePath === "/") params.set("donor", filters.donor);
  if (filters.sort !== "reciente") params.set("sort", filters.sort);
  if (filters.min !== null) params.set("min", String(filters.min));
  const nextPage = page ?? filters.page;
  if (nextPage > 1) params.set("page", String(nextPage));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function exportHref(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.donor) params.set("donor", filters.donor);
  if (filters.sort !== "reciente") params.set("sort", filters.sort);
  if (filters.min !== null) params.set("min", String(filters.min));
  const query = params.toString();
  return query ? `/api/export?${query}` : "/api/export";
}

export const EMPTY_SEARCH: ListSearch = {
  q: "",
  donor: "",
  sort: "reciente",
  page: 1,
};
