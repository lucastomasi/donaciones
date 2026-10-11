import archiveJson from "../../data/donations.json";
import refundsJson from "../../data/refunds.json";
import {
  PAGE_SIZE,
  parseFilters,
  readDonorName,
  type ArchiveMeta,
  type Donation,
  type DonorProfile,
  type Filters,
  type Mining,
  type PageResult,
  type PeriodPoint,
  type WordTerm,
} from "./archive";
import { STOP_WORDS } from "./stopwords";
import { canonicalKey } from "./identities";
import { GIFT_USD, KICK_GIFTS, POINT_BOARD } from "./chat-board";
import { formatArs, formatCount, formatPct, formatUsd } from "./format";

type RawDonation = Omit<Donation, "devuelta" | "devolucion">;

type ArchiveFile = {
  source: string;
  username: string;
  scraped_at: string;
  count: number;
  total_ars: number;
  total_usd: number;
  note: string;
  donations: RawDonation[];
};

type RefundFile = {
  note: string;
  refunds: { id: number; reason: string }[];
};

type IndexedDonation = Donation & {
  nameKey: string;
  haystack: string;
};

type Cache = {
  rows: IndexedDonation[];
  meta: ArchiveMeta;
  donors: Map<string, DonorProfile>;
};

const TOKEN = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]{3,}/g;
const URL_CHUNK = /https?:\/\/\S+|www\.\S+/gi;
const VIDEO_ID = /^[\w-]{11}$/;

function videosIn(message: string) {
  const matches = message.match(/(?:https?:\/\/|www\.)?(?:(?:[\w-]+\.)?youtube\.com|youtu\.be)\/[^\s<>"']+/gi) ?? [];
  const found: { id: string; kind: "corto" | "watch" | "short" | "directo" }[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    let text = raw.replace(/[).,;|]+$/, "");
    try {
      text = decodeURIComponent(text);
    } catch {
      /* keep the raw url */
    }
    if (!/^https?:/i.test(text)) text = `https://${text.replace(/^\/\//, "")}`;
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    let id = "";
    let kind: "corto" | "watch" | "short" | "directo" = "watch";
    if (host === "youtu.be") {
      id = (parts[0] ?? "").slice(0, 11);
      kind = "corto";
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const head = parts[0] ?? "";
      if (head === "shorts" || head === "live" || head === "embed") {
        id = (parts[1] ?? "").slice(0, 11);
        kind = head === "shorts" ? "short" : head === "live" ? "directo" : "watch";
      } else if (head === "watch" || url.searchParams.has("v")) {
        id = url.searchParams.get("v") ?? "";
        kind = "watch";
      }
    }
    if (!VIDEO_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    found.push({ id, kind });
  }
  return found;
}

const BRACKETS: { label: string; min: number; max: number | null }[] = [
  { label: "Menos de $500", min: 0, max: 500 },
  { label: "$500 a $1.999", min: 500, max: 2000 },
  { label: "$2.000 a $9.999", min: 2000, max: 10000 },
  { label: "$10.000 a $49.999", min: 10000, max: 50000 },
  { label: "$50.000 o más", min: 50000, max: null },
];

const PERIOD_ORDER = [
  "hace-anos",
  "hace-8-meses",
  "hace-7-meses",
  "hace-6-meses",
  "hace-5-meses",
  "hace-4-meses",
  "hace-3-meses",
  "hace-2-meses",
  "hace-1-mes",
  "este-mes",
  "esta-semana",
  "ayer",
  "ultimas-horas",
  "otras",
];

let cache: Cache | null = null;

export function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function periodOf(label: string): { key: string; label: string } {
  const match = /^Hace\s+(\d+)\s+(\S+)$/i.exec(label.trim());
  if (!match) return { key: "otras", label: "Otras" };
  const amount = Number(match[1]);
  const unit = fold(match[2]);
  if (unit.startsWith("hora")) return { key: "ultimas-horas", label: "Últimas horas" };
  if (unit.startsWith("dia")) {
    return amount <= 1 ? { key: "ayer", label: "Ayer" } : { key: "esta-semana", label: "Esta semana" };
  }
  if (unit.startsWith("semana")) return { key: "este-mes", label: "Este mes" };
  if (unit.startsWith("mes")) {
    return {
      key: amount === 1 ? "hace-1-mes" : `hace-${amount}-meses`,
      label: amount === 1 ? "Hace 1 mes" : `Hace ${amount} meses`,
    };
  }
  if (unit.startsWith("ano")) return { key: "hace-anos", label: "Hace años" };
  return { key: "otras", label: "Otras" };
}

function toPublic(row: IndexedDonation): Donation {
  return {
    id: row.id,
    nombre: row.nombre,
    mensaje: row.mensaje,
    monto_usd: row.monto_usd,
    monto_ars: row.monto_ars,
    privado: row.privado,
    fecha_relativa: row.fecha_relativa,
    fecha_aprox: row.fecha_aprox,
    devuelta: row.devuelta,
    devolucion: row.devolucion,
  };
}

function countWords(message: string, wordMap: Map<string, Map<string, number>>) {
  const cleaned = message.replace(URL_CHUNK, " ");
  const tokens = cleaned.match(TOKEN);
  if (!tokens) return;
  for (const raw of tokens) {
    const key = fold(raw);
    if (STOP_WORDS.has(key) || /^\d+$/.test(key)) continue;
    const variants = wordMap.get(key);
    if (variants) variants.set(raw, (variants.get(raw) ?? 0) + 1);
    else wordMap.set(key, new Map([[raw, 1]]));
  }
}

function rankWords(wordMap: Map<string, Map<string, number>>): WordTerm[] {
  return [...wordMap.entries()]
    .map(([key, variants]) => {
      const ranked = [...variants.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      const count = ranked.reduce((sum, [, n]) => sum + n, 0);
      return { key, label: ranked[0]?.[0] ?? key, count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

function build(): Cache {
  const parsed = archiveJson as ArchiveFile;
  const refunds = refundsJson as RefundFile;
  const byId = new Map(refunds.refunds.map((item) => [item.id, item.reason]));
  const rows: IndexedDonation[] = parsed.donations.map((row) => {
    const devolucion = byId.get(row.id) ?? null;
    const extra = devolucion ? " devuelta devolucion reintegro" : "";
    return {
      ...row,
      devuelta: Boolean(devolucion),
      devolucion,
      nameKey: canonicalKey(fold(row.nombre)),
      haystack: fold(`${row.nombre} ${row.mensaje}${extra}`),
    };
  });

  const donors = new Map<
    string,
    {
      variants: Map<string, number>;
      count: number;
      ars: number;
      usd: number;
      refundedCount: number;
      refundedArs: number;
      refundedUsd: number;
      first: IndexedDonation;
      last: IndexedDonation;
      biggest: IndexedDonation | null;
    }
  >();
  const brackets = BRACKETS.map((bracket) => ({ label: bracket.label, count: 0 }));
  const periodMap = new Map<string, PeriodPoint>();
  const wordMap = new Map<string, Map<string, number>>();
  const videoMap = new Map<string, { count: number; usd: number; donors: Set<string> }>();
  let youtubeMessages = 0;
  let linkMessages = 0;
  let linkTotal = 0;
  let youtubeLinks = 0;
  let youtubeWatch = 0;
  let youtubeShortlink = 0;
  let youtubeShorts = 0;
  let youtubeLive = 0;
  const refundedRows: IndexedDonation[] = [];
  let privateCount = 0;
  let counted = 0;
  let totalArs = 0;
  let totalUsd = 0;
  let refundedArs = 0;
  let refundedUsd = 0;

  for (const row of rows) {
    if (row.devuelta) {
      refundedRows.push(row);
      refundedArs += row.monto_ars;
      refundedUsd += row.monto_usd;
    } else {
      counted += 1;
      totalArs += row.monto_ars;
      totalUsd += row.monto_usd;
      if (row.privado) privateCount += 1;
      else {
        countWords(row.mensaje, wordMap);
        const links = row.mensaje.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi);
        if (links?.length) {
          linkMessages += 1;
          linkTotal += links.length;
        }
        const videos = videosIn(row.mensaje);
        if (videos.length > 0) {
          youtubeMessages += 1;
          for (const video of videos) {
            youtubeLinks += 1;
            if (video.kind === "corto") youtubeShortlink += 1;
            else if (video.kind === "short") youtubeShorts += 1;
            else if (video.kind === "directo") youtubeLive += 1;
            else youtubeWatch += 1;
            const fact = videoMap.get(video.id) ?? { count: 0, usd: 0, donors: new Set<string>() };
            fact.count += 1;
            fact.usd += row.monto_usd;
            fact.donors.add(canonicalKey(fold(row.nombre)));
            videoMap.set(video.id, fact);
          }
        }
      }
      const bracket = BRACKETS.findIndex(
        (item) => row.monto_ars >= item.min && (item.max === null || row.monto_ars < item.max),
      );
      if (bracket >= 0) brackets[bracket].count += 1;
      const period = periodOf(row.fecha_relativa);
      const bucket = periodMap.get(period.key);
      if (bucket) {
        bucket.count += 1;
        bucket.ars += row.monto_ars;
        bucket.usd += row.monto_usd;
      } else {
        periodMap.set(period.key, {
          key: period.key,
          label: period.label,
          count: 1,
          ars: row.monto_ars,
          usd: row.monto_usd,
        });
      }
    }

    const current = donors.get(row.nameKey);
    if (!current) {
      donors.set(row.nameKey, {
        variants: new Map([[row.nombre, 1]]),
        count: row.devuelta ? 0 : 1,
        ars: row.devuelta ? 0 : row.monto_ars,
        usd: row.devuelta ? 0 : row.monto_usd,
        refundedCount: row.devuelta ? 1 : 0,
        refundedArs: row.devuelta ? row.monto_ars : 0,
        refundedUsd: row.devuelta ? row.monto_usd : 0,
        first: row,
        last: row,
        biggest: row.devuelta ? null : row,
      });
      continue;
    }
    if (row.devuelta) {
      current.refundedCount += 1;
      current.refundedArs += row.monto_ars;
      current.refundedUsd += row.monto_usd;
    } else {
      current.count += 1;
      current.ars += row.monto_ars;
      current.usd += row.monto_usd;
      if (!current.biggest || row.monto_usd > current.biggest.monto_usd) current.biggest = row;
    }
    current.variants.set(row.nombre, (current.variants.get(row.nombre) ?? 0) + 1);
    if (row.id < current.first.id) current.first = row;
    if (row.id > current.last.id) current.last = row;
  }

  const donorProfiles: DonorProfile[] = [...donors.entries()].map(([nameKey, donor]) => {
    const aliases = [...donor.variants.entries()]
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], "es"))
      .map(([name]) => name);
    return {
      nameKey,
      nombre: aliases[0] ?? nameKey,
      aliases,
      count: donor.count,
      ars: donor.ars,
      usd: donor.usd,
      first: toPublic(donor.first),
      last: toPublic(donor.last),
      biggest: toPublic(donor.biggest ?? donor.first),
      refundedCount: donor.refundedCount,
      refundedArs: donor.refundedArs,
      refundedUsd: donor.refundedUsd,
      giftUsd: 0,
    };
  });

  let giftUsd = 0;
  const byKey = new Map(donorProfiles.map((donor) => [donor.nameKey, donor]));
  for (const gift of KICK_GIFTS) {
    const donor = byKey.get(canonicalKey(fold(gift.name)));
    if (!donor) continue;
    const extra = gift.gifts * GIFT_USD;
    donor.usd += extra;
    donor.giftUsd += extra;
    giftUsd += extra;
  }
  totalUsd += giftUsd;

  const meta: ArchiveMeta = {
    source: parsed.source,
    username: parsed.username,
    scrapedAt: parsed.scraped_at,
    count: counted,
    totalArs,
    totalUsd,
    donorCount: donors.size,
    privateCount,
    note: parsed.note,
    listedCount: rows.length,
    refundedCount: refundedRows.length,
    refundedArs,
    refundedUsd,
    refundNote: refunds.note,
    refunds: refundedRows.sort((a, b) => b.monto_ars - a.monto_ars).map(toPublic),
    topByUsd: [...donorProfiles].sort((a, b) => b.usd - a.usd || b.count - a.count).slice(0, 12),
    topByCount: [...donorProfiles].sort((a, b) => b.count - a.count || b.usd - a.usd).slice(0, 12),
    brackets,
    periods: PERIOD_ORDER.flatMap((key) => {
      const point = periodMap.get(key);
      return point ? [point] : [];
    }),
    words: rankWords(wordMap).slice(0, 72),
    youtubeMessages,
    linkMessages,
    linkTotal,
    youtubeLinks,
    youtubeWatch,
    youtubeShortlink,
    youtubeShorts,
    youtubeLive,
    youtubeUnique: videoMap.size,
    youtubeOnce: [...videoMap.values()].filter((fact) => fact.count === 1).length,
    videos: [...videoMap.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].usd - a[1].usd || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([id, fact]) => ({
        id,
        count: fact.count,
        usd: fact.usd,
        donors: fact.donors.size,
        title: "",
        author: "",
        href: `https://www.youtube.com/watch?v=${id}`,
      })),
    mining: mine(rows, donorProfiles, totalArs, totalUsd, counted),
    chat: chatMine(rows),
    conducta: conductaMine(rows),
  };

  return {
    rows,
    meta,
    donors: new Map(donorProfiles.map((donor) => [donor.nameKey, donor])),
  };
}

function chatMine(rows: IndexedDonation[]) {
  const counts = new Map<string, number>();
  const labels = new Map<string, Map<string, number>>();
  const open: IndexedDonation[] = [];
  for (const row of rows) {
    if (row.devuelta || row.privado) continue;
    open.push(row);
    const key = fold(row.nombre);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const variants = labels.get(key);
    if (variants) variants.set(row.nombre, (variants.get(row.nombre) ?? 0) + 1);
    else labels.set(key, new Map([[row.nombre, 1]]));
  }
  const labelOf = (key: string) => {
    let best = key;
    let bestCount = 0;
    for (const [name, count] of labels.get(key) ?? []) {
      if (count > bestCount) {
        best = name;
        bestCount = count;
      }
    }
    return best;
  };
  const handles = [...counts.entries()]
    .filter(([key, count]) => {
      if (count < 8 || key.length < 6 || HANDLE_STOP.has(key)) return false;
      return key.includes("_") || /\d/.test(key) || key.length >= 10;
    })
    .map(([key]) => key)
    .sort((a, b) => b.length - a.length);
  const mention = new Map<string, number>();
  const laughed = new Map<string, number>();
  const textCount = new Map<string, number>();
  const jokeCount = new Map<string, number>();
  const finder = handles.length > 0 ? new RegExp(`\\b(${handles.map(escapeRegExp).join("|")})\\b`, "g") : null;
  const laugh = /(?:j[aeiou]){2,}j?|k+j{2,}|jsjs|lol/;
  const link = /https?:\/\/|www\.|youtu/i;
  for (const row of open) {
    const key = fold(row.nombre);
    const text = fold(row.mensaje);
    if (finder && text) {
      finder.lastIndex = 0;
      const seen = new Set<string>();
      for (const match of text.matchAll(finder)) {
        const name = match[1];
        if (!name || name === key || seen.has(name)) continue;
        seen.add(name);
        mention.set(name, (mention.get(name) ?? 0) + 1);
        if (laugh.test(text)) laughed.set(name, (laughed.get(name) ?? 0) + 1);
      }
    }
    const raw = row.mensaje.trim();
    if (!link.test(raw) && raw.length >= 20 && raw.length <= 180) {
      textCount.set(key, (textCount.get(key) ?? 0) + 1);
      if (laugh.test(text)) jokeCount.set(key, (jokeCount.get(key) ?? 0) + 1);
    }
  }
  const byCount = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([key, count]) => ({ nombre: labelOf(key), count, share: 0 }));
  const witty = [...textCount.entries()]
    .filter(([key, count]) => count >= 30 && (counts.get(key) ?? 0) >= 40)
    .map(([key, count]) => ({
      key,
      share: (jokeCount.get(key) ?? 0) / count,
      count: jokeCount.get(key) ?? 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.share - a.share || b.count - a.count)
    .slice(0, 3)
    .map((row) => ({ nombre: labelOf(row.key), count: row.count, share: row.share }));
  return { named: byCount(mention), funny: byCount(laughed), witty };
}

const BEHAVIOR_RULES: { key: string; label: string; test: (text: string) => boolean }[] = [
  { key: "clip", label: "Trae un link", test: (text) => /https?:\/\/|www\.|youtu/.test(text) },
  { key: "risa", label: "Se ríe", test: (text) => /(?:j[aeiou]){2,}j?|k+j{2,}|jsjs|lol/.test(text) },
  {
    key: "barra",
    label: "Putea",
    test: (text) => /\b(boludo|pelotudo|forro|mierda|idiota|hdp|mogolic|estupid|puta|puto)\b/.test(text),
  },
  {
    key: "politica",
    label: "Habla de política",
    test: (text) => /\b(milei|caputo|adorni|kicillof|massa|kirchner|libertari|zurdo|peronis|grabois|macri)\b/.test(text),
  },
  {
    key: "aliento",
    label: "Alienta",
    test: (text) => /\b(abrazo|abrazos|fuerza|aguante|crack|genio|gracias|te quiero)\b/.test(text),
  },
  { key: "pregunta", label: "Pregunta", test: (text) => text.includes("?") || text.includes("¿") },
  { key: "saludo", label: "Saluda", test: (text) => /\b(hola|buenas|buen dia|buenos dias)\b/.test(text) },
];

const BEHAVIOR_LABELS = new Map<string, string>([
  ...BEHAVIOR_RULES.map((rule) => [rule.key, rule.label] as const),
  ["relato", "Cuenta algo"],
  ["corto", "Casi no escribe"],
]);

function behaviorOf(raw: string, text: string) {
  for (const rule of BEHAVIOR_RULES) {
    if (rule.test(text)) return rule.key;
  }
  return raw.length < 24 ? "corto" : "relato";
}

function conductaMine(rows: IndexedDonation[]) {
  const buckets = new Map<string, { count: number; usd: number; ars: number }>();
  const byDonor = new Map<string, Map<string, number>>();
  let open = 0;
  let openUsd = 0;
  for (const row of rows) {
    if (row.devuelta || row.privado) continue;
    const raw = row.mensaje.trim();
    const key = behaviorOf(raw, fold(row.mensaje));
    const bucket = buckets.get(key) ?? { count: 0, usd: 0, ars: 0 };
    bucket.count += 1;
    bucket.usd += row.monto_usd;
    bucket.ars += row.monto_ars;
    buckets.set(key, bucket);
    open += 1;
    openUsd += row.monto_usd;
    const donor = byDonor.get(row.nameKey) ?? new Map<string, number>();
    donor.set(key, (donor.get(key) ?? 0) + 1);
    byDonor.set(row.nameKey, donor);
  }
  let habituales = 0;
  let deClip = 0;
  let deRelato = 0;
  for (const counts of byDonor.values()) {
    let total = 0;
    for (const count of counts.values()) total += count;
    if (total < 20) continue;
    habituales += 1;
    const clip = counts.get("clip") ?? 0;
    const relato = counts.get("relato") ?? 0;
    if (clip / total >= 0.55) deClip += 1;
    else if (relato / total >= 0.55) deRelato += 1;
  }
  const order = ["clip", "relato", "saludo", "aliento", "risa", "pregunta", "corto", "barra", "politica"];
  return {
    rows: order
      .filter((key) => buckets.has(key))
      .map((key) => {
        const bucket = buckets.get(key)!;
        return {
          key,
          label: BEHAVIOR_LABELS.get(key) ?? key,
          count: bucket.count,
          share: open > 0 ? bucket.count / open : 0,
          usdShare: openUsd > 0 ? bucket.usd / openUsd : 0,
          avgArs: bucket.count > 0 ? bucket.ars / bucket.count : 0,
        };
      }),
    habituales,
    deClip,
    deRelato,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HANDLE_STOP = new Set([
  "milei",
  "lucas",
  "martin",
  "gabriel",
  "pablo",
  "diego",
  "discord",
  "perro",
  "mariano",
  "dante",
  "carlos",
  "andres",
  "palan",
  "palandri",
  "juan",
  "alberto",
  "adorni",
  "caputo",
]);

function mine(rows: IndexedDonation[], profiles: DonorProfile[], totalArs: number, totalUsd: number, counted: number): Mining {
  const amounts: number[] = [];
  const modes = new Map<number, number>();
  const rates = new Map<number, number>();
  let roundHundreds = 0;
  let rated = 0;
  let ladder = 0;
  let smallCount = 0;
  let smallUsd = 0;
  let largeCount = 0;
  let largeUsd = 0;
  let rowUsd = 0;
  for (const row of rows) {
    if (row.devuelta) continue;
    amounts.push(row.monto_ars);
    const key = Math.round(row.monto_ars);
    modes.set(key, (modes.get(key) ?? 0) + 1);
    if (Math.round(row.monto_ars * 100) % 10000 === 0) roundHundreds += 1;
    if (key === 100 || key === 200 || key === 500 || key === 1000) ladder += 1;
    rowUsd += row.monto_usd;
    if (row.monto_ars <= 200) {
      smallCount += 1;
      smallUsd += row.monto_usd;
    }
    if (row.monto_ars >= 5000) {
      largeCount += 1;
      largeUsd += row.monto_usd;
    }
    if (row.monto_usd > 0) {
      const rate = Math.round(row.monto_ars / row.monto_usd);
      rates.set(rate, (rates.get(rate) ?? 0) + 1);
      rated += 1;
    }
  }
  amounts.sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  const medianArs =
    amounts.length === 0
      ? 0
      : amounts.length % 2 === 1
        ? amounts[mid]
        : (amounts[mid - 1] + amounts[mid]) / 2;

  let modeArs = 0;
  let modeCount = 0;
  for (const [amount, count] of modes) {
    if (count > modeCount || (count === modeCount && amount < modeArs)) {
      modeArs = amount;
      modeCount = count;
    }
  }

  let repeatDonors = 0;
  let repeatDonations = 0;
  let repeatUsd = 0;
  let onceDonors = 0;
  let onceUsd = 0;
  let rawNames = 0;
  let profileUsd = 0;
  let loyalDonors = 0;
  let loyalUsd = 0;
  for (const donor of profiles) {
    rawNames += donor.aliases.length;
    profileUsd += donor.usd;
    if (donor.count >= 10) {
      loyalDonors += 1;
      loyalUsd += donor.usd;
    }
    if (donor.count > 1) {
      repeatDonors += 1;
      repeatDonations += donor.count;
      repeatUsd += donor.usd;
    } else if (donor.count === 1) {
      onceDonors += 1;
      onceUsd += donor.usd;
    }
  }

  const byUsd = [...profiles].sort((a, b) => b.usd - a.usd);
  const shareOf = (fraction: number) => {
    const donors = Math.max(1, Math.round(profiles.length * fraction));
    let usd = 0;
    for (let i = 0; i < donors && i < byUsd.length; i += 1) usd += byUsd[i].usd;
    return { donors, usdShare: totalUsd > 0 ? usd / totalUsd : 0 };
  };
  const top = shareOf(0.01);
  const ten = byUsd.slice(0, Math.min(10, byUsd.length)).reduce((sum, donor) => sum + donor.usd, 0);

  let fxMode = 0;
  let fxModeCount = 0;
  for (const [rate, count] of rates) {
    if (count > fxModeCount || (count === fxModeCount && rate < fxMode)) {
      fxMode = rate;
      fxModeCount = count;
    }
  }
  const usdBase = profileUsd > 0 ? profileUsd : totalUsd;
  const reach = (share: number) => {
    let acc = 0;
    let donors = 0;
    for (const donor of byUsd) {
      acc += donor.usd;
      donors += 1;
      if (usdBase <= 0 || acc >= usdBase * share) break;
    }
    return donors;
  };

  return {
    medianArs,
    meanArs: counted > 0 ? totalArs / counted : 0,
    repeatDonors,
    repeatDonorShare: profiles.length > 0 ? repeatDonors / profiles.length : 0,
    repeatDonationShare: counted > 0 ? repeatDonations / counted : 0,
    topPercentCount: top.donors,
    topPercentUsdShare: top.usdShare,
    top10UsdShare: totalUsd > 0 ? ten / totalUsd : 0,
    rawNames,
    modeArs,
    modeCount,
    onceDonorShare: profiles.length > 0 ? onceDonors / profiles.length : 0,
    onceUsdShare: usdBase > 0 ? onceUsd / usdBase : 0,
    repeatUsdShare: usdBase > 0 ? repeatUsd / usdBase : 0,
    roundHundredShare: counted > 0 ? roundHundreds / counted : 0,
    fxMode,
    fxModeShare: rated > 0 ? fxModeCount / rated : 0,
    halfUsdDonors: reach(0.5),
    eightyUsdDonors: reach(0.8),
    ladderShare: counted > 0 ? ladder / counted : 0,
    smallCountShare: counted > 0 ? smallCount / counted : 0,
    smallUsdShare: rowUsd > 0 ? smallUsd / rowUsd : 0,
    largeCountShare: counted > 0 ? largeCount / counted : 0,
    largeUsdShare: rowUsd > 0 ? largeUsd / rowUsd : 0,
    loyalDonors,
    loyalDonorShare: profiles.length > 0 ? loyalDonors / profiles.length : 0,
    loyalUsdShare: usdBase > 0 ? loyalUsd / usdBase : 0,
    pareto: [
      { label: "1%", ...shareOf(0.01) },
      { label: "5%", ...shareOf(0.05) },
      { label: "10%", ...shareOf(0.1) },
      { label: "25%", ...shareOf(0.25) },
      { label: "50%", ...shareOf(0.5) },
    ].map(({ label, donors, usdShare }) => ({ label, donors, usdShare })),
  };
}

function ensure() {
  if (!cache) cache = build();
  return cache;
}

function select(filters: Filters) {
  const { rows } = ensure();
  const q = fold(filters.q);
  const donor = canonicalKey(fold(filters.donor));
  let matched = rows.filter((row) => {
    if (donor && row.nameKey !== donor) return false;
    if (q && !row.haystack.includes(q)) return false;
    if (filters.min !== null && row.monto_ars < filters.min) return false;
    return true;
  });
  if (filters.sort === "antigua") matched = [...matched].reverse();
  else if (filters.sort === "mayor") {
    matched = [...matched].sort((a, b) => b.monto_ars - a.monto_ars || b.id - a.id);
  } else if (filters.sort === "menor") {
    matched = [...matched].sort((a, b) => a.monto_ars - b.monto_ars || b.id - a.id);
  }
  return matched;
}

function paginate(filters: Filters): PageResult {
  const matched = select(filters);
  const total = matched.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const start = (page - 1) * PAGE_SIZE;
  return {
    total,
    pages,
    page,
    rows: matched.slice(start, start + PAGE_SIZE).map(toPublic),
  };
}

export function questionContext(question: string) {
  const { meta, donors, rows } = ensure();
  const tokens = fold(question)
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 4)
    .slice(0, 8);
  const matched = [];
  if (tokens.length > 0) {
    for (const donor of donors.values()) {
      const hay = fold(`${donor.nombre} ${donor.aliases.join(" ")}`);
      if (!tokens.some((token) => hay.includes(token))) continue;
      matched.push({
        nombre: donor.nombre,
        aportes: donor.count,
        pesos: donor.ars,
        dolares: donor.usd,
        regalosUsd: donor.giftUsd,
      });
      if (matched.length >= 6) break;
    }
  }
  const muestras = [];
  if (tokens.length > 0) {
    for (const row of rows) {
      if (row.devuelta) continue;
      if (!tokens.some((token) => row.haystack.includes(token))) continue;
      muestras.push({
        nombre: row.nombre,
        mensaje: row.privado ? "(privado)" : row.mensaje.slice(0, 140),
        pesos: row.monto_ars,
        dolares: row.monto_usd,
        cuando: row.fecha_relativa,
      });
      if (muestras.length >= 6) break;
    }
  }
  return {
    aportes: meta.count,
    donantes: meta.donorCount,
    totalPesos: meta.totalArs,
    totalDolares: meta.totalUsd,
    hallazgos: meta.mining,
    periodos: meta.periods.map((point) => ({
      cuando: point.label,
      aportes: point.count,
      pesos: point.ars,
      dolares: point.usd,
    })),
    quienMasAporto: meta.topByUsd.slice(0, 8).map((row) => ({
      nombre: row.nombre,
      aportes: row.count,
      pesos: row.ars,
      dolares: row.usd,
      regalosUsd: row.giftUsd ?? 0,
    })),
    quienMasVeces: meta.topByCount.slice(0, 8).map((row) => ({
      nombre: row.nombre,
      aportes: row.count,
      dolares: row.usd,
    })),
    palabras: meta.words.slice(0, 12).map((word) => ({ palabra: word.label, veces: word.count })),
    chat: meta.chat,
    conducta: meta.conducta.rows.map((row) => ({
      conducta: row.label,
      textos: row.count,
      parteDeLosTextos: row.share,
      parteDelMonto: row.usdShare,
      promedioPesos: row.avgArs,
    })),
    youtube: {
      mensajes: meta.youtubeMessages,
      links: meta.youtubeLinks,
      linksRevisados: meta.linkTotal,
      watch: meta.youtubeWatch,
      enlaceCorto: meta.youtubeShortlink,
      shorts: meta.youtubeShorts,
      directos: meta.youtubeLive,
      videosDistintos: meta.youtubeUnique,
      unaSolaVez: meta.youtubeOnce,
      masRepetidos: meta.videos.map((video) => ({
        titulo: video.title || video.id,
        canal: video.author,
        veces: video.count,
        dolaresAsociados: video.usd,
        donantes: video.donors,
        url: video.href,
      })),
    },
    palancoins: POINT_BOARD.map((row) => ({ nombre: row.name, puntos: row.points })),
    regalosKick: KICK_GIFTS.map((row) => ({
      nombre: row.name,
      cantidad: row.gifts,
      dolares: row.gifts * GIFT_USD,
      enElArchivo: row.archiveName,
    })),
    notas: [
      "raffsody y soylucastomasi son la misma persona.",
      "El monto en pesos de un donante es la suma de sus aportes en pesos, sin las devoluciones.",
      "El monto en dólares es la suma de los dólares de Ceneka más 5 dólares por cada regalo de Kick si el nombre coincide.",
      "Los palancoins no son pesos ni dólares.",
      "Los totales de pesos y dólares no se muestran en la franja de arriba; sí se pueden responder si preguntan.",
    ],
    donantesMencionados: matched,
    filas: muestras,
  };
}

export function homePayload(filters: Filters) {
  const result = paginate(filters);
  const meta = ensure().meta;
  return {
    meta: { ...meta, totalArs: 0, totalUsd: 0, mining: { ...meta.mining, meanArs: 0 } },
    result,
    filters: { ...filters, page: result.page },
  };
}

export function donorPayload(name: string, filters: Filters) {
  const donor = ensure().donors.get(canonicalKey(fold(readDonorName(name)))) ?? null;
  if (!donor) return { found: false as const };
  const scoped = { ...filters, donor: donor.nombre };
  const result = paginate(scoped);
  return {
    found: true as const,
    donor,
    result,
    filters: { ...scoped, page: result.page },
  };
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportCsv(url: URL) {
  const filters = parseFilters(Object.fromEntries(url.searchParams.entries()));
  const rows = select(filters).map(toPublic);
  const header = [
    "id",
    "nombre",
    "mensaje",
    "monto_ars",
    "monto_usd",
    "privado",
    "devuelta",
    "devolucion",
    "fecha_relativa",
    "fecha_aprox",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        csvCell(row.nombre),
        csvCell(row.mensaje),
        row.monto_ars,
        row.monto_usd,
        row.privado ? "si" : "no",
        row.devuelta ? "si" : "no",
        csvCell(row.devolucion ?? ""),
        csvCell(row.fecha_relativa),
        csvCell(row.fecha_aprox ?? ""),
      ].join(","),
    );
  }
  const body = `\uFEFF${lines.join("\n")}\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="donaciones-losherederosdealberdi.csv"',
      "Cache-Control": "no-store",
    },
  });
}
