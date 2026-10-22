export class PracticeTimer {
  constructor(clock = () => performance.now()) {
    this.clock=clock;
    this.reset();
  }
  elapsed() {
    return this.elapsedMs+(this.status==='running'?Math.max(0,this.clock()-this.startedAt):0);
  }
  start() {
    if(this.status==='running')return false;
    if(this.status==='ended')this.elapsedMs=0;
    this.startedAt=this.clock();this.status='running';return true;
  }
  pause() {
    if(this.status!=='running')return false;
    this.elapsedMs=this.elapsed();this.status='paused';return true;
  }
  end() {
    if(this.status==='idle'||this.status==='ended')return false;
    this.elapsedMs=this.elapsed();this.status='ended';return true;
  }
  reset() {
    this.elapsedMs=0;this.startedAt=0;this.status='idle';
  }
  serialize() {
    return {elapsedMs:this.elapsed(),status:this.status};
  }
  static restore(data,clock) {
    const timer=new PracticeTimer(clock);
    if(!data||!Number.isFinite(data.elapsedMs)||data.elapsedMs<0||!['idle','running','paused','ended'].includes(data.status))return timer;
    timer.elapsedMs=data.status==='idle'?0:data.elapsedMs;
    timer.status=data.status==='running'?'paused':data.status;
    return timer;
  }
}

export function formatElapsed(milliseconds) {
  const ticks=Math.floor(Math.max(0,milliseconds)/10),seconds=Math.floor(ticks/100),minutes=Math.floor(seconds/60),
    hours=Math.floor(minutes/60),pad=n=>String(n).padStart(2,'0');
  return `${hours?hours+':':''}${pad(minutes%60)}:${pad(seconds%60)}.${pad(ticks%100)}`;
}
