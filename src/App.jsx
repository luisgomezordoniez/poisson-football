import { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { loadMatchData, loadBadges, getBadgeUrl, getSeasons, getTeams, getMatches, getAvailableLeagues, LEAGUES } from "./dataLoader.js";
import { MODEL_NAMES, predictMatch, simulateLeague, computeTable, poissonPmf, rpois,
         findRealResult, poissonGoodnessOfFitTest, independenceTest, dispersionTest } from "./models.js";
import T from "./i18n.js";

// ═══ THEME ═════════════════════════════════════════════════════════
const themes = {
  dark: { bg:"#0a0f1a",card:"#111827",cardAlt:"#0d1525",border:"#1e2d3d",accent:"#22d3ee",accentDim:"#0e7490",accentBg:"#22d3ee12",home:"#22d3ee",draw:"#a78bfa",away:"#f472b6",text:"#e2e8f0",textDim:"#64748b",textMuted:"#475569",success:"#34d399",warning:"#fbbf24",danger:"#f87171",inputBg:"#111827",selectArrow:"%2364748b",tooltipBg:"#111827" },
  light: { bg:"#f8fafc",card:"#ffffff",cardAlt:"#f1f5f9",border:"#e2e8f0",accent:"#0891b2",accentDim:"#0e7490",accentBg:"#0891b212",home:"#0891b2",draw:"#7c3aed",away:"#db2777",text:"#1e293b",textDim:"#64748b",textMuted:"#94a3b8",success:"#059669",warning:"#d97706",danger:"#dc2626",inputBg:"#ffffff",selectArrow:"%2364748b",tooltipBg:"#ffffff" },
};
const ThemeCtx = createContext(themes.dark);
const useTheme = () => useContext(ThemeCtx);

// ═══ KATEX COMPONENT ═══════════════════════════════════════════════
const Katex = ({ math, display = false }) => {
  const ref = useRef(null);
  const C = useTheme();
  useEffect(() => {
    if (ref.current && window.katex) {
      try {
        window.katex.render(math, ref.current, { displayMode: display, throwOnError: false, output: "html" });
      } catch (e) { ref.current.textContent = math; }
    }
  }, [math, display]);
  return <span ref={ref} style={{ color: C.text }} />;
};

// ═══ BADGE ═════════════════════════════════════════════════════════
const BADGE_COLORS=["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6","#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e","#0ea5e9","#10b981","#84cc16","#d946ef"];
function hashStr(s){let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h);}
function getTeamInitials(name){const sp={"Man City":"MC","Man United":"MU","Sheffield United":"SHU","Nott'm Forest":"NF","West Ham":"WHU","Crystal Palace":"CRY","Aston Villa":"AVL","Real Madrid":"RMA","Atlético Madrid":"ATM","Bayern Munich":"BAY","AC Milan":"ACM","RB Leipzig":"RBL","Ein Frankfurt":"SGE","M'gladbach":"BMG","FC Köln":"KOE"};if(sp[name])return sp[name];const w=name.replace(/[^a-zA-ZÀ-ÿ\s]/g,"").split(/\s+/);return w.length===1?w[0].substring(0,3).toUpperCase():w.map(x=>x[0]).join("").substring(0,3).toUpperCase();}

const Badge = ({ team, size = 28, badges = {} }) => {
  const C = useTheme();
  const url = getBadgeUrl(badges, team);
  const color = BADGE_COLORS[hashStr(team) % BADGE_COLORS.length];
  const [err, setErr] = useState(false);
  if (url && !err) return <img src={url+"/tiny"} alt={team} onError={()=>setErr(true)} style={{width:size,height:size,objectFit:"contain",flexShrink:0}} />;
  return <div style={{width:size,height:size,borderRadius:size/2,background:`${color}20`,border:`2px solid ${color}60`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:700,color,flexShrink:0,fontFamily:"'JetBrains Mono',monospace"}}>{getTeamInitials(team)}</div>;
};

// ═══ SMALL COMPONENTS ══════════════════════════════════════════════
const TabBtn=({active,onClick,children})=>{const C=useTheme();return<button onClick={onClick} style={{padding:"10px 20px",border:"none",background:"transparent",borderBottom:active?`2px solid ${C.accent}`:"2px solid transparent",color:active?C.accent:C.textDim,fontSize:14,fontWeight:active?600:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:".02em",transition:"all .2s",whiteSpace:"nowrap"}}>{children}</button>;};

const Sel=({value,onChange,options,label,style={}})=>{const C=useTheme();return<div style={{display:"flex",flexDirection:"column",gap:6,...style}}>{label&&<label style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:".1em",fontWeight:600}}>{label}</label>}<select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"10px 36px 10px 14px",background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:14,fontFamily:"'DM Sans',sans-serif",cursor:"pointer",outline:"none",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='${C.selectArrow}' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"}}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;};

const Sli=({value,onChange,min,max,step,label,display})=>{const C=useTheme();return<div style={{display:"flex",flexDirection:"column",gap:6}}><div style={{display:"flex",justifyContent:"space-between"}}><label style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:".1em",fontWeight:600}}>{label}</label><span style={{fontSize:13,color:C.accent,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{display}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} style={{width:"100%",accentColor:C.accent}} /></div>;};

const PBadge=({p,t})=>{const C=useTheme();const r=p<0.05;const co=r?C.danger:C.success;return<span style={{padding:"3px 10px",borderRadius:12,fontSize:11,fontWeight:600,background:`${co}18`,color:co,border:`1px solid ${co}40`}}>{r?t.test_result_reject:t.test_result_fail}</span>;};

// ═══ SCORE MATRIX ══════════════════════════════════════════════════
const ScoreMatrix=({matrix,homeTeam,awayTeam})=>{const C=useTheme();if(!matrix)return null;const flat=matrix.flat();const mx=Math.max(...flat);const MG=8;return<div style={{overflowX:"auto"}}><div style={{display:"inline-grid",gridTemplateColumns:`56px repeat(${MG+1},48px)`,gap:2,fontSize:11}}><div style={{padding:4,color:C.textDim,textAlign:"center",fontSize:9}}>{homeTeam?.slice(0,5)}↓\{awayTeam?.slice(0,5)}→</div>{Array.from({length:MG+1},(_,j)=><div key={j} style={{padding:4,color:C.accent,textAlign:"center",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{j}</div>)}{matrix.slice(0,MG+1).map((row,i)=>[<div key={`r${i}`} style={{padding:4,color:C.accent,textAlign:"center",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{i}</div>,...row.slice(0,MG+1).map((p,j)=>{const t=mx>0?p/mx:0;const bg=i>j?`rgba(34,211,238,${t*.7})`:i<j?`rgba(244,114,182,${t*.7})`:`rgba(167,139,250,${t*.7})`;return<div key={`${i}-${j}`} style={{padding:4,textAlign:"center",background:bg,borderRadius:4,color:t>.3?"#fff":C.textDim,fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:t>.5?700:400}}>{(p*100).toFixed(1)}</div>;})])}</div></div>;};

// ═══ LEAGUE TABLE ══════════════════════════════════════════════════
const LTable=({table,t,badges})=>{const C=useTheme();const th={padding:"10px 6px",textAlign:"center",color:C.textDim,fontWeight:600,fontSize:11};const td={padding:"7px 6px",textAlign:"center",color:C.textDim,fontSize:13};return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'DM Sans',sans-serif"}}><thead><tr style={{borderBottom:`1px solid ${C.border}`}}><th style={th}>#</th><th style={{...th,textAlign:"left"}}>{t.team}</th>{[t.played,t.won,t.drawn,t.lost,t.gf,t.ga,t.gd,t.pts].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{table.map((r,i)=><tr key={r.team} style={{borderBottom:`1px solid ${C.border}22`,background:i<4?C.accentBg:"transparent"}}><td style={{...td,color:i<4?C.accent:C.textDim,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{i+1}</td><td style={{...td,textAlign:"left",color:C.text,fontWeight:500}}><div style={{display:"flex",alignItems:"center",gap:8}}><Badge team={r.team} size={22} badges={badges} />{r.team}</div></td><td style={td}>{r.p}</td><td style={{...td,color:C.success}}>{r.w}</td><td style={td}>{r.d}</td><td style={{...td,color:C.away}}>{r.l}</td><td style={td}>{r.gf}</td><td style={td}>{r.ga}</td><td style={{...td,color:r.gf-r.ga>=0?C.success:C.away,fontFamily:"'JetBrains Mono',monospace"}}>{r.gf-r.ga>0?"+":""}{r.gf-r.ga}</td><td style={{...td,color:C.accent,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{r.pts}</td></tr>)}</tbody></table></div>;};

// ═══ TEST CARD ═════════════════════════════════════════════════════
const TestCard=({title,h0,result,t})=>{const C=useTheme();if(!result)return null;return<div style={{padding:16,background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><h4 style={{margin:0,fontSize:13,color:C.text,fontWeight:600}}>{title}</h4><PBadge p={result.pValue} t={t} /></div><p style={{margin:"0 0 10px",fontSize:11,color:C.textDim,fontStyle:"italic"}}>{h0}</p><div style={{display:"flex",gap:16,fontSize:12,flexWrap:"wrap"}}><div><span style={{color:C.textDim}}>{t.test_statistic}: </span><span style={{color:C.text,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{result.statistic.toFixed(2)}</span></div><div><span style={{color:C.textDim}}>{t.test_df}: </span><span style={{color:C.text,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{result.df}</span></div><div><span style={{color:C.textDim}}>{t.test_pvalue}: </span><span style={{color:result.pValue<0.05?C.danger:C.success,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{result.pValue<0.001?"< 0.001":result.pValue.toFixed(4)}</span></div></div>{result.ratio!==undefined&&<div style={{marginTop:6,fontSize:12}}><span style={{color:C.textDim}}>{t.variance_mean_ratio}: </span><span style={{color:C.text,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{result.ratio.toFixed(3)}</span></div>}</div>;};

// ═══ MODEL FORMULAS (LaTeX) ════════════════════════════════════════
const MODEL_LATEX = {
  "Maher": [
    "\\lambda_{\\text{home}} = \\alpha_i \\cdot \\beta_j \\cdot e^{\\gamma}",
    "\\lambda_{\\text{away}} = \\alpha_j \\cdot \\beta_i",
    "X \\sim \\text{Poisson}(\\lambda_{\\text{home}}), \\quad Y \\sim \\text{Poisson}(\\lambda_{\\text{away}})",
    "P(X=x, Y=y) = \\frac{e^{-\\lambda_h}\\lambda_h^x}{x!} \\cdot \\frac{e^{-\\lambda_a}\\lambda_a^y}{y!}",
  ],
  "Dixon-Coles": [
    "P(X=x, Y=y) = \\tau(x,y,\\lambda_h,\\lambda_a,\\rho) \\cdot \\text{Pois}(x;\\lambda_h) \\cdot \\text{Pois}(y;\\lambda_a)",
    "\\tau(0,0) = 1 - \\lambda_h \\lambda_a \\rho",
    "\\tau(1,0) = 1 + \\lambda_a \\rho, \\quad \\tau(0,1) = 1 + \\lambda_h \\rho",
    "\\tau(1,1) = 1 - \\rho, \\quad \\tau(x,y) = 1 \\text{ otherwise}",
  ],
  "Dixon-Coles TD": [
    "w_i = e^{-\\xi(t_{\\text{now}} - t_i)}, \\quad \\xi > 0",
    "\\mathcal{L}(\\theta) = \\sum_{i=1}^{n} w_i \\cdot \\log P(x_i, y_i \\mid \\theta)",
    "\\text{Higher } \\xi \\Rightarrow \\text{ more weight on recent matches}",
  ],
  "Bivariate Poisson": [
    "X = X^* + Z, \\quad Y = Y^* + Z",
    "X^* \\sim \\text{Pois}(\\lambda_1), \\quad Y^* \\sim \\text{Pois}(\\lambda_2), \\quad Z \\sim \\text{Pois}(\\lambda_3)",
    "P(X=x,Y=y) = \\sum_{k=0}^{\\min(x,y)} \\frac{e^{-\\lambda_1}\\lambda_1^{x-k}}{(x-k)!} \\cdot \\frac{e^{-\\lambda_2}\\lambda_2^{y-k}}{(y-k)!} \\cdot \\frac{e^{-\\lambda_3}\\lambda_3^k}{k!}",
    "\\text{Cov}(X,Y) = \\lambda_3 \\geq 0",
  ],
  "Negative Binomial": [
    "X \\sim \\text{NegBin}(r, p), \\quad E[X] = \\frac{r(1-p)}{p}",
    "\\text{Var}(X) = \\frac{r(1-p)}{p^2} > E[X]",
    "P(X=k) = \\binom{k+r-1}{k} p^r (1-p)^k",
    "\\text{As } r \\to \\infty: \\text{NegBin} \\to \\text{Poisson}",
  ],
};

// ═══ MAIN APP ══════════════════════════════════════════════════════
export default function App() {
  const [lang,setLang]=useState("en");
  const [theme,setTheme]=useState("dark");
  const [data,setData]=useState(null);
  const [badges,setBadges]=useState({});
  const [tab,setTab]=useState("simulate");
  const [league,setLeague]=useState("E0");
  const [season,setSeason]=useState("");
  const [model,setModel]=useState("Maher");
  const [homeTeam,setHomeTeam]=useState("");
  const [awayTeam,setAwayTeam]=useState("");
  const [trainPct,setTrainPct]=useState(0.7);
  const [xi,setXi]=useState(0.005);
  const [matchResult,setMatchResult]=useState(null);
  const [simResult,setSimResult]=useState(null);
  const [katexLoaded,setKatexLoaded]=useState(false);

  const t=T[lang]; const C=themes[theme];

  // Load KaTeX CSS+JS
  useEffect(()=>{
    if(document.getElementById("katex-css"))return;
    const link=document.createElement("link");link.id="katex-css";link.rel="stylesheet";link.href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";document.head.appendChild(link);
    const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js";script.onload=()=>setKatexLoaded(true);document.head.appendChild(script);
  },[]);

  useEffect(()=>{loadMatchData().then(setData);loadBadges().then(setBadges);},[]);

  const leagueIds=useMemo(()=>data?getAvailableLeagues(data):[],[data]);
  const seasons=useMemo(()=>data?getSeasons(data,league):[],[data,league]);
  const matches=useMemo(()=>data?getMatches(data,league,season):[],[data,league,season]);
  const teams=useMemo(()=>data?getTeams(data,league,season):[],[data,league,season]);

  useEffect(()=>{if(seasons.length>0&&!seasons.includes(season))setSeason(seasons[0]);},[seasons]);
  useEffect(()=>{if(teams.length>=2){setHomeTeam(teams[0]);setAwayTeam(teams[1]);}setMatchResult(null);setSimResult(null);},[teams]);

  const realResult=useMemo(()=>(!homeTeam||!awayTeam||!matches.length)?null:findRealResult(matches,homeTeam,awayTeam),[matches,homeTeam,awayTeam]);

  const handlePredict=useCallback(()=>{if(!homeTeam||!awayTeam||homeTeam===awayTeam||!matches.length)return;const tN=Math.floor(matches.length*trainPct);const train=matches.slice(0,tN);const result=predictMatch(model,train,homeTeam,awayTeam,{xi,excludeMatch:{home:homeTeam,away:awayTeam}});setMatchResult(result);setSimResult(null);},[homeTeam,awayTeam,model,matches,trainPct,xi]);
  const handleSimulate=useCallback(()=>{if(!matchResult)return;setSimResult({hg:rpois(matchResult.lambdaH),ag:rpois(matchResult.lambdaA)});},[matchResult]);

  const actualTable=useMemo(()=>matches.length?computeTable(matches):[],[matches]);
  const predictedTable=useMemo(()=>{try{return matches.length&&teams.length?simulateLeague(matches,teams,model,trainPct,{xi}):[];}catch(e){console.error("simulateLeague error:",e);return[];}},[matches,teams,model,trainPct,xi]);

  const trainInfo=useMemo(()=>{const total=matches.length,n=Math.floor(total*trainPct);return{total,n,rest:total-n,pct:Math.round(trainPct*100)};},[matches,trainPct]);

  const assumption=useMemo(()=>{
    if(!matches.length)return null;
    const hW=matches.filter(m=>m.result==="H").length,dW=matches.filter(m=>m.result==="D").length,aW=matches.filter(m=>m.result==="A").length;
    const hg=matches.map(m=>m.hg),ag=matches.map(m=>m.ag);
    const mH=hg.reduce((a,b)=>a+b,0)/hg.length,mA=ag.reduce((a,b)=>a+b,0)/ag.length;
    const MG=6;const histH=Array(MG+1).fill(0),histA=Array(MG+1).fill(0);
    hg.forEach(g=>histH[Math.min(g,MG)]++);ag.forEach(g=>histA[Math.min(g,MG)]++);
    const pExpH=Array.from({length:MG+1},(_,k)=>k<MG?poissonPmf(k,mH)*hg.length:(1-Array.from({length:MG},(_,j)=>poissonPmf(j,mH)).reduce((a,b)=>a+b,0))*hg.length);
    const pExpA=Array.from({length:MG+1},(_,k)=>k<MG?poissonPmf(k,mA)*ag.length:(1-Array.from({length:MG},(_,j)=>poissonPmf(j,mA)).reduce((a,b)=>a+b,0))*ag.length);
    return{results:[{name:t.local,value:hW,color:C.home},{name:t.draw,value:dW,color:C.draw},{name:t.visitor,value:aW,color:C.away}],
      homeGoalDist:Array.from({length:MG+1},(_,i)=>({goals:i===MG?`${MG}+`:`${i}`,observed:histH[i],poisson:Math.round(pExpH[i]*10)/10})),
      awayGoalDist:Array.from({length:MG+1},(_,i)=>({goals:i===MG?`${MG}+`:`${i}`,observed:histA[i],poisson:Math.round(pExpA[i]*10)/10})),
      meanH:mH.toFixed(2),meanA:mA.toFixed(2),total:matches.length,
      gofHome:poissonGoodnessOfFitTest(hg),gofAway:poissonGoodnessOfFitTest(ag),indep:independenceTest(matches),dispHome:dispersionTest(hg),dispAway:dispersionTest(ag)};
  },[matches,t,C]);

  const probBars=matchResult?[{name:t.result_home,value:+(matchResult.pHome*100).toFixed(1),color:C.home},{name:t.result_draw,value:+(matchResult.pDraw*100).toFixed(1),color:C.draw},{name:t.result_away,value:+(matchResult.pAway*100).toFixed(1),color:C.away}]:[];

  if(!data)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" /><div style={{color:C.accent,fontSize:18,fontFamily:"'DM Sans',sans-serif"}}>⚽ {t.loading}</div></div>;

  return(
  <ThemeCtx.Provider value={C}>
  <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans',sans-serif",transition:"background .3s,color .3s"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" />

    {/* HEADER */}
    <header style={{padding:"20px 32px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <h1 style={{margin:0,fontSize:26,fontFamily:"'Instrument Serif',serif",fontWeight:400,color:C.accent}}>
          <span style={{marginRight:8}}>⚽</span>{t.title}
        </h1>
        <p style={{margin:"2px 0 0",fontSize:12,color:C.textDim}}>{t.subtitle}</p>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setTheme(th=>th==="dark"?"light":"dark")} style={{padding:"8px 14px",background:C.accentBg,border:`1px solid ${C.accent}30`,borderRadius:20,color:C.accent,fontSize:14,cursor:"pointer",lineHeight:1}}>{theme==="dark"?"☀️":"🌙"}</button>
        <button onClick={()=>setLang(l=>l==="en"?"es":"en")} style={{padding:"8px 14px",background:C.accentBg,border:`1px solid ${C.accent}30`,borderRadius:20,color:C.accent,fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:".1em"}}>{t.lang_toggle}</button>
      </div>
    </header>

    {/* NAV */}
    <nav style={{display:"flex",gap:4,padding:"0 32px",borderBottom:`1px solid ${C.border}`,background:C.card,overflowX:"auto"}}>
      {Object.entries(t.tabs).map(([k,v])=><TabBtn key={k} active={tab===k} onClick={()=>setTab(k)}>{v}</TabBtn>)}
    </nav>

    {/* CONTROLS */}
    <div style={{display:"flex",flexWrap:"wrap",gap:16,padding:"16px 32px",borderBottom:`1px solid ${C.border}`,alignItems:"flex-end"}}>
      <Sel label={t.league_label} value={league} onChange={setLeague} options={leagueIds.map(id=>({value:id,label:LEAGUES[id]?.[lang]||id}))} style={{minWidth:220}} />
      <Sel label={t.season_label} value={season} onChange={setSeason} options={seasons.map(s=>({value:s,label:s}))} style={{minWidth:130}} />
      <Sel label={t.model_label} value={model} onChange={setModel} options={MODEL_NAMES.map(m=>({value:m,label:m}))} style={{minWidth:180}} />
      <div style={{minWidth:160}}><Sli label={t.train_size} value={trainPct} onChange={setTrainPct} min={0.3} max={1} step={0.1} display={`${Math.round(trainPct*100)}%`} /></div>
      {model==="Dixon-Coles TD"&&<div style={{minWidth:160}}><Sli label={t.decay_param} value={xi} onChange={setXi} min={0.001} max={0.02} step={0.001} display={xi.toFixed(3)} /></div>}
    </div>
    <div style={{padding:"8px 32px",fontSize:11,color:C.textDim,background:C.cardAlt,borderBottom:`1px solid ${C.border}`}}>📊 {t.train_explain.replace("{pct}",trainInfo.pct).replace("{n}",trainInfo.n).replace("{total}",trainInfo.total).replace("{rest}",trainInfo.rest)}</div>

    {/* CONTENT */}
    <main style={{padding:"24px 32px",maxWidth:1400,margin:"0 auto"}}>

      {/* ─── MATCH SIMULATOR ─── */}
      {tab==="simulate"&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:16,alignItems:"end",padding:20,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
          <div><Sel label={t.home_team} value={homeTeam} onChange={setHomeTeam} options={teams.map(t=>({value:t,label:t}))} /><div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}><Badge team={homeTeam||"?"} size={32} badges={badges} /><span style={{fontSize:15,fontWeight:600,color:C.text}}>{homeTeam}</span></div></div>
          <span style={{fontSize:22,color:C.textDim,fontWeight:300,paddingBottom:28}}>vs</span>
          <div><Sel label={t.away_team} value={awayTeam} onChange={setAwayTeam} options={teams.filter(x=>x!==homeTeam).map(t=>({value:t,label:t}))} /><div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}><span style={{fontSize:15,fontWeight:600,color:C.text}}>{awayTeam}</span><Badge team={awayTeam||"?"} size={32} badges={badges} /></div></div>
        </div>

        {realResult&&<div style={{padding:"14px 20px",background:`${C.success}10`,borderRadius:10,border:`1px solid ${C.success}30`,display:"flex",alignItems:"center",justifyContent:"center",gap:16}}>
          <span style={{fontSize:12,color:C.success,textTransform:"uppercase",fontWeight:600,letterSpacing:".08em"}}>{t.real_result}:</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}><Badge team={homeTeam} size={24} badges={badges} /><span style={{fontSize:22,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:C.text}}>{realResult.hg} — {realResult.ag}</span><Badge team={awayTeam} size={24} badges={badges} /></div>
        </div>}

        <div style={{display:"flex",gap:12}}>
          <button onClick={handlePredict} style={{padding:"12px 28px",background:`linear-gradient(135deg,${C.accent},${C.accentDim})`,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{t.simulate_btn}</button>
          {matchResult&&<button onClick={handleSimulate} style={{padding:"12px 28px",background:`${C.away}18`,border:`1px solid ${C.away}40`,borderRadius:8,color:C.away,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{t.simulate_match_btn}</button>}
        </div>

        {simResult&&matchResult&&<div style={{padding:20,background:`linear-gradient(135deg,${C.accent}08,${C.away}08)`,borderRadius:12,border:`1px solid ${C.accent}25`,textAlign:"center"}}>
          <div style={{fontSize:11,color:C.textDim,marginBottom:6,textTransform:"uppercase",letterSpacing:".1em"}}>{t.sim_result}</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16}}><Badge team={homeTeam} size={36} badges={badges} /><span style={{fontSize:34,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:C.text}}>{simResult.hg} — {simResult.ag}</span><Badge team={awayTeam} size={36} badges={badges} /></div>
        </div>}

        {matchResult&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div style={{padding:20,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
            <h3 style={{margin:"0 0 4px",fontSize:13,color:C.textDim,textTransform:"uppercase",letterSpacing:".08em"}}>{t.probability} • {model}</h3>
            <div style={{display:"flex",gap:12,margin:"16px 0"}}>{probBars.map(d=><div key={d.name} style={{flex:1,textAlign:"center"}}><div style={{height:80,display:"flex",alignItems:"flex-end",justifyContent:"center"}}><div style={{width:"100%",height:`${Math.max(d.value,2)}%`,background:d.color,borderRadius:"6px 6px 0 0",transition:"height .5s"}} /></div><div style={{fontSize:22,fontWeight:700,color:d.color,fontFamily:"'JetBrains Mono',monospace",marginTop:8}}>{d.value}%</div><div style={{fontSize:11,color:C.textDim,marginTop:2}}>{d.name}</div></div>)}</div>
            <div style={{display:"flex",justifyContent:"space-around",padding:"12px 0",borderTop:`1px solid ${C.border}`,marginTop:12}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.textDim}}>{t.expected_goals}</div><div style={{fontSize:18,fontWeight:700,color:C.home,fontFamily:"'JetBrains Mono',monospace"}}>{matchResult.lambdaH.toFixed(2)}</div><div style={{fontSize:11,color:C.textDim}}>{homeTeam}</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.textDim}}>{t.most_likely}</div><div style={{fontSize:18,fontWeight:700,color:C.draw,fontFamily:"'JetBrains Mono',monospace"}}>{matchResult.mostLikely[0]} — {matchResult.mostLikely[1]}</div><div style={{fontSize:11,color:C.textDim}}>({(matchResult.mostLikelyProb*100).toFixed(1)}%)</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:11,color:C.textDim}}>{t.expected_goals}</div><div style={{fontSize:18,fontWeight:700,color:C.away,fontFamily:"'JetBrains Mono',monospace"}}>{matchResult.lambdaA.toFixed(2)}</div><div style={{fontSize:11,color:C.textDim}}>{awayTeam}</div></div>
            </div>
          </div>
          <div style={{padding:20,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
            <h3 style={{margin:"0 0 16px",fontSize:13,color:C.textDim,textTransform:"uppercase",letterSpacing:".08em"}}>{t.score_matrix}</h3>
            <ScoreMatrix matrix={matchResult.matrix} homeTeam={homeTeam} awayTeam={awayTeam} />
          </div>
        </div>}

        <div style={{padding:"14px 18px",background:C.accentBg,borderRadius:8,borderLeft:`3px solid ${C.accent}40`,fontSize:13,color:C.textDim,lineHeight:1.6}}><strong style={{color:C.accent}}>{model}:</strong> {t.model_descriptions[model]}</div>
      </div>}

      {/* ─── LEAGUE PREDICTOR ─── */}
      {tab==="league"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
        <div style={{padding:20,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}><h3 style={{margin:"0 0 16px",fontSize:14,color:C.accent,fontWeight:600}}>{t.predicted_table} — {model}</h3><LTable table={predictedTable} t={t} badges={badges} /></div>
        <div style={{padding:20,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}><h3 style={{margin:"0 0 16px",fontSize:14,color:C.textDim,fontWeight:600}}>{t.actual_table}</h3><LTable table={actualTable} t={t} badges={badges} /></div>
      </div>}

      {/* ─── ASSUMPTIONS ─── */}
      {tab==="assumptions"&&assumption&&<div style={{display:"flex",flexDirection:"column",gap:20}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>{assumption.results.map(r=><div key={r.name} style={{padding:20,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,textAlign:"center"}}><div style={{fontSize:32,fontWeight:700,color:r.color,fontFamily:"'JetBrains Mono',monospace"}}>{r.value}</div><div style={{fontSize:12,color:C.textDim,marginTop:2}}>{r.name}</div><div style={{fontSize:18,fontWeight:600,color:r.color,marginTop:6,fontFamily:"'JetBrains Mono',monospace"}}>{(r.value/assumption.total*100).toFixed(1)}%</div></div>)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {[{title:t.home_goals,dist:assumption.homeGoalDist,mean:assumption.meanH,color:C.home,colorDim:`${C.home}60`},{title:t.away_goals,dist:assumption.awayGoalDist,mean:assumption.meanA,color:C.away,colorDim:`${C.away}60`}].map((g,idx)=><div key={idx} style={{padding:16,background:C.card,borderRadius:12,border:`1px solid ${C.border}`}}>
            <h3 style={{margin:"0 0 2px",fontSize:13,color:g.color}}>{g.title}</h3><p style={{margin:"0 0 10px",fontSize:11,color:C.textDim}}>λ̂ = {g.mean}</p>
            <ResponsiveContainer width="100%" height={200}><BarChart data={g.dist} barGap={2}><XAxis dataKey="goals" tick={{fill:C.textDim,fontSize:12}} axisLine={{stroke:C.border}} tickLine={false} /><YAxis tick={{fill:C.textDim,fontSize:11}} axisLine={false} tickLine={false} /><Tooltip contentStyle={{background:C.tooltipBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12}} /><Bar dataKey="observed" fill={g.colorDim} radius={[4,4,0,0]} name={t.observed} /><Bar dataKey="poisson" fill={g.color} radius={[4,4,0,0]} name={t.poisson_expected} /><Legend wrapperStyle={{fontSize:11,color:C.textDim}} /></BarChart></ResponsiveContainer>
          </div>)}
        </div>
        <h3 style={{margin:"8px 0 0",fontSize:16,fontWeight:600,color:C.text}}>{t.hypothesis_tests} <span style={{fontSize:12,color:C.textDim,fontWeight:400}}>({t.alpha_level})</span></h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <TestCard title={`${t.gof_test} (${t.home_label})`} h0={t.gof_h0} result={assumption.gofHome} t={t} />
          <TestCard title={`${t.gof_test} (${t.away_label})`} h0={t.gof_h0} result={assumption.gofAway} t={t} />
          <TestCard title={`${t.disp_test} (${t.home_label})`} h0={t.disp_h0} result={assumption.dispHome} t={t} />
          <TestCard title={`${t.disp_test} (${t.away_label})`} h0={t.disp_h0} result={assumption.dispAway} t={t} />
        </div>
        <TestCard title={t.indep_test} h0={t.indep_h0} result={assumption.indep} t={t} />
      </div>}

      {/* ─── MODELS (with KaTeX) ─── */}
      {tab==="models"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
        {MODEL_NAMES.map(m=><div key={m} onClick={()=>setModel(m)} style={{padding:24,background:C.card,borderRadius:12,cursor:"pointer",transition:"all .2s",border:`1px solid ${model===m?C.accent+"60":C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{margin:0,fontSize:18,fontFamily:"'Instrument Serif',serif",color:model===m?C.accent:C.text}}>{m}</h3>
            {model===m&&<span style={{padding:"4px 12px",background:C.accentBg,borderRadius:12,fontSize:11,color:C.accent,fontWeight:600}}>{t.selected}</span>}
          </div>
          <p style={{margin:"8px 0 0",fontSize:14,color:C.textDim,lineHeight:1.6}}>{t.model_descriptions[m]}</p>
          <div style={{marginTop:14,padding:16,background:C.cardAlt,borderRadius:8,display:"flex",flexDirection:"column",gap:10}}>
            {katexLoaded && MODEL_LATEX[m]?.map((eq,i)=><div key={i} style={{overflowX:"auto"}}><Katex math={eq} display={true} /></div>)}
            {!katexLoaded && <div style={{fontSize:12,color:C.textMuted,fontFamily:"'JetBrains Mono',monospace"}}>Loading math...</div>}
          </div>
        </div>)}
      </div>}

    </main>
    <footer style={{padding:"14px 32px",borderTop:`1px solid ${C.border}`,textAlign:"center",fontSize:11,color:C.textMuted}}>{t.data_source} • {t.built_with} React + Recharts + KaTeX • {t.models_credit}</footer>
  </div>
  </ThemeCtx.Provider>);
}
