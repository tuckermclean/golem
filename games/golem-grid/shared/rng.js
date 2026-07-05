/* ── RNG — pure, seeded, shared by page and tooling. The hash is a public
   API: changing any of this invalidates every seed in the wild. ────────── */
export function h32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){
  h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;
  h=Math.imul(h,3266489917);h^=h>>>16;return h>>>0;}
export function channel(...parts){let s=h32(parts.join("\u001f"))||1;
  return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export const pick=(r,a)=>a[(r()*a.length)|0], chance=(r,p)=>r()<p,
      rint=(r,n)=>(r()*n)|0;
