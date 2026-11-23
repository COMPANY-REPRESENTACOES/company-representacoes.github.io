// Company Vendas · função "enviar-email": envia o pedido (PDF anexo) pelo Brevo,
// um e-mail por destinatário, com imagem de confirmação de leitura, e registra em emails_enviados.
// Segredos no Supabase: BREVO_API_KEY e um remetente por vendedor:
//   SENDER_EMAIL_G / SENDER_NAME_G (Guirra), SENDER_EMAIL_C / SENDER_NAME_C (Clara)
//   (SENDER_EMAIL / SENDER_NAME servem de padrão para quem não tiver o seu)
import { createClient } from "npm:@supabase/supabase-js@2";

const chaveServico = () => {
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); const v = o.default || Object.values(o)[0]; if (v) return String(v); } catch (_) { /* usa a antiga */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (t: string) => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  const URL_ = Deno.env.get("SUPABASE_URL")!;
  const SRV = chaveServico();
  const KEY = Deno.env.get("BREVO_API_KEY");
  if (!KEY) return json({ erro: "envio direto ainda não configurado (falta BREVO_API_KEY)" }, 500);

  const db = createClient(URL_, SRV, { auth: { persistSession: false } });
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await db.auth.getUser(tok);
  if (ue || !u?.user) return json({ erro: "sessão inválida, entre de novo no programa" }, 401);

  let b: any;
  try { b = await req.json(); } catch { return json({ erro: "dados inválidos" }, 400); }
  // remetente de quem está enviando (cada vendedor com o seu e-mail verificado no Brevo)
  const cod = String(b.vendedor_codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const FROM = Deno.env.get("SENDER_EMAIL_" + cod) || Deno.env.get("SENDER_EMAIL");
  const FROM_NAME = Deno.env.get("SENDER_NAME_" + cod) || Deno.env.get("SENDER_NAME") || "Company Representações";
  if (!FROM) return json({ erro: "falta cadastrar o e-mail remetente deste vendedor (SENDER_EMAIL_" + cod + ")" }, 500);
  const para: string[] = (b.para || []).map((x: string) => String(x).trim()).filter((x: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!para.length) return json({ erro: "nenhum destinatário válido" }, 400);
  if (!b.pdf_base64) return json({ erro: "PDF não veio" }, 400);

  const pixelBase = URL_ + "/functions/v1/abriu?t=";
  const resultados: any[] = [];
  for (const dest of para) {
    const { data: row, error: ie } = await db.from("emails_enviados").insert({
      pedido_id: b.pedido_id, pedido_numero: b.pedido_numero, grupo: b.grupo, destinatario: dest,
      assunto: b.assunto, enviado_por: b.enviado_por, vendedor_codigo: b.vendedor_codigo,
    }).select("id, token").single();
    if (ie) { resultados.push({ destinatario: dest, ok: false, erro: ie.message }); continue; }
    const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
      esc(b.mensagem || "").replace(/\n/g, "<br>") + "</div>" +
      '<img src="' + pixelBase + row.token + '" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">';
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": KEY, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: FROM, name: FROM_NAME },
        to: [{ email: dest }],
        replyTo: { email: b.responder_para || u.user.email },
        subject: b.assunto || "Pedido",
        htmlContent: html,
        textContent: b.mensagem || "",
        attachment: [{ name: b.pdf_nome || "pedido.pdf", content: b.pdf_base64 }],
      }),
    });
    const t = await r.text();
    if (r.ok) {
      await db.from("emails_enviados").update({ status_envio: "enviado" }).eq("id", row.id);
      resultados.push({ destinatario: dest, ok: true });
    } else {
      await db.from("emails_enviados").update({ status_envio: "erro", erro: t.slice(0, 500) }).eq("id", row.id);
      resultados.push({ destinatario: dest, ok: false, erro: t.slice(0, 300) });
    }
  }
  return json({ resultados });
});
