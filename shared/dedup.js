/* ── Transport dedup: BroadcastChannel and the storage bridge BOTH deliver
   every message; whichever arrives second must be dropped, or every event
   would apply twice. Shared so tests replay the exact page behavior. ───── */
export function makeDeduper(cap=600){
  const seen=new Set();
  return id=>{
    if(!id||seen.has(id))return false;
    seen.add(id);
    if(seen.size>cap){let i=0;
      for(const k of seen){seen.delete(k);if(++i>=cap/2)break;}}
    return true;};
}
