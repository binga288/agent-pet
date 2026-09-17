export function fitPet(p: {x:number;y:number}, area: {x:number;y:number;width:number;height:number}) {
  const width=Math.min(320,area.width), height=Math.min(360,area.height);
  const x=Math.round(p.x-(width-192)/2); // no horizontal clamping — free cross-screen movement
  const petY=Math.round(Math.max(area.y,Math.min(p.y,area.y+area.height-208)));
  const y=Math.round(Math.max(area.y,Math.min(petY-(height-208),area.y+area.height-height)));
  return {x,y,width,height,side:'right' as const,petX:Math.round(x+(width-192)/2),petY:y+(height-208)};
}
