import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { isFinancialDoc } from "@/lib/format";
import { getObject } from "@/lib/storage";

/**
 * Прокси-отдача файлов авто (§8.5). Браузер грузит их отсюда, а не из R2
 * напрямую — так работает при блокировке домена R2 у провайдера, а бакет
 * остаётся приватным.
 *
 * Права: любой вошедший видит фото и обычные документы; закупочные/внутренние
 * документы (financial) — только роли с see.acquisition (redaction). Ответ 404
 * для чужих файлов, чтобы не раскрывать их существование.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const rec = await prisma.carFile.findUnique({ where: { id } });
  if (!rec) return new NextResponse("Not found", { status: 404 });

  // Финансовые документы недоступны SALES/TECHNICAL.
  if (rec.kind === "DOCUMENT" && isFinancialDoc(rec.docType) && !can(user, "see.acquisition")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const obj = await getObject(rec.key);
  if (!obj) return new NextResponse("Not found", { status: 404 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Cache-Control": "private, max-age=3600",
  };
  if (download) {
    // ASCII-safe имя + RFC5987 для кириллицы
    const ascii = rec.filename.replace(/[^\x20-\x7E]/g, "_");
    headers["Content-Disposition"] =
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(rec.filename)}`;
  }
  return new NextResponse(new Uint8Array(obj.body), { headers });
}
