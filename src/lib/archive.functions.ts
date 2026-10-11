import { createServerFn } from "@tanstack/react-start";
import { request as httpsRequest } from "node:https";
import { parseFilters, type Filters, type YoutubeVideo } from "./archive";

const videoTitles = new Map<string, { title: string; author: string }>();

function fetchText(url: string) {
  return new Promise<string>((resolve, reject) => {
    const target = new URL(url);
    const req = httpsRequest(
      { hostname: target.hostname, path: `${target.pathname}${target.search}`, method: "GET", family: 4 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.setTimeout(4000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function decodeBasic(value: string) {
  return value
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/"/g, '"')
    .replace(/&/g, "&");
}

async function withVideoTitles<T extends { videos: YoutubeVideo[] }>(meta: T) {
  await Promise.all(
    meta.videos.map(async (video) => {
      const cached = videoTitles.get(video.id);
      if (cached) {
        video.title = cached.title;
        video.author = cached.author;
        return;
      }
      try {
        const text = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(video.href)}`);
        const body = JSON.parse(text) as { title?: string; author_name?: string };
        video.title = decodeBasic(body.title?.trim() || video.id);
        video.author = decodeBasic(body.author_name?.trim() || "");
      } catch {
        video.title = video.id;
        video.author = "";
      }
      videoTitles.set(video.id, { title: video.title, author: video.author });
    }),
  );
  return meta;
}

export const getArchivePage = createServerFn({ method: "GET" })
  .validator((input: Filters) => parseFilters(input))
  .handler(async ({ data }) => {
    const { homePayload } = await import("./donations.server");
    const page = homePayload(data);
    await withVideoTitles(page.meta);
    return page;
  });

export const getKick = createServerFn({ method: "GET" }).handler(async () => {
  const { kickPayload } = await import("./kick.server");
  return kickPayload();
});

export const getPodcast = createServerFn({ method: "GET" }).handler(async () => {
  const { podcastPayload } = await import("./podcast.server");
  return podcastPayload();
});

const answerCache = new Map<string, string>();

function postJson(url: string, headers: Record<string, string>, body: string) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const target = new URL(url);
    const req = httpsRequest(
      {
        hostname: target.hostname,
        path: target.pathname,
        method: "POST",
        family: 4,
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.setTimeout(25000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export const askArchive = createServerFn({ method: "POST" })
  .validator((input: { question?: string }) => {
    const question = typeof input?.question === "string" ? input.question.trim().slice(0, 400) : "";
    return { question };
  })
  .handler(async ({ data }) => {
    if (data.question.length < 2) return { ok: false as const, error: "Escribí una pregunta." };
    const key = data.question.toLowerCase();
    const cached = answerCache.get(key);
    if (cached) return { ok: true as const, text: cached };

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "El agente no está disponible." };

    const { questionContext } = await import("./donations.server");
    const brief = questionContext(data.question);
    const payload = JSON.stringify({
      model: "grok-4.5",
      max_tokens: 280,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Respondé en español rioplatense, en dos o tres oraciones. Los datos del archivo vienen en el mensaje del usuario, después de Datos. Usá solo esos números. Si no alcanza, decilo. No inventes personas ni montos.",
        },
        {
          role: "user",
          content: `Pregunta: ${data.question}\n\nDatos:\n${JSON.stringify(brief)}`,
        },
      ],
    });
    try {
      const res = await postJson(
        "https://api.x.ai/v1/chat/completions",
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        payload,
      );
      if (res.status < 200 || res.status >= 300) return { ok: false as const, error: "No pude consultar el archivo." };
      const body = JSON.parse(res.text) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { ok: false as const, error: "No hubo respuesta." };
      if (answerCache.size > 40) answerCache.clear();
      answerCache.set(key, text);
      return { ok: true as const, text };
    } catch {
      return { ok: false as const, error: "No pude consultar el archivo." };
    }
  });

export const getDonorPage = createServerFn({ method: "GET" })
  .validator((input: { name: string; filters: Filters }) => ({
    name: typeof input?.name === "string" ? input.name.slice(0, 200) : "",
    filters: parseFilters(input?.filters),
  }))
  .handler(async ({ data }) => {
    const { donorPayload } = await import("./donations.server");
    return donorPayload(data.name, data.filters);
  });
