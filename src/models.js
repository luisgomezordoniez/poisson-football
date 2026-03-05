/**
 * models.js — Five football prediction models + hypothesis tests
 */
export const MAX_GOALS = 8;
export const MODEL_NAMES = ["Maher","Dixon-Coles","Dixon-Coles TD","Bivariate Poisson","Negative Binomial"];

// ── Math ───────────────────────────────────────────────────────────
const _lfc = [0, 0];
export function logFactorial(n) { if(n<0)return 0; if(n<_lfc.length)return _lfc[n]; for(let i=_lfc.length;i<=n;i++)_lfc[i]=_lfc[i-1]+Math.log(i); return _lfc[n]; }
export function logGamma(z) { if(z<0.5)return Math.log(Math.PI/Math.sin(Math.PI*z))-logGamma(1-z); z-=1; const c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7]; let x=c[0]; for(let i=1;i<9;i++)x+=c[i]/(z+i); const t=z+7.5; return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x); }
export function poissonPmf(k,lam) { if(lam<=0)return k===0?1:0; return Math.exp(-lam+k*Math.log(lam)-logFactorial(k)); }
export function negBinPmf(k,r,p) { if(r<=0||p<=0||p>=1)return 0; return Math.exp(logGamma(k+r)-logFactorial(k)-logGamma(r)+r*Math.log(p)+k*Math.log(1-p)); }
export function rpois(lam) { if(lam<=0)return 0; const L=Math.exp(-Math.min(lam,500)); let k=0,p=1; do{k++;p*=Math.random();}while(p>L); return k-1; }

// ── Chi-squared ────────────────────────────────────────────────────
function lowerIncGamma(a,x){if(x<=0)return 0;let s=0,t=1/a;for(let n=1;n<200;n++){s+=t;t*=x/(a+n);if(Math.abs(t)<1e-12)break;}return s*Math.exp(-x+a*Math.log(x)-logGamma(a));}
export function chiSqCdf(x,df){return x<=0?0:lowerIncGamma(df/2,x/2);}
export function chiSqPValue(x,df){return 1-chiSqCdf(x,df);}

// ── Hypothesis tests ───────────────────────────────────────────────
export function poissonGoodnessOfFitTest(goals){
  const n=goals.length; if(n<10)return null;
  const lam=goals.reduce((a,b)=>a+b,0)/n; const MB=6;
  const obs=new Array(MB+1).fill(0); goals.forEach(g=>obs[Math.min(g,MB)]++);
  let cp=0; const exp=[];
  for(let k=0;k<MB;k++){const p=poissonPmf(k,lam);exp.push(n*p);cp+=p;} exp.push(n*(1-cp));
  const bins=Array.from({length:MB+1},(_,i)=>i===MB?`${MB}+`:`${i}`);
  while(exp.length>2&&exp[exp.length-1]<5){obs[obs.length-2]+=obs.pop();exp[exp.length-2]+=exp.pop();bins.pop();bins[bins.length-1]+="+";}
  let chi=0; for(let i=0;i<obs.length;i++)if(exp[i]>0)chi+=(obs[i]-exp[i])**2/exp[i];
  const df=Math.max(1,obs.length-2);
  return{statistic:chi,df,pValue:chiSqPValue(chi,df),lambda:lam,observed:obs,expected:exp.map(e=>Math.round(e*10)/10),bins};
}

export function independenceTest(matches){
  if(matches.length<20)return null; const MG=5;
  const tbl=Array.from({length:MG+1},()=>new Array(MG+1).fill(0));
  for(const m of matches)tbl[Math.min(m.hg,MG)][Math.min(m.ag,MG)]++;
  const n=matches.length;
  const rS=tbl.map(r=>r.reduce((a,b)=>a+b,0));
  const cS=Array(MG+1).fill(0); for(let j=0;j<=MG;j++)for(let i=0;i<=MG;i++)cS[j]+=tbl[i][j];
  let chi=0; for(let i=0;i<=MG;i++)for(let j=0;j<=MG;j++){const e=(rS[i]*cS[j])/n;if(e>0)chi+=(tbl[i][j]-e)**2/e;}
  const df=MG*MG; return{statistic:chi,df,pValue:chiSqPValue(chi,df)};
}

export function dispersionTest(goals){
  const n=goals.length; if(n<10)return null;
  const mean=goals.reduce((a,b)=>a+b,0)/n;
  const variance=goals.reduce((s,g)=>s+(g-mean)**2,0)/(n-1);
  const ratio=variance/mean; const D=(n-1)*variance/mean; const df=n-1;
  const pO=chiSqPValue(D,df),pU=chiSqCdf(D,df);
  return{statistic:D,df,pValue:Math.min(2*Math.min(pO,pU),1),pValueOver:pO,mean,variance,ratio};
}

// ── Parameter estimation ───────────────────────────────────────────
export function estimateParams(matches,weights=null){
  const teams=[...new Set([...matches.map(m=>m.home),...matches.map(m=>m.away)])];
  const n=teams.length; const idx={}; teams.forEach((t,i)=>idx[t]=i);
  const atk=new Array(n).fill(1),def=new Array(n).fill(1); let ha=0.25;
  const w=weights||new Array(matches.length).fill(1);
  for(let iter=0;iter<30;iter++){
    const aN=new Array(n).fill(0),aD=new Array(n).fill(0),dN=new Array(n).fill(0),dD=new Array(n).fill(0);
    let hgW=0,agW=0,mW=0;
    for(let i=0;i<matches.length;i++){const m=matches[i],hi=idx[m.home],ai=idx[m.away];if(hi===undefined||ai===undefined)continue;const wi=w[i],eha=Math.exp(ha);aN[hi]+=m.hg*wi;aD[hi]+=def[ai]*eha*wi;aN[ai]+=m.ag*wi;aD[ai]+=def[hi]*wi;dN[hi]+=m.ag*wi;dD[hi]+=atk[ai]*wi;dN[ai]+=m.hg*wi;dD[ai]+=atk[hi]*eha*wi;hgW+=m.hg*wi;agW+=m.ag*wi;mW+=wi;}
    for(let j=0;j<n;j++){if(aD[j]>0)atk[j]=aN[j]/aD[j];if(dD[j]>0)def[j]=dN[j]/dD[j];}
    const lm=atk.reduce((s,a)=>s+Math.log(Math.max(a,1e-6)),0)/n,sc=Math.exp(lm);
    for(let j=0;j<n;j++){atk[j]/=sc;def[j]*=sc;}
    if(mW>0)ha=Math.log(Math.max(hgW/agW,0.5));
  }
  return{teams,teamIdx:idx,attack:atk,defense:def,homeAdv:ha};
}

// ── DC ─────────────────────────────────────────────────────────────
function dcTau(x,y,lH,lA,rho){if(x===0&&y===0)return 1-lH*lA*rho;if(x===0&&y===1)return 1+lH*rho;if(x===1&&y===0)return 1+lA*rho;if(x===1&&y===1)return 1-rho;return 1;}
function estimateRho(matches,params){let adj=0,cnt=0;for(const m of matches){const hi=params.teamIdx[m.home],ai=params.teamIdx[m.away];if(hi===undefined||ai===undefined)continue;if(m.hg<=1&&m.ag<=1){adj+=(m.hg===0&&m.ag===0)?1:(m.hg===1&&m.ag===1)?1:-0.5;cnt++;}}return cnt>0?Math.max(-0.5,Math.min(0.5,adj/(cnt*5))):0;}

// ── Bivariate Poisson ──────────────────────────────────────────────
function bpPmf(x,y,l1,l2,l3){let p=0;for(let k=0;k<=Math.min(x,y);k++)p+=poissonPmf(x-k,l1)*poissonPmf(y-k,l2)*poissonPmf(k,l3);return p;}
function estLambda3(matches){const mH=matches.reduce((s,m)=>s+m.hg,0)/matches.length,mA=matches.reduce((s,m)=>s+m.ag,0)/matches.length;let c=0;for(const m of matches)c+=(m.hg-mH)*(m.ag-mA);c/=Math.max(matches.length-1,1);return Math.max(0.01,Math.min(0.5,c>0?c*0.3:0.05));}

// ── NegBin ─────────────────────────────────────────────────────────
function estDisp(goals,mu){const n=goals.length;if(n<2)return 50;const v=goals.reduce((s,g)=>s+(g-mu)**2,0)/(n-1);return v<=mu?50:Math.max(1,mu*mu/(v-mu));}

// ── Matrix ─────────────────────────────────────────────────────────
function buildMatrix(lH,lA,type,rho=0,l3=0,rH=50,rA=50){
  const mx=[];let pH=0,pD=0,pA=0;
  for(let i=0;i<=MAX_GOALS;i++){mx[i]=[];for(let j=0;j<=MAX_GOALS;j++){let p;if(type==="negbin"){const ppH=rH/(rH+lH),ppA=rA/(rA+lA);p=negBinPmf(i,rH,ppH)*negBinPmf(j,rA,ppA);}else if(type==="bivariate")p=bpPmf(i,j,lH,lA,l3);else{p=poissonPmf(i,lH)*poissonPmf(j,lA);if(type==="dixoncoles")p*=dcTau(i,j,lH,lA,rho);}mx[i][j]=p;if(i>j)pH+=p;else if(i===j)pD+=p;else pA+=p;}}
  const tot=pH+pD+pA||1;pH/=tot;pD/=tot;pA/=tot;
  let mp=0,bi=0,bj=0;for(let i=0;i<=MAX_GOALS;i++)for(let j=0;j<=MAX_GOALS;j++)if(mx[i][j]>mp){mp=mx[i][j];bi=i;bj=j;}
  return{lambdaH:type==="bivariate"?lH+l3:lH,lambdaA:type==="bivariate"?lA+l3:lA,pHome:pH,pDraw:pD,pAway:pA,matrix:mx,mostLikely:[bi,bj],mostLikelyProb:mp};
}

// ── Predict from pre-computed params (fast, no re-estimation) ──────
function predictFromParams(params, modelName, homeTeam, awayTeam, trainMatches, rho, l3, rH, rA) {
  const hi = params.teamIdx[homeTeam], ai = params.teamIdx[awayTeam];
  if (hi === undefined || ai === undefined) return null;
  const lH = Math.max(0.1, params.attack[hi] * params.defense[ai] * Math.exp(params.homeAdv));
  const lA = Math.max(0.1, params.attack[ai] * params.defense[hi]);
  switch (modelName) {
    case "Maher": return buildMatrix(lH, lA, "independent");
    case "Dixon-Coles": case "Dixon-Coles TD": return buildMatrix(lH, lA, "dixoncoles", rho);
    case "Bivariate Poisson": return buildMatrix(Math.max(0.05, lH - l3), Math.max(0.05, lA - l3), "bivariate", 0, l3);
    case "Negative Binomial": return buildMatrix(lH, lA, "negbin", 0, 0, rH, rA);
    default: return buildMatrix(lH, lA, "independent");
  }
}

// ── Public: predict single match ───────────────────────────────────
export function predictMatch(modelName, trainMatches, homeTeam, awayTeam, options = {}) {
  let fm = trainMatches;
  if (options.excludeMatch) fm = fm.filter(m => !(m.home === options.excludeMatch.home && m.away === options.excludeMatch.away));
  if (!fm.length) return null;
  let wt = null;
  if (modelName === "Dixon-Coles TD") { const xi = options.xi || 0.005, n = fm.length; wt = fm.map((_, i) => Math.exp(-xi * (n - i))); }
  const par = estimateParams(fm, wt);
  const rho = estimateRho(fm, par);
  const l3 = estLambda3(fm);
  const rH = estDisp(fm.map(m => m.hg), fm.reduce((s, m) => s + m.hg, 0) / fm.length);
  const rA = estDisp(fm.map(m => m.ag), fm.reduce((s, m) => s + m.ag, 0) / fm.length);
  return predictFromParams(par, modelName, homeTeam, awayTeam, fm, rho, l3, rH, rA);
}

export function findRealResult(matches, home, away) {
  return matches.find(m => m.home === home && m.away === away) || null;
}

// ── Public: simulate full league (FIXED: estimate params ONCE) ─────
export function simulateLeague(matches, teams, modelName, trainPct, options = {}) {
  const tN = Math.floor(matches.length * trainPct);
  const train = matches.slice(0, tN);
  if (!train.length) return [];

  // Estimate parameters ONCE for the entire league
  let wt = null;
  if (modelName === "Dixon-Coles TD") {
    const xi = options.xi || 0.005;
    wt = train.map((_, i) => Math.exp(-xi * (tN - i)));
  }
  const params = estimateParams(train, wt);
  const rho = estimateRho(train, params);
  const l3 = estLambda3(train);
  const meanH = train.reduce((s, m) => s + m.hg, 0) / train.length;
  const meanA = train.reduce((s, m) => s + m.ag, 0) / train.length;
  const rH = estDisp(train.map(m => m.hg), meanH);
  const rA = estDisp(train.map(m => m.ag), meanA);

  const predicted = [];
  const n = teams.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ex = train.find(m => m.home === teams[i] && m.away === teams[j]);
      if (ex) {
        predicted.push({ ...ex });
      } else {
        const pred = predictFromParams(params, modelName, teams[i], teams[j], train, rho, l3, rH, rA);
        if (pred) {
          const hg = Math.round(pred.lambdaH), ag = Math.round(pred.lambdaA);
          predicted.push({ home: teams[i], away: teams[j], hg, ag, result: hg > ag ? "H" : hg < ag ? "A" : "D" });
        }
      }
    }
  }
  return computeTable(predicted);
}

export function computeTable(matches) {
  const t = {};
  for (const m of matches) {
    if (!t[m.home]) t[m.home] = { team: m.home, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    if (!t[m.away]) t[m.away] = { team: m.away, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    t[m.home].p++; t[m.away].p++; t[m.home].gf += m.hg; t[m.home].ga += m.ag; t[m.away].gf += m.ag; t[m.away].ga += m.hg;
    if (m.hg > m.ag) { t[m.home].w++; t[m.home].pts += 3; t[m.away].l++; }
    else if (m.hg < m.ag) { t[m.away].w++; t[m.away].pts += 3; t[m.home].l++; }
    else { t[m.home].d++; t[m.home].pts++; t[m.away].d++; t[m.away].pts++; }
  }
  return Object.values(t).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}
