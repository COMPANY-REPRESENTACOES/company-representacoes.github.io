// Company Vendas · função "abriu": imagem 1x1 do e-mail; quando o destinatário abre o e-mail,
// marca o envio como lido (Lido/Recebido) em emails_enviados. Publicar SEM exigir login (verify JWT desligado).
import { createClient } from "npm:@supabase/supabase-js@2";

const chaveServico = () => {
  try { const o = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); const v = o.default || Object.values(o)[0]; if (v) return String(v); } catch (_) { /* usa a antiga */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
};

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (/^[0-9a-f-]{36}$/i.test(t)) {
    try {
      const db = createClient(Deno.env.get("SUPABASE_URL")!, chaveServico(), { auth: { persistSession: false } });
      const { data } = await db.from("emails_enviados").select("id, enviado_em, lido_em, aberturas, pre_aberturas").eq("token", t).maybeSingle();
      if (data) {
        const ua = (req.headers.get("user-agent") || "").slice(0, 200);
        // servidores de e-mail e antivírus baixam as imagens logo na entrega (segundos depois do envio):
        // isso não é leitura da pessoa, então só conta como lido depois de 2 minutos do envio
        const seg = (Date.now() - new Date(data.enviado_em).getTime()) / 1000;
        if (seg < 120) {
          await db.from("emails_enviados").update({ pre_aberturas: (data.pre_aberturas || 0) + 1, ultimo_acesso: ua }).eq("id", data.id);
        } else {
          await db.from("emails_enviados").update({
            lido: true, lido_em: data.lido_em || new Date().toISOString(), aberturas: (data.aberturas || 0) + 1, ultimo_acesso: ua,
          }).eq("id", data.id);
        }
      }
    } catch (_) { /* nunca quebra a imagem */ }
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
});
