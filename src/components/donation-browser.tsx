import { Link, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { MessageText } from "@/components/message-text";
import { Badge, buttonClass, fieldClass } from "@/components/ui";
import {
  PAGE_SIZE,
  donorHref,
  exportHref,
  filtersToSearch,
  type Donation,
  type Filters,
  type ListSearch,
  type PageResult,
} from "@/lib/archive";
import { formatArs, formatCount, formatUsd, formatWhen } from "@/lib/format";

export function DonationBrowser({
  filters,
  result,
  mode,
  donorName,
  dense = false,
}: {
  filters: Filters;
  result: PageResult;
  mode: "home" | "donor";
  donorName?: string;
  dense?: boolean;
}) {
  const navigate = useNavigate();
  const includeDonor = mode === "home";
  const action = mode === "donor" && donorName ? donorHref(donorName) : "/";
  const active = Boolean(filters.q || (includeDonor && filters.donor) || filters.min !== null || filters.sort !== "reciente");
  const from = result.total === 0 ? 0 : (result.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(result.page * PAGE_SIZE, result.total);

  function go(next: Partial<ListSearch>) {
    const search: ListSearch = {};
    const q = next.q ?? "";
    const donor = includeDonor ? (next.donor ?? "") : "";
    const sort = next.sort ?? "reciente";
    const page = next.page ?? 1;
    if (q) search.q = q;
    if (donor) search.donor = donor;
    if (sort !== "reciente") search.sort = sort;
    if (page > 1) search.page = page;
    if (next.min) search.min = next.min;
    if (mode === "donor" && donorName) {
      navigate({ to: "/donante/$nombre", params: { nombre: donorName }, search });
    } else {
      navigate({ to: "/", search });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const minRaw = String(data.get("min") ?? "").trim().replace(",", ".");
    const minNum = minRaw === "" ? null : Number(minRaw);
    const sort = String(data.get("sort") ?? "reciente");
    go({
      q: String(data.get("q") ?? "").trim(),
      donor: includeDonor ? filters.donor : "",
      sort: sort === "antigua" || sort === "mayor" || sort === "menor" ? sort : "reciente",
      min: minNum !== null && Number.isFinite(minNum) && minNum > 0 ? minNum : undefined,
      page: 1,
    });
  }

  return dense ? (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <form action={action} method="get" onSubmit={onSubmit} className="grid shrink-0 grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-1.5">
        <input name="q" defaultValue={filters.q} placeholder="Nombre o mensaje" className={`${fieldClass} h-8`} />
        <select
          name="sort"
          defaultValue={filters.sort}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className={`${fieldClass} h-8 px-2 text-xs`}
        >
          <option value="reciente">Recientes</option>
          <option value="antigua">Antiguas</option>
          <option value="mayor">Mayor</option>
          <option value="menor">Menor</option>
        </select>
        {filters.min !== null ? <input type="hidden" name="min" value={filters.min} /> : null}
        {includeDonor && filters.donor ? <input type="hidden" name="donor" value={filters.donor} /> : null}
        <button type="submit" className={buttonClass("primary", "h-8 px-3")}>
          Buscar
        </button>
      </form>
      <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="tabular-nums">{result.total === 0 ? "Sin resultados" : `${formatCount(result.total)} registros`}</p>
        <a href={exportHref(filters)} className="font-medium text-primary underline-offset-2 hover:underline">
          Exportar CSV
        </a>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto rounded-lg bg-background ring-1 ring-foreground/10">
        {result.rows.map((row) => (
          <li key={row.id} className="px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Link to="/donante/$nombre" params={{ nombre: row.nombre }} className="truncate text-sm font-medium hover:text-primary">
                {row.nombre}
              </Link>
              <Amount row={row} compact />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {row.privado ? "Mensaje privado" : row.mensaje || "Sin mensaje"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  ) : (
    <section className="space-y-4">
      <form
        action={action}
        method="get"
        onSubmit={onSubmit}
        className="grid gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 md:grid-cols-[minmax(0,1fr)_11rem_9rem_auto]"
      >
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Buscar nombre o mensaje
          <input name="q" defaultValue={filters.q} placeholder="messi, palan, un usuario…" className={fieldClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Orden
          <select name="sort" defaultValue={filters.sort} className={fieldClass}>
            <option value="reciente">Más recientes</option>
            <option value="antigua">Más antiguas</option>
            <option value="mayor">Mayor monto</option>
            <option value="menor">Menor monto</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Mínimo en pesos
          <input
            name="min"
            inputMode="decimal"
            defaultValue={filters.min ?? ""}
            placeholder="1000"
            className={fieldClass}
          />
        </label>
        {includeDonor && filters.donor ? <input type="hidden" name="donor" value={filters.donor} /> : null}
        <div className="flex items-end">
          <button type="submit" className={buttonClass("primary", "w-full md:w-auto")}>
            Filtrar
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p className="text-muted-foreground">
            {result.total === 0
              ? "Sin resultados"
              : `${formatCount(from)}–${formatCount(to)} de ${formatCount(result.total)}`}
          </p>
          {includeDonor && filters.donor ? (
            <Link to="/donante/$nombre" params={{ nombre: filters.donor }}>
              <Badge tone="outline">Donante: {filters.donor}</Badge>
            </Link>
          ) : null}
          {active ? (
            mode === "donor" && donorName ? (
              <Link
                to="/donante/$nombre"
                params={{ nombre: donorName }}
                className="text-primary underline-offset-2 hover:underline"
              >
                Limpiar filtros
              </Link>
            ) : (
              <Link to="/" className="text-primary underline-offset-2 hover:underline">
                Limpiar filtros
              </Link>
            )
          ) : null}
        </div>
        <a href={exportHref(filters)} className={buttonClass("outline")}>
          Descargar CSV ({formatCount(result.total)})
        </a>
      </div>

      {result.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl">Ninguna donación coincide</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Probá con otro nombre, sacá el mínimo o limpiá el donante seleccionado.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {result.rows.map((row) => (
              <li key={row.id} className="space-y-2 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/donante/$nombre"
                    params={{ nombre: row.nombre }}
                    className="font-medium hover:text-primary"
                  >
                    {row.nombre}
                  </Link>
                  <Amount row={row} compact />
                </div>
                <DonationMessage row={row} />
                <p className="text-xs text-muted-foreground">
                  {formatWhen(row.fecha_aprox)} · {row.fecha_relativa}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Cuándo</th>
                  <th className="px-4 py-3 font-medium">Donante</th>
                  <th className="px-4 py-3 font-medium">Mensaje</th>
                  <th className="px-4 py-3 text-right font-medium">Pesos</th>
                  <th className="px-4 py-3 text-right font-medium">Dólares</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-b-0">
                    <td className="px-4 py-3 align-top whitespace-normal">
                      <p>{formatWhen(row.fecha_aprox)}</p>
                      <p className="text-xs text-muted-foreground">{row.fecha_relativa}</p>
                    </td>
                    <td className="px-4 py-3 align-top font-medium whitespace-normal">
                      <Link to="/donante/$nombre" params={{ nombre: row.nombre }} className="hover:text-primary">
                        {row.nombre}
                      </Link>
                    </td>
                    <td className="max-w-xl px-4 py-3 align-top text-sm leading-6 whitespace-normal">
                      <DonationMessage row={row} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <Amount row={row} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <Amount row={row} usd />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            filters={filters}
            page={result.page}
            pages={result.pages}
            includeDonor={includeDonor}
            donorName={donorName}
            onPage={(page) =>
              go({
                q: filters.q,
                donor: filters.donor,
                sort: filters.sort,
                min: filters.min ?? undefined,
                page,
              })
            }
          />
        </>
      )}
    </section>
  );
}

function DonationMessage({ row }: { row: Donation }) {
  return (
    <div className="space-y-2">
      {row.devuelta ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="danger">Devuelta</Badge>
          {row.devolucion ? <span className="text-xs text-muted-foreground">{row.devolucion}</span> : null}
        </div>
      ) : null}
      {row.privado ? <Badge tone="outline">Mensaje privado</Badge> : <MessageText text={row.mensaje} />}
    </div>
  );
}

function Amount({ row, usd, compact }: { row: Donation; usd?: boolean; compact?: boolean }) {
  const value = usd ? formatUsd(row.monto_usd) : formatArs(row.monto_ars);
  return (
    <div className={compact ? "text-right" : undefined}>
      <p
        className={
          usd
            ? `text-xs tabular-nums text-muted-foreground ${row.devuelta ? "line-through" : ""}`
            : `font-heading leading-none font-medium tabular-nums ${compact ? "text-lg" : ""} ${row.devuelta ? "line-through decoration-foreground/40" : ""}`
        }
      >
        {value}
      </p>
      {compact && !usd ? (
        <p className={`mt-1 text-xs text-muted-foreground ${row.devuelta ? "line-through" : ""}`}>
          {formatUsd(row.monto_usd)}
        </p>
      ) : null}
    </div>
  );
}

function Pagination({
  filters,
  page,
  pages,
  includeDonor,
  donorName,
  onPage,
}: {
  filters: Filters;
  page: number;
  pages: number;
  includeDonor: boolean;
  donorName?: string;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(pages, page + 2);
  const numbers = [];
  for (let current = windowStart; current <= windowEnd; current += 1) numbers.push(current);
  const href = (n: number) =>
    filtersToSearch(filters, n, includeDonor ? "/" : donorName ? donorHref(donorName) : "/");

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Páginas">
      <a
        href={href(Math.max(1, page - 1))}
        onClick={(event) => {
          if (page === 1) return;
          event.preventDefault();
          onPage(page - 1);
        }}
        aria-disabled={page === 1}
        className={buttonClass("outline", page === 1 ? "pointer-events-none opacity-40" : "")}
      >
        Anterior
      </a>
      <div className="flex items-center gap-1">
        {windowStart > 1 ? <PageLink n={1} current={page} href={href(1)} onPage={onPage} /> : null}
        {windowStart > 2 ? <span className="px-1 text-muted-foreground">…</span> : null}
        {numbers.map((number) => (
          <PageLink key={number} n={number} current={page} href={href(number)} onPage={onPage} />
        ))}
        {windowEnd < pages - 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
        {windowEnd < pages ? <PageLink n={pages} current={page} href={href(pages)} onPage={onPage} /> : null}
      </div>
      <a
        href={href(Math.min(pages, page + 1))}
        onClick={(event) => {
          if (page === pages) return;
          event.preventDefault();
          onPage(page + 1);
        }}
        aria-disabled={page === pages}
        className={buttonClass("outline", page === pages ? "pointer-events-none opacity-40" : "")}
      >
        Siguiente
      </a>
    </nav>
  );
}

function PageLink({
  n,
  current,
  href,
  onPage,
}: {
  n: number;
  current: number;
  href: string;
  onPage: (page: number) => void;
}) {
  const active = n === current;
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onPage(n);
      }}
      className={buttonClass(active ? "primary" : "ghost", "h-9 min-w-9 px-2 tabular-nums")}
    >
      {n}
    </a>
  );
}

export function BrowserSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-28 animate-pulse rounded-2xl bg-muted" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

