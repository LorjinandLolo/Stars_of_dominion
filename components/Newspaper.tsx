'use client';
import useSWR from 'swr';
import { getGazette } from '@/lib/gazette';

const fetcher = (url:string)=> fetch(url).then(r=>r.json());

export default function Newspaper({day}:{day:number}){
  const { data } = useSWR(`/api/gazette?day=${day}`, fetcher, { refreshInterval: 5000 });
  if(!data) return <div>Loading…</div>;
  if(data.articles.length===0) return <div className="opacity-70">No major incidents reported.</div>;
  return (
    <div className="space-y-3">
      {data.articles.map((a:any, idx:number)=> (
        <article key={idx} className="border-t border-neutral-800 pt-2">
          <div className="font-semibold">{a.headline}</div>
          <div className="italic opacity-90">{a.lede}</div>
        </article>
      ))}
    </div>
  );
}
