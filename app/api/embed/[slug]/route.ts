import { supabaseAdmin } from "@/lib/supabase/admin";

// <script src="https://<crm>/api/embed/<slug>.js?ws=<workspace>" async></script>
// Popup mode (exit intent) is controlled by the form's settings. Add data-inline="#element-id" to render inline instead.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const slug = (await ctx.params).slug.replace(/\.js$/, "");
  const u = new URL(req.url);
  const wsSlug = u.searchParams.get("ws") ?? process.env.INBOUND_WORKSPACE_SLUG ?? "kydos-digital";
  const db = supabaseAdmin();
  const { data: ws } = await db.from("workspaces").select("id").eq("slug", wsSlug).maybeSingle();
  const { data: f } = ws ? await db.from("hosted_forms").select("exit_intent,popup_delay_seconds,active").eq("workspace_id", ws.id).eq("slug", slug).maybeSingle() : { data: null };
  const headers = { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" };
  if (!f || !f.active) return new Response("/* form not found or inactive */", { headers });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? u.origin;
  const src = `${origin}/f/form/${slug}?ws=${encodeURIComponent(wsSlug)}&embed=1`;
  const js = `(function(){
var SRC=${JSON.stringify(src)},KEY="kydos_form_${slug}",EXIT=${f.exit_intent ? "true" : "false"},DELAY=${f.popup_delay_seconds * 1000};
var me=document.currentScript,inline=me&&me.getAttribute("data-inline");
function frame(h){var i=document.createElement("iframe");i.src=SRC+"&lp="+encodeURIComponent(location.href);i.style.cssText="border:0;width:100%;height:"+h+";background:#fff";return i;}
if(inline){var t=document.querySelector(inline);if(t)t.appendChild(frame("460px"));return;}
try{if(sessionStorage.getItem(KEY)||localStorage.getItem(KEY+"_done"))return;}catch(e){}
var shown=false;
function show(){if(shown)return;shown=true;try{sessionStorage.setItem(KEY,"1")}catch(e){}
var o=document.createElement("div");o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px";
var b=document.createElement("div");b.style.cssText="position:relative;background:#fff;border-radius:10px;width:100%;max-width:440px;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden";
var x=document.createElement("button");x.textContent="\\u00d7";x.setAttribute("aria-label","Close");x.style.cssText="position:absolute;top:6px;right:10px;border:0;background:none;font-size:26px;cursor:pointer;z-index:2";
function close(){o.remove();}
x.onclick=close;o.onclick=function(e){if(e.target===o)close();};
b.appendChild(x);b.appendChild(frame("520px"));o.appendChild(b);document.body.appendChild(o);
window.addEventListener("message",function(e){if(e.data&&e.data.type==="kydos-form-done"){try{localStorage.setItem(KEY+"_done","1")}catch(_){}setTimeout(close,2500);}});}
if(EXIT){
 document.addEventListener("mouseout",function(e){if(!e.relatedTarget&&e.clientY<=0)setTimeout(show,DELAY);});
 var lastY=window.scrollY,fast=0;
 window.addEventListener("scroll",function(){var y=window.scrollY;if(lastY-y>120&&y<200){fast++;if(fast>1)show();}lastY=y;},{passive:true});
 setTimeout(function(){document.addEventListener("visibilitychange",function(){if(document.hidden&&/Mobi/i.test(navigator.userAgent))show();});},4000);
}else{setTimeout(show,DELAY||8000);}
})();`;
  return new Response(js, { headers });
}
