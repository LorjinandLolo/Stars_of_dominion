export async function getGazette(day:number){
  const res = await fetch(`/api/gazette?day=${day}`, { cache: 'no-store' });
  return res.json();
}
