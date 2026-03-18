'use client';
export default function ResourcesPanel({resources}:{resources:Record<string,number>}){
  return (
    <ul className="text-sm">
      {Object.entries(resources).map(([k,v])=> (
        <li key={k} className="flex justify-between py-0.5">
          <span>{k}</span><span>{v}</span>
        </li>
      ))}
    </ul>
  )
}
