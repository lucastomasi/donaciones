import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { SiteFooter } from "@/components/archive-view";
import { BrowserSkeleton, DonationBrowser } from "@/components/donation-browser";
import { Badge, Card } from "@/components/ui";
import { EMPTY_SEARCH, parseListSearch, toFilters, type ListSearch } from "@/lib/archive";
import { getDonorPage } from "@/lib/archive.functions";
import { KICK_GIFTS, POINT_BOARD, GIFT_USD } from "@/lib/chat-board";
import { formatArs, formatCount, formatUsd, formatWhen } from "@/lib/format";
import { KICK_HANDLES } from "@/lib/identities";

export const Route = createFileRoute("/donante/$nombre")({
  validateSearch: (search: Record<string, unknown>): ListSearch => parseListSearch(search),
  search: {
    middlewares: [stripSearchParams<ListSearch>(EMPTY_SEARCH)],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => getDonorPage({ data: { name: params.nombre, filters: toFilters(deps, "") } }),
  pendingComponent: DonorPending,
  pendingMs: 180,
  component: DonorPage,
});

function DonorPage() {
  const data = Route.useLoaderData();
  if (!data.found) return <MissingDonor />;
  const { donor, result, filters } = data;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/80 bg-card/70">
        <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
          <Link to="/" className="text-sm text-primary underline-offset-2 hover:underline">
            ← Todas las donaciones
          </Link>
          <p className="mt-5 text-xs font-semibold tracking-widest text-primary uppercase">Ficha del donante</p>
          <h1 className="mt-3 max-w-3xl text-4xl tracking-tight text-balance sm:text-5xl">{donor.nombre}</h1>
          {donor.aliases.length > 1 ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              También {donor.aliases.filter((name) => name !== donor.nombre).join(" · ")}. Las{" "}
              {formatCount(donor.aliases.length)} formas se suman en un solo total.
            </p>
          ) : null}
          {KICK_HANDLES[donor.nameKey] ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              En Kick es {KICK_HANDLES[donor.nameKey]}. Es la misma persona: los aportes bajo ese nombre se suman en
              este total.
            </p>
          ) : null}
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            {formatCount(donor.count)} aportes públicos · {formatArs(donor.ars)} · {formatUsd(donor.usd)}
          </p>
          <DonorSideNotes nameKey={donor.nameKey} />
          {donor.refundedCount > 0 ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {donor.refundedCount === 1
                ? "Se descontó 1 devolución por confusión de moneda: "
                : `Se descontaron ${formatCount(donor.refundedCount)} devoluciones por confusión de moneda: `}
              {formatArs(donor.refundedArs)} · {formatUsd(donor.refundedUsd)}. Ceneka las sigue listando; acá no suman.
            </p>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 py-8 md:py-10">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Donaciones" value={formatCount(donor.count)} />
          <MiniStat label="En pesos" value={formatArs(donor.ars)} />
          <MiniStat label="En dólares" value={formatUsd(donor.usd)} />
          <MiniStat
            label="Promedio"
            value={donor.count === 0 ? "—" : formatUsd(donor.usd / donor.count)}
            detail={donor.count === 0 ? "Sin aportes que sumen" : `${formatArs(donor.ars / donor.count)} por aporte`}
          />
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          <Highlight
            label="Primera en el archivo"
            name={donor.first.fecha_relativa}
            detail={formatWhen(donor.first.fecha_aprox)}
            amount={formatArs(donor.first.monto_ars)}
          />
          <Highlight
            label="Última en el archivo"
            name={donor.last.fecha_relativa}
            detail={formatWhen(donor.last.fecha_aprox)}
            amount={formatArs(donor.last.monto_ars)}
          />
          <Highlight
            label="La más grande"
            name={donor.biggest.fecha_relativa}
            detail={donor.biggest.privado ? "Mensaje privado" : donor.biggest.mensaje.slice(0, 90)}
            amount={formatArs(donor.biggest.monto_ars)}
          />
        </section>
        <DonationBrowser filters={filters} result={result} mode="donor" donorName={donor.nombre} />
      </main>
      <SiteFooter source="https://ceneka.net/losherederosdealberdi" />
    </div>
  );
}

function DonorSideNotes({ nameKey }: { nameKey: string }) {
  const points = POINT_BOARD.find((row) => sameDonor(row.archiveName, nameKey));
  const gifts = KICK_GIFTS.find((row) => sameDonor(row.archiveName, nameKey));
  if (!points && !gifts) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {points ? <li><Badge>{formatCount(points.points)} palancoins</Badge></li> : null}
      {gifts ? (
        <li>
          <Badge>
            {formatCount(gifts.gifts)} regalos · {formatUsd(gifts.gifts * GIFT_USD)}
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}

function sameDonor(archiveName: string | null, nameKey: string) {
  if (!archiveName) return false;
  return archiveName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() === nameKey;
}

function MissingDonor() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-24 text-center">
      <p className="text-xs font-semibold tracking-widest text-primary uppercase">Archivo</p>
      <h1 className="mt-3 text-4xl">Ese donante no está</h1>
      <p className="mt-3 text-muted-foreground">No hay donaciones públicas con ese nombre en el archivo.</p>
      <Link to="/" className="mt-6 text-primary underline-offset-2 hover:underline">
        Volver al listado
      </Link>
    </main>
  );
}

function DonorPending() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-12 w-72 max-w-full animate-pulse rounded bg-muted" />
      <div className="mt-8">
        <BrowserSkeleton />
      </div>
    </main>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <div className="space-y-1 px-5 py-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl tracking-tight">{value}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </Card>
  );
}

function Highlight({
  label,
  name,
  detail,
  amount,
}: {
  label: string;
  name: string;
  detail: string;
  amount: string;
}) {
  return (
    <Card>
      <div className="space-y-3 px-5 py-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg leading-snug">{name}</h2>
          <Badge>{amount}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{detail || "Sin mensaje"}</p>
      </div>
    </Card>
  );
}

