import { Link } from "@tanstack/react-router";
import { Badge, Card } from "@/components/ui";
import { formatAliases, type ArchiveMeta, type DonorStat, type WordTerm } from "@/lib/archive";
import { DISCORD_HREF, KICK_GIFTS, POINT_BOARD } from "@/lib/chat-board";
import { formatArs, formatCount, formatPct, formatScraped, formatUsd } from "@/lib/format";
import type { KickChannel } from "@/lib/kick";
import type { PodcastVideo } from "@/lib/podcast";

export function ArchiveSummary({ meta }: { meta: ArchiveMeta }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Donaciones"
        value={formatCount(meta.count)}
        detail="Las que quedaron en el listado"
      />
      <Stat
        label="En pesos"
        value={formatArs(meta.totalArs)}
        detail="Suma de los aportes públicos"
      />
      <Stat
        label="Equivalente en dólares"
        value={formatUsd(meta.totalUsd)}
        detail="Equivalente interno de Ceneka"
      />
      <Stat
        label="Donantes"
        value={formatCount(meta.donorCount)}
        detail={`${formatCount(meta.privateCount)} con mensaje privado`}
      />
    </section>
  );
}

export function MiningReport({ meta }: { meta: ArchiveMeta }) {
  const mining = meta.mining;
  const peak = Math.max(...mining.pareto.map((step) => step.usdShare), 0.01);

  return (
    <section id="hallazgos" className="space-y-4">
      <SectionHead
        kicker="Minería"
        title="Qué se lee en los datos"
        text="Nombres unificados y cuánto pesa quien más aporta."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Finding
          kicker="Concentración"
          value={formatPct(mining.topPercentUsdShare)}
          text={`El 1% de los donantes —${formatCount(mining.topPercentCount)} personas— concentra ese equivalente en dólares. Los 10 primeros llegan a ${formatPct(mining.top10UsdShare)}.`}
        />
        <Finding
          kicker="Cola larga"
          value={formatArs(mining.medianArs)}
          text={`Esa es la mediana. El promedio sube a ${formatArs(mining.meanArs)} porque unos pocos montos altos estiran la cuenta.`}
        />
        <Finding
          kicker="Vuelven"
          value={formatPct(mining.repeatDonorShare)}
          text={`${formatCount(mining.repeatDonors)} donantes aportaron más de una vez y explican ${formatPct(mining.repeatDonationShare)} de las donaciones.`}
        />
        <Finding
          kicker="La misma persona"
          value={formatCount(meta.donorCount)}
          text={`${formatCount(mining.rawNames)} grafías se pliegan en ese total: mayúsculas y acentos no parten a nadie. El monto que más se repite es ${formatArs(mining.modeArs)} (${formatCount(mining.modeCount)} veces).`}
        />
      </div>
      <Card>
        <header className="space-y-1 px-5 pt-5">
          <h2 className="text-xl tracking-tight">Cuánto aporta cada franja</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Donantes ordenados de mayor a menor equivalente en dólares. La barra es su parte del total.
          </p>
        </header>
        <div className="space-y-3 px-5 py-5">
          {mining.pareto.map((step) => (
            <div key={step.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {step.label} · {formatCount(step.donors)} donantes
                </span>
                <span className="font-medium tabular-nums">{formatPct(step.usdShare)}</span>
              </div>
              <span className="block h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (step.usdShare / peak) * 100)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function SectionHead({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="max-w-2xl space-y-2">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">{kicker}</p>
      <h2 className="text-3xl tracking-tight">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function Finding({ kicker, value, text }: { kicker: string; value: string; text: string }) {
  return (
    <Card>
      <div className="space-y-2 px-5 py-5">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{kicker}</p>
        <p className="font-heading text-3xl tracking-tight tabular-nums">{value}</p>
        <p className="text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </Card>
  );
}

export function RefundNote({ meta }: { meta: ArchiveMeta }) {
  if (meta.refundedCount === 0) return null;
  return (
    <Card>
      <header className="space-y-1 px-5 pt-5">
        <h2 className="text-xl tracking-tight">Devoluciones descontadas</h2>
        <p className="text-sm leading-6 text-muted-foreground">{meta.refundNote}</p>
      </header>
      <div className="space-y-4 px-5 py-5">
        <p className="text-sm text-muted-foreground">
          {formatCount(meta.refundedCount)} aportes · {formatArs(meta.refundedArs)} · {formatUsd(meta.refundedUsd)}.
          Siguen en el listado de Ceneka, con la etiqueta «Devuelta», y no entran en totales ni rankings.
        </p>
        <ul className="divide-y divide-border overflow-hidden rounded-xl ring-1 ring-foreground/10">
          {meta.refunds.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/donante/$nombre"
                    params={{ nombre: row.nombre }}
                    className="font-medium hover:text-primary"
                  >
                    {row.nombre}
                  </Link>
                  <Badge tone="danger">Devuelta</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.devolucion}</p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="font-heading text-lg leading-none line-through decoration-foreground/40">
                  {formatArs(row.monto_ars)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground line-through">{formatUsd(row.monto_usd)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function PeriodChart({ meta }: { meta: ArchiveMeta }) {
  const peak = Math.max(...meta.periods.map((point) => point.count), 1);
  const busiest = meta.periods.reduce(
    (best, point) => (point.count > best.count ? point : best),
    meta.periods[0],
  );
  return (
    <Card>
      <header className="space-y-1 px-5 pt-5">
        <h2 className="text-xl tracking-tight">Cuándo llegaron</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Agrupadas por el texto que publicó Ceneka, no por una fecha exacta.
        </p>
      </header>
      <div className="space-y-3 px-5 py-5">
        {meta.periods.map((point) => (
          <div key={point.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">{point.label}</span>
            <span className="text-right">
              <span className="block font-medium tabular-nums">{formatCount(point.count)}</span>
              <span className="block text-xs text-muted-foreground">{formatUsd(point.usd)}</span>
            </span>
            <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (point.count / peak) * 100)}%` }}
              />
            </span>
          </div>
        ))}
        {busiest ? (
          <p className="pt-1 text-xs text-muted-foreground">
            El tramo más alto es «{busiest.label}»: {formatCount(busiest.count)} aportes · {formatArs(busiest.ars)}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function sizeFor(count: number, min: number, max: number) {
  if (max <= min) return 1.1;
  const t = (Math.log(count) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return 0.85 + t * 1.85;
}

function scatter(words: WordTerm[]) {
  return [...words].sort((a, b) => {
    const ha = a.key.length + a.key.charCodeAt(0) + a.count;
    const hb = b.key.length + b.key.charCodeAt(0) + b.count;
    return (ha % 7) - (hb % 7) || b.count - a.count;
  });
}

export function WordCloud({ meta }: { meta: ArchiveMeta }) {
  const ranked = meta.words;
  if (ranked.length === 0) {
    return (
      <Card>
        <header className="space-y-1 px-5 py-5">
          <h2 className="text-xl tracking-tight">Nube de palabras</h2>
          <p className="text-sm text-muted-foreground">No hay mensajes públicos para armar la nube.</p>
        </header>
      </Card>
    );
  }
  const min = ranked[ranked.length - 1]?.count ?? 1;
  const max = ranked[0]?.count ?? 1;
  const words = scatter(ranked);
  return (
    <Card>
      <header className="space-y-1 px-5 pt-5">
        <h2 className="text-xl tracking-tight">Nube de palabras</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Lo que más se repite en los mensajes. Mayúsculas y acentos cuentan juntas. Un clic filtra el listado.
        </p>
      </header>
      <div className="px-5 py-5">
        <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2 text-center">
          {words.map((word) => (
            <li key={word.key}>
              <Link
                to="/"
                search={{ q: word.label }}
                title={`${formatCount(word.count)} veces`}
                className="inline-block font-heading leading-none text-foreground/80 transition-colors hover:text-primary"
                style={{ fontSize: `${sizeFor(word.count, min, max)}rem` }}
              >
                {word.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="pt-3 text-center text-xs text-muted-foreground">
          Lo más repetido es «{ranked[0].label}»: {formatCount(ranked[0].count)} veces. El tamaño sigue esa
          frecuencia.
        </p>
      </div>
    </Card>
  );
}

export function ArchiveDetails({ meta }: { meta: ArchiveMeta }) {
  const peak = Math.max(...meta.brackets.map((bracket) => bracket.count), 1);
  return (
    <section className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <header className="space-y-1 px-5 pt-5">
            <h2 className="text-xl tracking-tight">Por tamaño del aporte</h2>
            <p className="text-sm text-muted-foreground">Cada donación, según el monto en pesos.</p>
          </header>
          <div className="space-y-3 px-5 py-5">
            {meta.brackets.map((bracket) => (
              <div key={bracket.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{bracket.label}</span>
                  <span className="tabular-nums font-medium">{formatCount(bracket.count)}</span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (bracket.count / peak) * 100)}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <header className="space-y-1 px-5 pt-5">
            <h2 className="text-xl tracking-tight">Cómo leer las fechas</h2>
            <p className="text-sm text-muted-foreground">Descarga del {formatScraped(meta.scrapedAt)}.</p>
          </header>
          <div className="space-y-3 px-5 py-5 text-sm leading-6 text-muted-foreground">
            <p>
              Ceneka no publica la fecha exacta. Devuelve textos como «Hace 5 horas» o «Hace 8 meses». La fecha
              estimada de cada fila sale de ese texto en el momento de la descarga: un mes cuenta como 30 días y
              un año como 365.
            </p>
            <p>
              El propio canal lo llama «superchats devaluados en pesos» y manda a esta descarga. Dos aportes de
              alrededor de 450 mil y 500 mil pesos se devolvieron: eran unos 300 dólares donados por error, no 300
              pesos. Ceneka no los borra; acá no entran en los totales.
            </p>
            <p>
              Fuente:{" "}
              <a
                href={meta.source}
                className="font-medium text-primary underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {meta.source.replace("https://", "")}
              </a>
            </p>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DonorBoard
          title="Quién más aportó"
          description="Suma del equivalente en dólares."
          rows={meta.topByUsd}
          metric={(row) => formatUsd(row.usd)}
          extra={(row) => `${formatCount(row.count)} donaciones · ${formatArs(row.ars)}`}
        />
        <DonorBoard
          title="Quién donó más veces"
          description="Cantidad de aportes, sin importar el monto."
          rows={meta.topByCount}
          metric={(row) => formatCount(row.count)}
          extra={(row) => `${formatArs(row.ars)} · ${formatUsd(row.usd)}`}
        />
      </div>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="space-y-2 px-5 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl leading-none tracking-tight tabular-nums sm:text-3xl">{value}</p>
        <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </Card>
  );
}

function RankTable({
  title,
  text,
  unit,
  rows,
}: {
  title: string;
  text: string;
  unit: string;
  rows: { name: string; value: number; archiveName: string | null; note?: string }[];
}) {
  return (
    <Card>
      <header className="space-y-1 px-5 pt-5 pb-3">
        <h2 className="text-xl tracking-tight">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{text}</p>
      </header>
      <ol>
        {rows.map((row, index) => {
          const body = (
            <>
              <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.name}</span>
                {row.note ? (
                  <span className="block truncate text-xs text-muted-foreground">{row.note}</span>
                ) : (
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.archiveName ? "Tiene ficha en el archivo" : "No está en la descarga"}
                  </span>
                )}
              </span>
              <span className="text-right text-sm font-medium tabular-nums">
                {formatCount(row.value)}
                <span className="block text-xs font-normal text-muted-foreground">{unit}</span>
              </span>
            </>
          );
          return (
            <li key={row.name} className="border-t border-border/80">
              {row.archiveName ? (
                <Link
                  to="/donante/$nombre"
                  params={{ nombre: row.archiveName }}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 hover:bg-muted/70"
                >
                  {body}
                </Link>
              ) : (
                <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function LedgerBoards() {
  return (
    <section id="cuentas" className="scroll-mt-6 space-y-4">
      <div className="max-w-2xl space-y-2">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">Otras cuentas</p>
        <h2 className="text-3xl tracking-tight">No se mezclan con los pesos</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          El chat publica dos rankings aparte. Los palancoins son los puntos de Streamlabs. En Kick, el número es de
          suscripciones regaladas. Ninguno entra en los totales de Ceneka.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RankTable
          title="Palancoins"
          text="Streamlabs los muestra como «principales por puntos». De estos diez, cuatro tienen ficha."
          unit="palancoins"
          rows={POINT_BOARD.map((row) => ({
            name: row.name,
            value: row.points,
            archiveName: row.archiveName,
            note: row.note,
          }))}
        />
        <RankTable
          title="Regalos en Kick"
          text="Suscripciones regaladas en el canal. raffsody es soylucastomasi."
          unit="regalos"
          rows={KICK_GIFTS.map((row) => ({
            name: row.name,
            value: row.gifts,
            archiveName: row.archiveName,
            note: row.note,
          }))}
        />
      </div>
    </section>
  );
}

function DonorBoard({
  title,
  description,
  rows,
  metric,
  extra,
}: {
  title: string;
  description: string;
  rows: DonorStat[];
  metric: (row: DonorStat) => string;
  extra: (row: DonorStat) => string;
}) {
  return (
    <Card>
      <header className="space-y-1 px-5 pt-5 pb-3">
        <h2 className="text-xl tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <ol>
        {rows.map((row, index) => (
          <li key={row.nombre} className="border-t border-border/80">
            <Link
              to="/donante/$nombre"
              params={{ nombre: row.nombre }}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 hover:bg-muted/70"
            >
              <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.nombre}</span>
                {row.aliases.length > 1 ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatAliases(row.aliases, row.nombre)}
                  </span>
                ) : null}
                <span className="block truncate text-xs text-muted-foreground">{extra(row)}</span>
              </span>
              <Badge>{metric(row)}</Badge>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function KickBanner({ kick }: { kick: KickChannel }) {
  if (!kick.live) return null;
  return (
    <a
      href={kick.href}
      target="_blank"
      rel="noreferrer"
      className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm hover:bg-muted/60"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
      </span>
      <span className="min-w-0">
        <span className="font-medium">En vivo en Kick</span>
        <span className="text-muted-foreground">
          {" "}
          · {kick.title ?? kick.username}
          {kick.viewers > 0 ? ` · ${formatCount(kick.viewers)} mirando` : ""}
        </span>
      </span>
    </a>
  );
}

export function PodcastShelf({ videos, kick }: { videos: PodcastVideo[]; kick: KickChannel }) {
  return (
    <section id="podcast" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">Canales</p>
          <h2 className="text-3xl tracking-tight">Dónde están en el aire</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            El stream en{" "}
            <a href={kick.href} className="font-medium text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
              kick.com/{kick.username}
            </a>{" "}
            y los programas en{" "}
            <a
              href="https://www.youtube.com/@lhdapodcast"
              className="font-medium text-primary underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              youtube.com/@lhdapodcast
            </a>
            . La comunidad está en{" "}
            <a href={DISCORD_HREF} className="font-medium text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
              Discord
            </a>
            .
          </p>
        </div>
      </div>
      <a
        href={kick.href}
        target="_blank"
        rel="noreferrer"
        className="grid overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted/50 sm:grid-cols-[16rem_1fr]"
      >
        {kick.thumbnail ? (
          <img src={kick.thumbnail} alt="" width={640} height={360} className="aspect-video w-full bg-muted object-cover" />
        ) : (
          <span className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">Kick</span>
        )}
        <span className="flex flex-col justify-center gap-2 px-5 py-4">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase">
            {kick.live ? (
              <span className="text-destructive">En vivo</span>
            ) : (
              <span className="text-muted-foreground">Fuera de línea</span>
            )}
            {kick.category ? <span className="text-muted-foreground">{kick.category}</span> : null}
          </span>
          <span className="text-lg leading-6 font-medium tracking-tight">
            {kick.live ? (kick.title ?? "Están en vivo") : "Los Herederos de Alberdi"}
          </span>
          <span className="text-sm text-muted-foreground">
            kick.com/{kick.username}
            {kick.followers > 0 ? ` · ${formatCount(kick.followers)} seguidores` : ""}
            {kick.live && kick.viewers > 0 ? ` · ${formatCount(kick.viewers)} mirando` : ""}
          </span>
        </span>
      </a>
      {videos.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {videos.map((video) => (
            <li key={video.id}>
              <a
                href={video.href}
                target="_blank"
                rel="noreferrer"
                className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-muted/50"
              >
                <img
                  src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                  alt=""
                  width={480}
                  height={360}
                  className="aspect-video w-full bg-muted object-cover"
                />
                <span className="flex flex-1 flex-col gap-1 px-4 py-3">
                  <span className="line-clamp-2 text-sm leading-5 font-medium">{video.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatScraped(video.published)}
                    {video.views > 0 ? ` · ${formatCount(video.views)} vistas` : ""}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function SiteFooter({ source }: { source: string }) {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Archivo público de Los Herederos de Alberdi.</p>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={DISCORD_HREF}
            className="font-medium text-primary underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>
          <a
            href="https://kick.com/losherederosdealberdi"
            className="font-medium text-primary underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            kick.com/losherederosdealberdi
          </a>
          <a
            href="https://www.youtube.com/@lhdapodcast"
            className="font-medium text-primary underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            youtube.com/@lhdapodcast
          </a>
          <a href={source} className="font-medium text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
            {source.replace("https://", "")}
          </a>
        </span>
      </div>
    </footer>
  );
}
