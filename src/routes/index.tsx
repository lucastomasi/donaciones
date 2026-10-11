import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { DonationBrowser } from "@/components/donation-browser";
import { POINT_BOARD, KICK_GIFTS, GIFT_USD } from "@/lib/chat-board";
import { EMPTY_SEARCH, parseListSearch, toFilters, type ListSearch } from "@/lib/archive";
import { getArchivePage, getKick, getPodcast } from "@/lib/archive.functions";
import { formatArs, formatCount, formatPct, formatUsd } from "@/lib/format";
import type { KickChannel } from "@/lib/kick";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): ListSearch => parseListSearch(search),
  search: {
    middlewares: [stripSearchParams<ListSearch>(EMPTY_SEARCH)],
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, podcast, kick] = await Promise.all([
      getArchivePage({ data: toFilters(deps) }),
      getPodcast(),
      getKick(),
    ]);
    return { ...page, podcast, kick };
  },
  pendingComponent: HomePending,
  pendingMs: 180,
  component: Home,
});

function Home() {
  const { meta, result, filters, podcast, kick } = Route.useLoaderData();
  const mining = meta.mining;
  const peakPeriod = Math.max(...meta.periods.map((point) => point.count), 1);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-4 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-widest text-primary uppercase">Ceneka</p>
          <h1 className="truncate text-base leading-tight tracking-tight sm:text-lg">Los Herederos de Alberdi</h1>
        </div>
        <dl className="ml-auto flex shrink-0 gap-4">
          <Stat label="Aportes" value={formatCount(meta.count)} />
          <Stat label="Donantes" value={formatCount(meta.donorCount)} />
        </dl>
        <LivePill kick={kick} />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-2 p-2 lg:grid-cols-4 lg:grid-rows-2">
        <Panel title="Concentración">
          <ul>
            <Metric label="50% del monto" value={formatCount(mining.halfUsdDonors)} note="personas" />
            <Metric label="80% del monto" value={formatCount(mining.eightyUsdDonors)} note="personas" />
            <Metric label="Montos 100, 200, 500 y 1.000" value={formatPct(mining.ladderShare)} note="de los aportes" />
            <Metric label="Hasta $ 200" value={formatPct(mining.smallCountShare)} note={`${formatPct(mining.smallUsdShare)} del monto en US$`} />
            <Metric label="Desde $ 5.000" value={formatPct(mining.largeCountShare)} note={`${formatPct(mining.largeUsdShare)} del monto en US$`} />
            <Metric label="Recurrentes, 10 o más" value={formatPct(mining.loyalDonorShare)} note={`${formatPct(mining.loyalUsdShare)} del monto en US$`} />
            <Metric label="Mediana" value={formatArs(mining.medianArs)} note={`moda ${formatArs(mining.modeArs)}`} />
            <Metric label="Tipo de cambio modal" value={formatArs(mining.fxMode)} note={`${formatPct(mining.fxModeShare)} de las filas`} />
          </ul>
        </Panel>
        <Panel
          title="Conducta"
          hint="Cada mensaje entra en una sola categoría. Quien trae un link deja más. La política y la puteada, menos."
        >
          <ol className="space-y-1.5">
            {meta.conducta.rows.map((row) => (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{row.label}</span>
                  <span className="shrink-0 tabular-nums">{formatPct(row.usdShare)}</span>
                </div>
                <p className="text-[10px] leading-4 text-muted-foreground">
                  {row.key === "corto"
                    ? `${formatPct(row.share)} de los textos · el promedio lo estiran pocos montos grandes`
                    : `${formatPct(row.share)} de los textos · promedio ${formatArs(row.avgArs)}`}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            De {formatCount(meta.conducta.habituales)} que escriben seguido, {formatCount(meta.conducta.deClip)} se
            dedican a los clips y {formatCount(meta.conducta.deRelato)} a contar. Casi nadie vive de putear.
          </p>
        </Panel>
        <Panel title="Período">
          <ul className="space-y-1">
            {meta.periods.map((point) => (
              <li key={point.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{point.label}</span>
                <span className="tabular-nums">{formatCount(point.count)}</span>
                <span className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (point.count / peakPeriod) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Ranking por monto" hint="Nombres unificados sin distinguir mayúsculas ni acentos.">
          <ol className="space-y-1">
            {meta.topByUsd.slice(0, 8).map((row, index) => (
              <li key={row.nombre}>
                <Link
                  to="/donante/$nombre"
                  params={{ nombre: row.nombre }}
                  className="flex items-baseline justify-between gap-2 text-sm hover:text-primary"
                >
                  <span className="min-w-0 truncate">
                    <span className="mr-1.5 text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
                    {row.nombre}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {formatUsd(row.usd)}
                    {row.giftUsd ? (
                      <span className="text-[10px] text-muted-foreground"> +{formatUsd(row.giftUsd)}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="YouTube" hint="US$ asociado: suma de los aportes que incluyeron el video.">
          <p className="mb-1.5 text-[10px] leading-4 text-muted-foreground">
            {formatCount(meta.youtubeLinks)} de {formatCount(meta.linkTotal)} enlaces · {formatCount(meta.youtubeOnce)}{" "}
            de {formatCount(meta.youtubeUnique)} una sola vez
          </p>
          <ol className="space-y-1">
            {meta.videos.map((video) => (
              <li key={video.id}>
                <a
                  href={video.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-2 text-xs hover:text-primary"
                >
                  <span className="min-w-0 truncate">
                    {video.title || video.id}
                    {video.author ? <span className="text-muted-foreground"> · {video.author}</span> : null}
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                    <span className="block">{formatCount(video.count)}</span>
                    <span className="block text-[10px]">{formatUsd(video.usd)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Otras cuentas">
          <div className="flex h-full min-h-0 flex-col gap-2">
            {podcast[0] ? (
              <a href={podcast[0].href} target="_blank" rel="noreferrer" className="truncate text-xs text-primary">
                YouTube · {podcast[0].title}
              </a>
            ) : null}
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
              <MiniRank title="Palancoins" rows={POINT_BOARD.map((row) => ({ name: row.name, value: formatCount(row.points), href: row.archiveName }))} />
              <KickGiftRank />
            </div>
          </div>
        </Panel>
        <Panel title="Archivo" className="col-span-2" scroll={false}>
          <DonationBrowser filters={filters} result={result} mode="home" dense />
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-border pl-4 text-right">
      <dt className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="font-heading text-lg leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function LivePill({ kick }: { kick: KickChannel }) {
  return (
    <a href={kick.href} target="_blank" rel="noreferrer" className="flex max-w-36 shrink-0 items-center gap-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kick.live ? "bg-destructive" : "bg-muted-foreground/40"}`} />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-primary">{kick.live ? "En vivo" : "Kick"}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{kick.live ? kick.title : "kick.com"}</span>
      </span>
    </a>
  );
}

function Panel({
  title,
  hint,
  children,
  className = "",
  scroll = true,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 ${className}`}>
      <h2 className="shrink-0 border-b border-border/80 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</h2>
      {hint ? <p className="shrink-0 px-2.5 text-[10px] leading-4 text-muted-foreground">{hint}</p> : null}
      <div className={`min-h-0 flex-1 px-2.5 pt-1.5 pb-2 ${scroll ? "overflow-auto" : "overflow-hidden"}`}>{children}</div>
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2 border-b border-border/70 py-1 last:border-0">
      <p className="min-w-0 truncate text-xs text-muted-foreground">{label}</p>
      <p className="shrink-0 text-right">
        <span className="font-heading text-sm tabular-nums">{value}</span>
        <span className="ml-1.5 text-[10px] text-muted-foreground">{note}</span>
      </p>
    </li>
  );
}

function KickGiftRank() {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">Regalos Kick</p>
      <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_auto] gap-x-1 text-[10px] text-muted-foreground">
        <span>Usuario</span>
        <span className="text-right">N</span>
        <span className="text-right">US$</span>
      </div>
      <ol className="mt-0.5 space-y-0.5">
        {KICK_GIFTS.map((row) => {
          const dollars = formatUsd(row.gifts * GIFT_USD);
          const name = row.archiveName ? (
            <Link to="/donante/$nombre" params={{ nombre: row.archiveName }} className="truncate hover:text-primary">
              {row.name}
            </Link>
          ) : (
            <span className="truncate">{row.name}</span>
          );
          return (
            <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_1.25rem_auto] items-baseline gap-x-1 text-xs">
              {name}
              <span className="text-right tabular-nums">{formatCount(row.gifts)}</span>
              <span className="text-right tabular-nums">{dollars}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MiniRank({ title, rows }: { title: string; rows: { name: string; value: string; href: string | null }[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">{title}</p>
      <ol className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.name} className="flex items-baseline justify-between gap-1 text-xs">
            {row.href ? (
              <Link to="/donante/$nombre" params={{ nombre: row.href }} className="truncate hover:text-primary">
                {row.name}
              </Link>
            ) : (
              <span className="truncate">{row.name}</span>
            )}
            <span className="shrink-0 tabular-nums text-muted-foreground">{row.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HomePending() {
  return <main className="h-dvh animate-pulse bg-muted/40" />;
}
