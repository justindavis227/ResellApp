import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://eavghdwdylutnqavucan.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhdmdoZHdkeWx1dG5xYXZ1Y2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzkxOTAsImV4cCI6MjA5MjExNTE5MH0.gbxL-47I24LCH7YgDBGVLDASYHI-IOCwOfyYXjtc8zw";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const IRS_RATE = 0.70;
const CATEGORIES = ["Switch","N64","GC","Wii","Wii U","GB","GBC","GBA","DS","3DS","SNES","NES","Genesis","Dreamcast","Gamegear","Master System","Saturn","PSVita","PSP","PS1","PS2","PS3","PS4","PS5","Xbox","Xbox 360","Xbox One","Xbox Series X","PC","Misc."];
const PURCHASE_LOCATIONS = ["FBMP","HPB","Goodwill","Game Store","Other"];
const DESIGNATIONS = ["C","CIB","CB","CI","B","BI","I","Sealed","—"];
const ITEM_TYPES = ["Video Game","Console","Controller","Game Accessory","Handheld","Strategy Guide","Collectible","Misc. Electronic","Misc."];
const SALE_PLATFORMS = ["FBMP","eBay","Paypal","Local In Person"];
const SHIP_PROVIDERS = ["USPS","Paypal","UPS","FedEx","—"];
const ADJUSTMENTS = ["—","Returned","Refund","Donated","Disposed","Stolen","Traded"];
const CHART_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const parseMoney = v => parseFloat(String(v||"").replace(/[$,]/g,""))||0;
const fmt = n => { if(isNaN(n)||n===null) return "$0.00"; return (n<0?"-$":"$")+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}); };
const getYear = d => { if(!d) return null; try { return new Date(d).getFullYear(); } catch { return null; } };
const getMonth = d => { if(!d) return null; try { return new Date(d).getMonth(); } catch { return null; } };
const itemKey = r => `${r.description}||${r.category}||${r.designation}||${r.purchaseDate}`;

// ─── DB CONVERTERS ───────────────────────────────────────────────────────────
const dbToItem = r => ({ id:r.id, description:r.description, purchaseDate:r.purchase_date||"", purchaseLocation:r.purchase_location||"", cost:r.cost||0, category:r.category||"", designation:r.designation||"", itemType:r.item_type||"", notes:r.notes||"", dateSold:r.date_sold||"", soldPrice:r.sold_price||0, platform:r.platform||"", fees:r.fees||0, promotedFees:r.promoted_fees||0, shippingProvider:r.shipping_provider||"", shippingCost:r.shipping_cost||0, adjustmentType:r.adjustment_type||"—", adjustmentAmount:r.adjustment_amount||0, netProfit:r.net_profit||0, adjustedNetProfit:r.adjusted_net_profit||0 });
const itemToDB = r => ({ id:r.id, description:r.description, purchase_date:r.purchaseDate||null, purchase_location:r.purchaseLocation||null, cost:r.cost||0, category:r.category||null, designation:r.designation||null, item_type:r.itemType||null, notes:r.notes||null, date_sold:r.dateSold||null, sold_price:r.soldPrice||0, platform:r.platform||null, fees:r.fees||0, promoted_fees:r.promotedFees||0, shipping_provider:r.shippingProvider||null, shipping_cost:r.shippingCost||0, adjustment_type:r.adjustmentType||null, adjustment_amount:r.adjustmentAmount||0, net_profit:r.netProfit||0, adjusted_net_profit:r.adjustedNetProfit||0 });
const dbToExpense = r => ({ id:r.id, description:r.description, date:r.date||"", amount:r.amount||0, notes:r.notes||"" });
const expenseToDB = r => ({ id:r.id, description:r.description, date:r.date||null, amount:r.amount||0, notes:r.notes||null });
const dbToMileage = r => ({ id:r.id, purpose:r.purpose, date:r.date||"", miles:r.miles||0, notes:r.notes||"" });
const mileageToDB = r => ({ id:r.id, purpose:r.purpose, date:r.date||null, miles:r.miles||0, notes:r.notes||null });

// ─── PARSER ──────────────────────────────────────────────────────────────────
function parsePasted(text) {
  const lines = text.trim().split("\n").filter(l=>l.trim());
  const dataLines = lines.filter(l => {
    const c = l.split("\t");
    if (!c[1] || !c[1].trim()) return false;
    const v = c[1].trim();
    if (v.includes("DO NOT")) return false;
    if (v === "Key") return false;
    if (v.includes("Item Description")) return false;
    if (v.includes("Purchase Date")) return false;
    if (v.includes("Sourced By")) return false;
    if (v.includes("Date Listed")) return false;
    return true;
  });
  return dataLines.map((line,i) => {
    const r = line.split("\t");
    const dateSold = r[20]?.trim()||"";
    const soldPrice = parseMoney(r[21]);
    const fees = parseMoney(r[23]);
    const promotedFees = parseMoney(r[24]);
    const shippingCost = parseMoney(r[26]);
    const cost = parseMoney(r[4]);
    const adjustmentAmount = parseMoney(r[28]);
    return {
      id: btoa(encodeURIComponent((r[1]?.trim()||"")+"||"+(r[2]?.trim()||"")+"||"+(r[6]?.trim()||"")+"||"+(r[8]?.trim()||"")+"||"+i)).replace(/[^a-zA-Z0-9]/g,"").slice(0,32),
      description:r[1]?.trim()||"", purchaseDate:r[2]?.trim()||"",
      purchaseLocation:r[3]?.trim()||"", cost, category:r[6]?.trim()||"",
      designation:r[8]?.trim()||"", itemType:r[11]?.trim()||"", notes:r[15]?.trim()||"",
      dateSold, soldPrice, platform:r[22]?.trim()||"", fees, promotedFees,
      shippingProvider:r[25]?.trim()||"", shippingCost, adjustmentAmount,
      adjustmentType:r[27]?.trim()||"—",
      netProfit:parseMoney(r[29]),
      adjustedNetProfit:parseMoney(r[30]),
    };
  }).filter(r=>r.description);
}

const DESIG_STYLES = {
  CIB:{l:{bg:"#dcfce7",c:"#15803d"},d:{bg:"#14532d",c:"#86efac"}},
  C:{l:{bg:"#dbeafe",c:"#1d4ed8"},d:{bg:"#1e3a5f",c:"#93c5fd"}},
  CB:{l:{bg:"#dbeafe",c:"#1d4ed8"},d:{bg:"#1e3a5f",c:"#93c5fd"}},
  Sealed:{l:{bg:"#fef3c7",c:"#b45309"},d:{bg:"#451a03",c:"#fcd34d"}},
};
const desigStyle = (d,dark) => {
  const s = DESIG_STYLES[d]||{l:{bg:"#f4f4f5",c:"#71717a"},d:{bg:"#27272a",c:"#a1a1aa"}};
  return dark ? s.d : s.l;
};

const makeTheme = dark => ({
  bg:dark?"#0f0f10":"#f4f4f5", surface:dark?"#1c1c1e":"#ffffff",
  surface2:dark?"#2c2c2e":"#f9f9f9", border:dark?"#3a3a3c":"#e4e4e7",
  text:dark?"#f2f2f7":"#18181b", text2:dark?"#aeaeb2":"#71717a",
  text3:dark?"#636366":"#a1a1aa", green:dark?"#34d399":"#16a34a",
  red:dark?"#f87171":"#dc2626", amber:dark?"#fbbf24":"#d97706",
  blue:dark?"#60a5fa":"#2563eb", purple:dark?"#c084fc":"#7c3aed",
  accent:dark?"#34d399":"#16a34a", accentBg:dark?"#064e3b":"#dcfce7",
  inp:dark?"#2c2c2e":"#f4f4f5", inpBorder:dark?"#48484a":"#d4d4d8",
  pill:dark?"#3a3a3c":"#f4f4f5", pillText:dark?"#aeaeb2":"#52525b",
  cardShadow:dark?"none":"0 1px 3px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04)",
});

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(()=>window.matchMedia?.("(prefers-color-scheme:dark)").matches??false);
  const [width, setWidth] = useState(()=>window.innerWidth);
  const isMobile = width < 768;
  const isTablet = width>=768&&width<1100;

  useEffect(()=>{
    const mq=window.matchMedia("(prefers-color-scheme:dark)");
    const h=e=>setDark(e.matches); mq.addEventListener("change",h);
    return ()=>mq.removeEventListener("change",h);
  },[]);
  useEffect(()=>{
    const h=()=>setWidth(window.innerWidth);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);

  const T = useMemo(()=>makeTheme(dark),[dark]);

  // ── Data ──
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [mileage, setMileage] = useState([]);
  const [marketValues, setMarketValues] = useState({});
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  useEffect(()=>{
    async function loadAll() {
      setDbLoading(true);
      try {
        const [{ data:iRows }, { data:eRows }, { data:mRows }, { data:mvRows }] = await Promise.all([
          supabase.from("items").select("*"),
          supabase.from("expenses").select("*"),
          supabase.from("mileage").select("*"),
          supabase.from("market_values").select("*"),
        ]);
        setItems((iRows||[]).map(dbToItem));
        setExpenses((eRows||[]).map(dbToExpense));
        setMileage((mRows||[]).map(dbToMileage));
        const mv = {};
        (mvRows||[]).forEach(r=>{ mv[r.item_key]={value:r.value,condition:r.condition,updated:r.updated_at}; });
        setMarketValues(mv);
        setDbError(null);
      } catch(e) {
        setDbError(e.message);
      }
      setDbLoading(false);
    }
    loadAll();
  },[]);

  // ── UI state ──
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showMarkSold, setShowMarkSold] = useState(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddMileage, setShowAddMileage] = useState(false);
  const [showLot, setShowLot] = useState(false);
  const [showYearClose, setShowYearClose] = useState(false);
  const [lotItems, setLotItems] = useState([]);
  const [lotSearch, setLotSearch] = useState("");
  const [lotResults, setLotResults] = useState([]);
  const [lotLoading, setLotLoading] = useState(false);
  const [lotOffer, setLotOffer] = useState("");
  const [lotName, setLotName] = useState("");
  const [lotDate, setLotDate] = useState(()=>new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}));
  const [lotLocation, setLotLocation] = useState("FBMP");
  const [fetchingKey, setFetchingKey] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({current:0,total:0});

  const showToast = useCallback((msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),4000); },[]);

  // ── Derived ──
  const inventory = useMemo(()=>items.filter(r=>!r.dateSold),[items]);
  const soldItems = useMemo(()=>items.filter(r=>r.dateSold),[items]);
  const soldThisYear = useMemo(()=>soldItems.filter(r=>getYear(r.dateSold)===yearFilter),[soldItems,yearFilter]);
  const expensesThisYear = useMemo(()=>expenses.filter(e=>getYear(e.date)===yearFilter),[expenses,yearFilter]);
  const mileageThisYear = useMemo(()=>mileage.filter(m=>getYear(m.date)===yearFilter),[mileage,yearFilter]);

  const availableYears = useMemo(()=>{
    const ys=new Set([new Date().getFullYear()]);
    soldItems.forEach(r=>{const y=getYear(r.dateSold);if(y)ys.add(y);});
    expenses.forEach(e=>{const y=getYear(e.date);if(y)ys.add(y);});
    mileage.forEach(m=>{const y=getYear(m.date);if(y)ys.add(y);});
    return [...ys].sort((a,b)=>b-a);
  },[soldItems,expenses,mileage]);

  const totalNetProfit = useMemo(()=>soldThisYear.reduce((s,r)=>s+(r.netProfit||0),0),[soldThisYear]);
  const totalFees = useMemo(()=>soldThisYear.reduce((s,r)=>s+(r.fees||0)+(r.promotedFees||0),0),[soldThisYear]);
  const totalShipping = useMemo(()=>soldThisYear.reduce((s,r)=>s+(r.shippingCost||0),0),[soldThisYear]);
  const totalExpenses = useMemo(()=>expensesThisYear.reduce((s,e)=>s+(e.amount||0),0),[expensesThisYear]);
  const totalMiles = useMemo(()=>mileageThisYear.reduce((s,m)=>s+(m.miles||0),0),[mileageThisYear]);
  const mileageDeduction = totalMiles * IRS_RATE;
  const unsoldCapital = useMemo(()=>inventory.reduce((s,r)=>s+(r.cost||0),0),[inventory]);
  const potentialProfit = useMemo(()=>inventory.reduce((s,r)=>{const mv=marketValues[itemKey(r)];return mv?.value?s+(mv.value-(r.cost||0)):s;},0),[inventory,marketValues]);
  const itemsWithMV = useMemo(()=>inventory.filter(r=>marketValues[itemKey(r)]).length,[inventory,marketValues]);

  // ── Chart data ──
  const monthlyData = useMemo(()=>{
    const map={};
    MONTHS.forEach((m,i)=>{map[i]={month:m,sales:0,revenue:0,netProfit:0};});
    soldThisYear.forEach(r=>{const mo=getMonth(r.dateSold);if(mo!==null){map[mo].sales++;map[mo].revenue+=r.soldPrice||0;map[mo].netProfit+=r.netProfit||0;}});
    return Object.values(map);
  },[soldThisYear]);

  const platformData = useMemo(()=>{
    const map={};
    soldThisYear.forEach(r=>{const p=r.platform||"Unknown";if(!map[p])map[p]={platform:p,sales:0,revenue:0};map[p].sales++;map[p].revenue+=r.soldPrice||0;});
    return Object.values(map).map(d=>({...d,avgSale:d.sales?d.revenue/d.sales:0})).sort((a,b)=>b.revenue-a.revenue);
  },[soldThisYear]);

  const categoryInventoryData = useMemo(()=>{
    const map={};
    inventory.forEach(r=>{const c=r.category||"Unknown";if(!map[c])map[c]={category:c,count:0,capital:0};map[c].count++;map[c].capital+=r.cost||0;});
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,12);
  },[inventory]);

  const categoryProfitData = useMemo(()=>{
    const map={};
    soldThisYear.forEach(r=>{const c=r.category||"Unknown";if(!map[c])map[c]={category:c,count:0,totalProfit:0};map[c].count++;map[c].totalProfit+=r.netProfit||0;});
    return Object.values(map).map(d=>({...d,avgProfit:d.count?d.totalProfit/d.count:0})).sort((a,b)=>b.totalProfit-a.totalProfit).slice(0,10);
  },[soldThisYear]);

  const topItemsData = useMemo(()=>[...soldThisYear].sort((a,b)=>(b.netProfit||0)-(a.netProfit||0)).slice(0,10),[soldThisYear]);

  const filteredInventory = useMemo(()=>inventory.filter(r=>(!search||r.description.toLowerCase().includes(search.toLowerCase()))&&(filterCat==="All"||r.category===filterCat)&&(filterType==="All"||r.itemType===filterType)),[inventory,search,filterCat,filterType]);
  const filteredSold = useMemo(()=>soldItems.filter(r=>(!search||r.description.toLowerCase().includes(search.toLowerCase()))&&(filterCat==="All"||r.category===filterCat)),[soldItems,search,filterCat]);

  // ── Actions ──
  async function handlePaste(text) {
    try {
      const parsed = parsePasted(text);
      if(!parsed.length) { showToast("No data found — make sure you copied the full sheet","error"); return; }
      setItems(parsed);
      showToast(`Parsed ${parsed.length} items, saving to database...`);
      const dbRows = parsed.map(itemToDB);
      const CHUNK = 50;
      for(let i=0;i<dbRows.length;i+=CHUNK) {
        const { error } = await supabase.from("items").upsert(dbRows.slice(i,i+CHUNK), {onConflict:"id"});
        if(error) { showToast("DB error: "+error.message,"error"); return; }
      }
      showToast(`${parsed.length} items saved to database!`);
      setShowPaste(false);
    } catch(e) { showToast("Error: "+e.message,"error"); }
  }

  async function addItem(form) {
    const item = { id:uid(), ...form, cost:parseMoney(form.cost), dateSold:"", soldPrice:0, platform:"", fees:0, promotedFees:0, shippingProvider:"", shippingCost:0, adjustmentType:"—", adjustmentAmount:0, netProfit:0, adjustedNetProfit:0 };
    const { error } = await supabase.from("items").upsert(itemToDB(item));
    if(error) { showToast("Error saving: "+error.message,"error"); return; }
    setItems(p=>[...p,item]);
    showToast("Item added to inventory");
    setShowAddItem(false);
  }

  async function markSold(id, form) {
    const soldPrice=parseMoney(form.soldPrice), fees=parseMoney(form.fees), promotedFees=parseMoney(form.promotedFees), shippingCost=parseMoney(form.shippingCost), adjustmentAmount=parseMoney(form.adjustmentAmount);
    let updated;
    setItems(p=>p.map(r=>{
      if(r.id!==id) return r;
      const netProfit=soldPrice-(r.cost||0)-fees-promotedFees-shippingCost;
      updated={...r,...form,soldPrice,fees,promotedFees,shippingCost,adjustmentAmount,netProfit,adjustedNetProfit:netProfit-adjustmentAmount};
      return updated;
    }));
    if(updated) {
      const { error } = await supabase.from("items").upsert(itemToDB(updated));
      if(error) showToast("Error saving: "+error.message,"error");
    }
    showToast("Item marked as sold!");
    setShowMarkSold(null);
  }

  async function deleteItem(id) {
    if(!confirm("Delete this item?")) return;
    const { error } = await supabase.from("items").delete().eq("id",id);
    if(error) { showToast("Error: "+error.message,"error"); return; }
    setItems(p=>p.filter(r=>r.id!==id));
    showToast("Item deleted");
  }

  async function addExpense(form) {
    const exp = {id:uid(),...form,amount:parseMoney(form.amount)};
    const { error } = await supabase.from("expenses").upsert(expenseToDB(exp));
    if(error) { showToast("Error: "+error.message,"error"); return; }
    setExpenses(p=>[...p,exp]);
    showToast("Expense added");
    setShowAddExpense(false);
  }

  async function deleteExpense(id) {
    await supabase.from("expenses").delete().eq("id",id);
    setExpenses(p=>p.filter(e=>e.id!==id));
    showToast("Expense deleted");
  }

  async function addMileage(form) {
    const mil = {id:uid(),...form,miles:parseFloat(form.miles)||0};
    const { error } = await supabase.from("mileage").upsert(mileageToDB(mil));
    if(error) { showToast("Error: "+error.message,"error"); return; }
    setMileage(p=>[...p,mil]);
    showToast("Mileage logged");
    setShowAddMileage(false);
  }

  async function deleteMileage(id) {
    await supabase.from("mileage").delete().eq("id",id);
    setMileage(p=>p.filter(m=>m.id!==id));
    showToast("Entry deleted");
  }

  async function yearEndClose() {
    const unsold=inventory.filter(r=>!r.dateSold);
    if(!unsold.length){showToast("No unsold inventory to close");return;}
    const totalCOGs=unsold.reduce((s,r)=>s+(r.cost||0),0);
    const exp={id:uid(),description:`Year-end inventory write-off (${yearFilter})`,date:`12/31/${yearFilter}`,amount:totalCOGs,notes:`${unsold.length} items written off`};
    await supabase.from("expenses").upsert(expenseToDB(exp));
    setExpenses(p=>[...p,exp]);
    const zeroed=unsold.map(r=>({...r,cost:0,netProfit:0,adjustedNetProfit:0}));
    for(const r of zeroed) await supabase.from("items").upsert(itemToDB(r));
    setItems(p=>p.map(r=>r.dateSold?r:{...r,cost:0,netProfit:0,adjustedNetProfit:0}));
    showToast(`Closed ${yearFilter}: ${unsold.length} items written off at ${fmt(totalCOGs)}`);
    setShowYearClose(false);
  }

  async function fetchMarketValue(row) {
    const key=itemKey(row);
    setFetchingKey(key);
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Search PriceCharting.com for the current market value of: "${row.description} ${row.category}" (condition: ${row.designation}). Return ONLY a JSON object, no markdown: {"loose":12.50,"cib":25.00,"new":45.00}. Use null for unavailable prices.`}]})});
      const data=await res.json();
      const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const match=text.replace(/```json|```/g,"").match(/\{[\s\S]*?\}/);
      if(!match) throw new Error("No price found");
      const prices=JSON.parse(match[0]);
      let price=null,priceType="";
      if(row.designation==="Sealed"&&prices.new){price=prices.new;priceType="New";}
      else if((row.designation==="CIB"||row.designation==="CB")&&prices.cib){price=prices.cib;priceType="CIB";}
      else if(prices.loose){price=prices.loose;priceType="Loose";}
      else if(prices.cib){price=prices.cib;priceType="CIB";}
      else if(prices.new){price=prices.new;priceType="New";}
      if(price===null){showToast(`No price for "${row.description.slice(0,25)}"`,"error");return null;}
      const mv={value:price,condition:priceType,updated:Date.now()};
      setMarketValues(m=>({...m,[key]:mv}));
      await supabase.from("market_values").upsert({item_key:key,value:price,condition:priceType,updated_at:new Date().toISOString()},{onConflict:"item_key"});
      return price;
    } catch(e){showToast("Fetch failed: "+e.message,"error");return null;}
    finally{setFetchingKey(null);}
  }

  async function refreshAllMV() {
    const targets=inventory.filter(r=>!marketValues[itemKey(r)]);
    if(!targets.length){showToast("All items have market values");return;}
    if(!confirm(`Fetch market values for ${targets.length} items? (~${Math.ceil(targets.length*3/60)} min)`)) return;
    setRefreshingAll(true);
    for(let i=0;i<targets.length;i++){
      setRefreshProgress({current:i+1,total:targets.length});
      await fetchMarketValue(targets[i]);
      await new Promise(r=>setTimeout(r,800));
    }
    setRefreshingAll(false);
    showToast("All market values refreshed!");
  }

  async function handleLotSearch() {
    if(!lotSearch.trim()) return;
    setLotLoading(true); setLotResults([]);
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2000,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Search PriceCharting for "${lotSearch}" prices. Return ONLY a JSON array, no markdown: [{"name":"Title","console":"NES","loosePrice":"12.50","cibPrice":"25.00"}]. Up to 6 results. null for missing.`}]})});
      const data=await res.json();
      const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
      const match=text.replace(/```json|```/g,"").match(/\[[\s\S]*?\]/);
      if(match) setLotResults(JSON.parse(match[0]).slice(0,6));
    } catch{showToast("Search failed","error");}
    setLotLoading(false);
  }

  function addToLot(item,cond) {
    const price=cond==="CIB"?parseFloat(item.cibPrice||0):parseFloat(item.loosePrice||0);
    const cat=CATEGORIES.find(c=>c.toLowerCase()===item.console?.toLowerCase())||"";
    setLotItems(p=>[...p,{id:uid(),description:item.name,category:cat,designation:cond,itemType:"Video Game",price}]);
    setLotResults([]); setLotSearch(""); showToast(`Added ${item.name.slice(0,30)}`);
  }

  const lotTotal=useMemo(()=>lotItems.reduce((s,i)=>s+(parseFloat(i.price)||0),0),[lotItems]);
  const lotProfit=lotOffer?lotTotal-parseFloat(lotOffer):null;

  async function addLotToInventory() {
    const today=lotDate||new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const newItems=lotItems.map(item=>({id:uid(),description:item.description,purchaseDate:today,purchaseLocation:lotLocation,cost:parseFloat(item.price)||0,category:item.category,designation:item.designation,itemType:item.itemType,notes:lotName||"",dateSold:"",soldPrice:0,platform:"",fees:0,promotedFees:0,shippingProvider:"",shippingCost:0,adjustmentType:"—",adjustmentAmount:0,netProfit:0,adjustedNetProfit:0}));
    const { error } = await supabase.from("items").upsert(newItems.map(itemToDB));
    if(error) { showToast("Error saving lot: "+error.message,"error"); return; }
    setItems(p=>[...p,...newItems]);
    showToast(`${newItems.length} items added to inventory`);
    setLotItems([]); setLotName(""); setLotOffer(""); setShowLot(false);
  }

  function exportCSV(data, filename, headers) {
    const rows=data.map(r=>headers.map(h=>JSON.stringify(r[h.key]??"")||"").join(","));
    const csv=[headers.map(h=>h.label).join(","),...rows].join("\n");
    const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv); a.download=filename; a.click();
  }

  // ── Style helpers ──
  const card={background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,boxShadow:T.cardShadow,overflow:"hidden"};
  const inp={background:T.inp,border:`1px solid ${T.inpBorder}`,color:T.text,padding:"10px 12px",borderRadius:8,fontSize:14,width:"100%",outline:"none",fontFamily:"inherit",minHeight:isMobile?44:38};
  const lbl={fontSize:11,fontWeight:600,color:T.text2,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5,display:"block"};
  const thS={padding:"10px 14px",textAlign:"left",fontSize:11,color:T.text3,textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:600,whiteSpace:"nowrap",background:T.surface2,borderBottom:`1px solid ${T.border}`};
  const tdS={padding:"11px 14px",fontSize:13.5,color:T.text,whiteSpace:"nowrap",overflow:"hidden"};
  const cpx=isMobile?12:20;

  const BtnPrimary=({children,onClick,disabled,style={},type})=>(
    <button type={type} onClick={onClick} disabled={disabled} style={{background:T.text,color:T.surface,border:"none",padding:isMobile?"11px 18px":"9px 16px",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontSize:14,fontWeight:600,opacity:disabled?0.5:1,fontFamily:"inherit",minHeight:isMobile?44:38,...style}}>{children}</button>
  );
  const BtnGhost=({children,onClick,style={},disabled})=>(
    <button onClick={onClick} disabled={disabled} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.text2,padding:"8px 12px",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontSize:13,fontWeight:500,fontFamily:"inherit",minHeight:isMobile?40:36,opacity:disabled?0.5:1,...style}}>{children}</button>
  );
  const BtnSmall=({children,onClick,color,bg,style={}})=>(
    <button onClick={onClick} style={{background:bg||T.accentBg,border:"none",color:color||T.accent,padding:"3px 9px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit",...style}}>{children}</button>
  );
  const StatCard=({label,value,sub,color,small})=>(
    <div style={{...card,padding:isMobile?"12px 14px":"16px 18px"}}>
      <div style={{fontSize:isMobile?10:11,fontWeight:600,color:T.text3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:isMobile?4:8}}>{label}</div>
      <div style={{fontSize:small?(isMobile?16:20):(isMobile?20:26),fontWeight:700,color:color||T.text,letterSpacing:"-0.02em",lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.text3,marginTop:4}}>{sub}</div>}
    </div>
  );

  const ChartTip=({active,payload,label})=>{
    if(!active||!payload?.length) return null;
    return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:12}}>
      <div style={{fontWeight:600,marginBottom:4,color:T.text}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{color:p.color}}>{p.name}: <strong>{fmt(p.value)}</strong></div>)}
    </div>;
  };

  const Modal=({title,onClose,children,wide})=>(
    <div style={{position:"fixed",inset:0,background:`rgba(0,0,0,${dark?0.65:0.4})`,backdropFilter:"blur(6px)",zIndex:50,display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?0:20}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{...card,width:"100%",maxWidth:wide?680:480,padding:isMobile?18:24,borderRadius:isMobile?"16px 16px 0 0":12,maxHeight:isMobile?"90vh":"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:16,fontWeight:700,color:T.text}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.text2,fontSize:22,cursor:"pointer",lineHeight:1,padding:0}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );

  const MVCell=({r})=>{
    const key=itemKey(r);
    const mv=marketValues[key];
    const loading=fetchingKey===key;
    if(loading) return <span style={{color:T.text3,fontSize:12}}>Loading…</span>;
    if(mv){
      const profit=mv.value-(r.cost||0);
      return <div style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12}}>
        <span style={{fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{fmt(mv.value)}</span>
        <span style={{color:profit>=0?T.green:T.red,fontSize:10,fontWeight:600}}>({profit>=0?"+":""}{fmt(profit)})</span>
        <button onClick={()=>fetchMarketValue(r)} title="Refresh" style={{background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:11,padding:1}}>↻</button>
        <button onClick={async()=>{setMarketValues(m=>{const n={...m};delete n[key];return n;});await supabase.from("market_values").delete().eq("item_key",key);}} title="Clear" style={{background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:11,padding:1}}>×</button>
      </div>;
    }
    return <BtnSmall onClick={()=>fetchMarketValue(r)}>Fetch</BtnSmall>;
  };

  // ── Paste Modal ──
  const PasteModalContent=()=>{
    const [pasteTab,setPasteTab]=useState("inventory");
    const [text,setText]=useState("");
    const [saving,setSaving]=useState(false);
    const today=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});

    function parseExpensePaste(raw){
      return raw.trim().split("\n").filter(l=>l.trim()).map(line=>{
        const r=line.split("\t");
        return {id:uid(),description:r[0]?.trim()||"",date:r[1]?.trim()||today,amount:parseMoney(r[2]||"0"),notes:r[3]?.trim()||""};
      }).filter(e=>e.description&&e.amount>0);
    }
    function parseMileagePaste(raw){
      return raw.trim().split("\n").filter(l=>l.trim()).map(line=>{
        const r=line.split("\t");
        return {id:uid(),date:r[0]?.trim()||today,purpose:r[1]?.trim()||"",miles:parseFloat(r[2])||0,notes:r[3]?.trim()||""};
      }).filter(e=>e.purpose&&e.miles>0);
    }

    async function handleSubmit(){
      if(!text.trim()){showToast("Nothing pasted","error");return;}
      setSaving(true);
      try {
        if(pasteTab==="inventory"){
          await handlePaste(text);
        } else if(pasteTab==="expenses"){
          const parsed=parseExpensePaste(text);
          if(!parsed.length){showToast("No expense data found","error");setSaving(false);return;}
          const {error}=await supabase.from("expenses").upsert(parsed.map(expenseToDB),{onConflict:"id"});
          if(error){showToast("DB error: "+error.message,"error");setSaving(false);return;}
          setExpenses(p=>[...p,...parsed]);
          showToast("Loaded "+parsed.length+" expenses");
          setShowPaste(false);
        } else if(pasteTab==="mileage"){
          const parsed=parseMileagePaste(text);
          if(!parsed.length){showToast("No mileage data found","error");setSaving(false);return;}
          const {error}=await supabase.from("mileage").upsert(parsed.map(mileageToDB),{onConflict:"id"});
          if(error){showToast("DB error: "+error.message,"error");setSaving(false);return;}
          setMileage(p=>[...p,...parsed]);
          showToast("Loaded "+parsed.length+" trips");
          setShowPaste(false);
        }
      } catch(e){showToast("Error: "+e.message,"error");}
      setSaving(false);
    }

    const tabs=[{id:"inventory",label:"Inventory Sheet"},{id:"expenses",label:"Expense Log"},{id:"mileage",label:"Mileage Log"}];
    const hints={inventory:"Select all (Ctrl+A) in Google Sheets, copy, paste here.",expenses:"Columns: Description | Date | Amount | Notes",mileage:"Columns: Date | Purpose | Miles | Notes"};
    return (
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:3,background:T.surface2,borderRadius:8,padding:3}}>
          {tabs.map(t=><button key={t.id} onClick={()=>{setPasteTab(t.id);setText("");}} style={{flex:1,padding:"6px 4px",borderRadius:6,border:"none",background:pasteTab===t.id?T.surface:"transparent",color:pasteTab===t.id?T.text:T.text3,fontWeight:pasteTab===t.id?600:400,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{t.label}</button>)}
        </div>
        <p style={{fontSize:12,color:T.text2,lineHeight:1.6,padding:"8px 12px",background:T.surface2,borderRadius:8}}>{hints[pasteTab]}</p>
        <textarea style={{...inp,resize:"vertical",fontSize:12,minHeight:160}} rows={8} placeholder="Paste data here..." value={text} onChange={e=>setText(e.target.value)}/>
        <div style={{display:"flex",gap:8}}>
          <BtnPrimary onClick={handleSubmit} disabled={saving} style={{flex:1,padding:"10px"}}>{saving?"Saving...":"Load Data"}</BtnPrimary>
          <BtnGhost onClick={()=>setShowPaste(false)} disabled={saving}>Cancel</BtnGhost>
        </div>
      </div>
    );
  };

  // ── Add Item Form ──
  const AddItemForm=()=>{
    const today=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const [f,setF]=useState({description:"",purchaseDate:today,purchaseLocation:"FBMP",cost:"",category:"",designation:"CIB",itemType:"Video Game",notes:""});
    const set=k=>v=>setF(p=>({...p,[k]:v}));
    return(
      <form onSubmit={e=>{e.preventDefault();addItem(f);}}>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lbl}>Item Description *</label><input style={inp} required value={f.description} onChange={e=>set("description")(e.target.value)} placeholder="e.g. Pokemon Red"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lbl}>Purchase Date</label><input style={inp} value={f.purchaseDate} onChange={e=>set("purchaseDate")(e.target.value)} placeholder="MM/DD/YYYY"/></div>
            <div><label style={lbl}>Cost of Goods</label><input style={inp} type="number" step="0.01" value={f.cost} onChange={e=>set("cost")(e.target.value)} placeholder="0.00"/></div>
          </div>
          <div><label style={lbl}>Purchase Location</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {PURCHASE_LOCATIONS.map(p=><button key={p} type="button" onClick={()=>set("purchaseLocation")(p)} style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${f.purchaseLocation===p?T.accent:T.border}`,background:f.purchaseLocation===p?T.accentBg:"transparent",color:f.purchaseLocation===p?T.accent:T.text2,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{p}</button>)}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lbl}>Category</label><select style={inp} value={f.category} onChange={e=>set("category")(e.target.value)}><option value="">Select…</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label style={lbl}>Item Type</label><select style={inp} value={f.itemType} onChange={e=>set("itemType")(e.target.value)}>{ITEM_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          </div>
          <div><label style={lbl}>Condition</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {DESIGNATIONS.map(d=><button key={d} type="button" onClick={()=>set("designation")(d)} style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${f.designation===d?T.accent:T.border}`,background:f.designation===d?T.accentBg:"transparent",color:f.designation===d?T.accent:T.text2,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{d}</button>)}
            </div>
          </div>
          <div><label style={lbl}>Notes</label><textarea style={{...inp,resize:"vertical",minHeight:70}} value={f.notes} onChange={e=>set("notes")(e.target.value)} placeholder="Optional…"/></div>
          <BtnPrimary type="submit" style={{width:"100%",padding:"12px"}}>Add to Inventory</BtnPrimary>
        </div>
      </form>
    );
  };

  // ── Mark Sold Form ──
  const MarkSoldForm=({item})=>{
    const today=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const [f,setF]=useState({dateSold:today,soldPrice:"",platform:"FBMP",fees:"",promotedFees:"",shippingProvider:"USPS",shippingCost:"",adjustmentType:"—",adjustmentAmount:""});
    const set=k=>v=>setF(p=>({...p,[k]:v}));
    const sp=parseMoney(f.soldPrice),fe=parseMoney(f.fees),pf=parseMoney(f.promotedFees),sc=parseMoney(f.shippingCost),adj=parseMoney(f.adjustmentAmount);
    const net=sp-(item.cost||0)-fe-pf-sc;
    return(
      <div style={{display:"grid",gap:12}}>
        <div style={{fontSize:13,color:T.text2,padding:"8px 12px",background:T.surface2,borderRadius:8}}><strong style={{color:T.text}}>{item.description}</strong> · {item.category} · Cost: {fmt(item.cost)}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={lbl}>Date Sold</label><input style={inp} value={f.dateSold} onChange={e=>set("dateSold")(e.target.value)} placeholder="MM/DD/YYYY"/></div>
          <div><label style={lbl}>Sold Price</label><input style={inp} type="number" step="0.01" value={f.soldPrice} onChange={e=>set("soldPrice")(e.target.value)} placeholder="0.00"/></div>
        </div>
        <div><label style={lbl}>Platform Sold</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {SALE_PLATFORMS.map(p=><button key={p} onClick={()=>set("platform")(p)} style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${f.platform===p?T.accent:T.border}`,background:f.platform===p?T.accentBg:"transparent",color:f.platform===p?T.accent:T.text2,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{p}</button>)}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={lbl}>Fees</label><input style={inp} type="number" step="0.01" value={f.fees} onChange={e=>set("fees")(e.target.value)} placeholder="0.00"/></div>
          <div><label style={lbl}>Promoted Fees</label><input style={inp} type="number" step="0.01" value={f.promotedFees} onChange={e=>set("promotedFees")(e.target.value)} placeholder="0.00"/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={lbl}>Shipping Provider</label><select style={inp} value={f.shippingProvider} onChange={e=>set("shippingProvider")(e.target.value)}>{SHIP_PROVIDERS.map(p=><option key={p}>{p}</option>)}</select></div>
          <div><label style={lbl}>Shipping Cost</label><input style={inp} type="number" step="0.01" value={f.shippingCost} onChange={e=>set("shippingCost")(e.target.value)} placeholder="0.00"/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><label style={lbl}>Adjustment</label><select style={inp} value={f.adjustmentType} onChange={e=>set("adjustmentType")(e.target.value)}>{ADJUSTMENTS.map(a=><option key={a}>{a}</option>)}</select></div>
          <div><label style={lbl}>Adjustment Amount</label><input style={inp} type="number" step="0.01" value={f.adjustmentAmount} onChange={e=>set("adjustmentAmount")(e.target.value)} placeholder="0.00"/></div>
        </div>
        <div style={{...card,padding:14,background:T.surface2}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}><span style={{color:T.text2}}>Net Profit</span><span style={{fontWeight:700,color:net>=0?T.green:T.red,fontVariantNumeric:"tabular-nums"}}>{fmt(net)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:T.text2}}>Adjusted Net Profit</span><span style={{fontWeight:700,color:(net-adj)>=0?T.green:T.red,fontVariantNumeric:"tabular-nums"}}>{fmt(net-adj)}</span></div>
        </div>
        <BtnPrimary onClick={()=>markSold(item.id,f)} style={{width:"100%",padding:"12px"}}>Confirm Sale</BtnPrimary>
      </div>
    );
  };

  // ── Expense Form ──
  const ExpenseForm=()=>{
    const today=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const [f,setF]=useState({description:"",date:today,amount:"",notes:""});
    const set=k=>v=>setF(p=>({...p,[k]:v}));
    return(
      <form onSubmit={e=>{e.preventDefault();addExpense(f);}}>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lbl}>Description *</label><input style={inp} required value={f.description} onChange={e=>set("description")(e.target.value)} placeholder="e.g. Packing supplies"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lbl}>Date</label><input style={inp} value={f.date} onChange={e=>set("date")(e.target.value)} placeholder="MM/DD/YYYY"/></div>
            <div><label style={lbl}>Amount *</label><input style={inp} type="number" step="0.01" required value={f.amount} onChange={e=>set("amount")(e.target.value)} placeholder="0.00"/></div>
          </div>
          <div><label style={lbl}>Notes</label><textarea style={{...inp,resize:"vertical",minHeight:60}} value={f.notes} onChange={e=>set("notes")(e.target.value)} placeholder="Optional…"/></div>
          <div style={{display:"flex",gap:8}}>
            <BtnPrimary type="submit" style={{flex:1,padding:"11px"}}>Add Expense</BtnPrimary>
            <BtnGhost onClick={()=>setShowAddExpense(false)}>Cancel</BtnGhost>
          </div>
        </div>
      </form>
    );
  };

  // ── Mileage Form ──
  const MileageForm=()=>{
    const today=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const [f,setF]=useState({purpose:"",date:today,miles:"",notes:""});
    const set=k=>v=>setF(p=>({...p,[k]:v}));
    const est=(parseFloat(f.miles)||0)*IRS_RATE;
    return(
      <form onSubmit={e=>{e.preventDefault();addMileage(f);}}>
        <div style={{display:"grid",gap:12}}>
          <div><label style={lbl}>Purpose *</label><input style={inp} required value={f.purpose} onChange={e=>set("purpose")(e.target.value)} placeholder="e.g. FB Marketplace pickup — NES lot"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label style={lbl}>Date</label><input style={inp} value={f.date} onChange={e=>set("date")(e.target.value)} placeholder="MM/DD/YYYY"/></div>
            <div><label style={lbl}>Total Miles *</label><input style={inp} type="number" step="0.1" required value={f.miles} onChange={e=>set("miles")(e.target.value)} placeholder="0.0"/></div>
          </div>
          {est>0&&<div style={{fontSize:13,color:T.text2,padding:"8px 12px",background:T.surface2,borderRadius:8}}>Est. deduction: <strong style={{color:T.green}}>{fmt(est)}</strong> at ${IRS_RATE}/mi</div>}
          <div><label style={lbl}>Notes</label><textarea style={{...inp,resize:"vertical",minHeight:60}} value={f.notes} onChange={e=>set("notes")(e.target.value)} placeholder="Optional…"/></div>
          <div style={{display:"flex",gap:8}}>
            <BtnPrimary type="submit" style={{flex:1,padding:"11px"}}>Log Trip</BtnPrimary>
            <BtnGhost onClick={()=>setShowAddMileage(false)}>Cancel</BtnGhost>
          </div>
        </div>
      </form>
    );
  };

  // ── Lot Evaluator ──
  const LotEvaluator=()=>(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div><label style={lbl}>Purchase Date</label><input style={inp} value={lotDate} onChange={e=>setLotDate(e.target.value)} placeholder="MM/DD/YYYY"/></div>
        <div><label style={lbl}>Purchase Location</label><select style={inp} value={lotLocation} onChange={e=>setLotLocation(e.target.value)}>{PURCHASE_LOCATIONS.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>
      <div><label style={lbl}>Lot Name / Notes</label><input style={inp} value={lotName} onChange={e=>setLotName(e.target.value)} placeholder="e.g. FB lot Jan 3rd"/></div>
      <div style={{display:"flex",gap:8}}>
        <input style={inp} placeholder="Search game title…" value={lotSearch} onChange={e=>setLotSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLotSearch()}/>
        <BtnPrimary onClick={handleLotSearch} disabled={lotLoading} style={{whiteSpace:"nowrap",minWidth:80}}>{lotLoading?"…":"Search"}</BtnPrimary>
      </div>
      {lotResults.length>0&&(
        <div style={card}>
          {lotResults.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"11px 14px",borderBottom:i<lotResults.length-1?`1px solid ${T.border}`:"none",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>{item.console}</div>
              </div>
              <div style={{display:"flex",gap:12,flexShrink:0}}>
                {item.loosePrice&&<div style={{textAlign:"center"}}><div style={{fontSize:10,color:T.text3,fontWeight:600,textTransform:"uppercase"}}>Loose</div><div style={{fontSize:13,fontWeight:700}}>${item.loosePrice}</div><BtnSmall onClick={()=>addToLot(item,"C")}>+ C</BtnSmall></div>}
                {item.cibPrice&&<div style={{textAlign:"center"}}><div style={{fontSize:10,color:T.text3,fontWeight:600,textTransform:"uppercase"}}>CIB</div><div style={{fontSize:13,fontWeight:700,color:T.green}}>${item.cibPrice}</div><BtnSmall onClick={()=>addToLot(item,"CIB")}>+ CIB</BtnSmall></div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {lotItems.length>0&&(
        <>
          <div style={card}>
            <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontSize:12,fontWeight:700,color:T.text2,textTransform:"uppercase",letterSpacing:"0.05em"}}>Lot Items ({lotItems.length})</div>
            {lotItems.map((item,i)=>(
              <div key={item.id} style={{padding:"10px 14px",borderBottom:i<lotItems.length-1?`1px solid ${T.border}`:"none",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:500,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description}</div>
                  <div style={{fontSize:11,color:T.text3,marginTop:3,display:"flex",gap:6,flexWrap:"wrap"}}>
                    <select style={{...inp,padding:"2px 6px",fontSize:11,width:"auto",minHeight:"auto"}} value={item.category} onChange={e=>setLotItems(p=>p.map(l=>l.id===item.id?{...l,category:e.target.value}:l))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
                    <select style={{...inp,padding:"2px 6px",fontSize:11,width:"auto",minHeight:"auto"}} value={item.designation} onChange={e=>setLotItems(p=>p.map(l=>l.id===item.id?{...l,designation:e.target.value}:l))}>{DESIGNATIONS.map(d=><option key={d}>{d}</option>)}</select>
                    <select style={{...inp,padding:"2px 6px",fontSize:11,width:"auto",minHeight:"auto"}} value={item.itemType} onChange={e=>setLotItems(p=>p.map(l=>l.id===item.id?{...l,itemType:e.target.value}:l))}>{ITEM_TYPES.map(t=><option key={t}>{t}</option>)}</select>
                  </div>
                </div>
                <input style={{...inp,width:72,padding:"4px 8px",fontSize:13,minHeight:"auto",fontVariantNumeric:"tabular-nums"}} value={item.price} onChange={e=>setLotItems(p=>p.map(l=>l.id===item.id?{...l,price:e.target.value}:l))}/>
                <button onClick={()=>setLotItems(p=>p.filter(l=>l.id!==item.id))} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:18,padding:4}}>×</button>
              </div>
            ))}
          </div>
          <div style={{...card,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:10}}><span style={{color:T.text2}}>Market Value Total</span><span style={{fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmt(lotTotal)}</span></div>
            <input style={{...inp,marginBottom:10,fontVariantNumeric:"tabular-nums"}} type="number" placeholder="Your offer ($)" value={lotOffer} onChange={e=>setLotOffer(e.target.value)}/>
            {lotProfit!==null&&<div style={{display:"flex",justifyContent:"space-between",fontSize:15,borderTop:`1px solid ${T.border}`,paddingTop:10,marginBottom:12}}><span style={{fontWeight:600,color:T.text2}}>Est. Profit</span><span style={{fontWeight:700,fontSize:20,color:lotProfit>=0?T.green:T.red,fontVariantNumeric:"tabular-nums"}}>{fmt(lotProfit)}</span></div>}
            <BtnPrimary onClick={addLotToInventory} style={{width:"100%",padding:"11px"}}>Add {lotItems.length} Items to Inventory</BtnPrimary>
          </div>
        </>
      )}
    </div>
  );

  const NAV=[{id:"dashboard",label:"Dashboard",icon:"◉"},{id:"inventory",label:"Inventory",icon:"📦"},{id:"sold",label:"Sold",icon:"✓"},{id:"expenses",label:"Expenses",icon:"$"},{id:"mileage",label:"Mileage",icon:"⊙"}];

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return(
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:T.bg,minHeight:"100vh",color:T.text}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{overflow-x:hidden}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.border};border-radius:10px}
        input,select,textarea,button{font-family:inherit}
        input:focus,select:focus,textarea:focus{outline:2px solid ${T.accent};outline-offset:1px;border-color:transparent!important}
        .tr{border-bottom:1px solid ${T.border};transition:background .1s}.tr:hover{background:${T.surface2}}.tr:last-child{border-bottom:none}
        .nav-btn{background:none;border:none;cursor:pointer;padding:${isMobile?"8px 4px":"7px 14px"};border-radius:8px;font-size:${isMobile?11:14}px;font-weight:500;color:${T.text2};transition:all .15s;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-direction:${isMobile?"column":"row"};gap:${isMobile?3:6}px;flex:${isMobile?1:"0 0 auto"}}
        .nav-btn:hover{color:${T.text};background:${T.surface2}}
        .nav-btn.active{background:${dark?"#2c2c2e":"#fff"};color:${T.text};font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,${dark?0.4:0.1}),0 0 0 1px ${T.border}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spinner{display:inline-block;width:14px;height:14px;border:2px solid ${T.border};border-top-color:${T.accent};border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle}
        .toast{position:fixed;bottom:${isMobile?80:20}px;left:50%;transform:translateX(-50%);padding:11px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:100;box-shadow:0 4px 20px rgba(0,0,0,.25);animation:up .2s ease;max-width:calc(100vw - 24px);text-align:center}
        @keyframes up{from{transform:translateX(-50%) translateY(10px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        .progress-bar{position:fixed;top:${isMobile?52:54}px;left:0;right:0;height:3px;background:${T.border};z-index:19}
        .progress-fill{height:100%;background:${T.accent};transition:width .3s}
      `}</style>

      {/* TOP BAR */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:`0 ${cpx}px`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,height:isMobile?52:54,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
          <div style={{width:28,height:28,background:T.text,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:T.surface,fontSize:15,fontWeight:700}}>$</div>
          <span style={{fontSize:15,fontWeight:700,letterSpacing:"-0.02em",whiteSpace:"nowrap"}}>2026 Resell</span>
        </div>
        {!isMobile&&<div style={{display:"flex",gap:2,flex:1,justifyContent:"center"}}>{NAV.map(n=><button key={n.id} className={`nav-btn ${view===n.id?"active":""}`} onClick={()=>setView(n.id)}>{n.label}{n.id==="inventory"&&<span style={{marginLeft:5,background:T.pill,color:T.text3,fontSize:11,padding:"1px 6px",borderRadius:20,fontWeight:600}}>{inventory.length}</span>}</button>)}</div>}
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {!isMobile&&<BtnGhost onClick={()=>setShowPaste(true)} style={{fontSize:12,padding:"6px 12px"}}>↑ Paste</BtnGhost>}
          {isMobile&&<button onClick={()=>setShowPaste(true)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,width:38,height:38,cursor:"pointer",color:T.text2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>↑</button>}
          <button onClick={()=>setDark(d=>!d)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,width:isMobile?38:34,height:isMobile?38:34,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>{dark?"☀️":"🌙"}</button>
        </div>
      </div>

      {refreshingAll&&<div className="progress-bar"><div className="progress-fill" style={{width:`${(refreshProgress.current/refreshProgress.total)*100}%`}}/></div>}

      {/* LOADING */}
      {dbLoading&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"70vh",gap:16}}><div className="spinner" style={{width:36,height:36,borderWidth:3}}/><div style={{fontSize:14,color:T.text2}}>Loading your data…</div></div>}

      {/* DB ERROR */}
      {!dbLoading&&dbError&&<div style={{maxWidth:480,margin:"40px auto",padding:24,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12}}><div style={{fontSize:15,fontWeight:600,color:T.red,marginBottom:8}}>Connection error</div><div style={{fontSize:13,color:T.text2,lineHeight:1.6}}>{dbError}</div></div>}

      {/* MAIN */}
      {!dbLoading&&!dbError&&(
        <div style={{maxWidth:1200,margin:"0 auto",padding:`${isMobile?16:24}px ${cpx}px`,paddingBottom:isMobile?80:24}}>

          {/* ── DASHBOARD ── */}
          {view==="dashboard"&&(
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?14:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div style={{fontSize:18,fontWeight:700,letterSpacing:"-0.02em"}}>Dashboard</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:13,color:T.text2}}>Tax Year</span>
                  <select style={{...inp,width:"auto",minHeight:36,padding:"6px 10px",fontSize:13}} value={yearFilter} onChange={e=>setYearFilter(parseInt(e.target.value))}>
                    {availableYears.map(y=><option key={y}>{y}</option>)}
                  </select>
                  <BtnGhost onClick={()=>setShowYearClose(true)} style={{fontSize:12,padding:"6px 12px",color:T.amber,borderColor:T.amber}}>Year-End Close</BtnGhost>
                </div>
              </div>

              {/* Row 1 */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(2,1fr)",gap:isMobile?8:12}}>
                <StatCard label="Net Profit" value={fmt(totalNetProfit)} color={T.green} sub={`${yearFilter} after all costs`}/>
                <StatCard label="Items Sold" value={soldThisYear.length} sub={`${yearFilter}`}/>
              </div>

              {/* Row 2 */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:12}}>
                <StatCard label="Total Fees" value={fmt(totalFees)} color={T.amber} sub="platform + promoted" small/>
                <StatCard label="Total Shipping" value={fmt(totalShipping)} color={T.amber} sub="all ship costs" small/>
                <StatCard label="Mileage Deduction" value={fmt(mileageDeduction)} color={T.purple} sub={`${totalMiles.toFixed(1)} mi @ $${IRS_RATE}/mi`} small/>
                <StatCard label="Unsold Capital" value={fmt(unsoldCapital)} color={T.red} sub={`${inventory.length} items in stock`} small/>
              </div>

              {/* Row 3: Taxable Profit */}
              <div style={{...card,padding:isMobile?14:20}}>{(()=>{
                const taxable=totalNetProfit-totalFees-totalShipping-mileageDeduction-unsoldCapital;
                return <>
                  <div style={{fontSize:11,fontWeight:600,color:T.text3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Est. Taxable Profit — {yearFilter}</div>
                  <div style={{fontSize:isMobile?28:36,fontWeight:700,color:taxable>=0?T.green:T.red,letterSpacing:"-0.02em",lineHeight:1,marginBottom:8,fontVariantNumeric:"tabular-nums"}}>{fmt(taxable)}</div>
                  <div style={{fontSize:12,color:T.text3}}>Net Profit − Fees − Shipping − Mileage Deduction − Unsold Capital</div>
                </>;
              })()}</div>

              {/* Tax summary */}
              <div style={{...card,padding:isMobile?14:18,background:dark?"#1a1a2e":"#eff6ff",borderColor:dark?"#2a2a4a":"#bfdbfe"}}>
                <div style={{fontSize:12,fontWeight:700,color:T.blue,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Tax Summary — {yearFilter}</div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:10}}>
                  {[
                    {label:"Cost of Goods Sold",value:fmt(soldThisYear.reduce((s,r)=>s+(r.cost||0),0))},
                    {label:"Platform Fees",value:fmt(totalFees)},
                    {label:"Shipping Costs",value:fmt(totalShipping)},
                    {label:"Business Expenses",value:fmt(totalExpenses)},
                    {label:"Mileage Write-off",value:fmt(mileageDeduction)},
                    {label:"Total Deductions",value:fmt(totalFees+totalShipping+totalExpenses+mileageDeduction)},
                    {label:"Gross Revenue",value:fmt(soldThisYear.reduce((s,r)=>s+(r.soldPrice||0),0))},
                    {label:"Est. Taxable Income",value:fmt(soldThisYear.reduce((s,r)=>s+(r.soldPrice||0),0)-totalFees-totalShipping-totalExpenses-mileageDeduction)},
                  ].map(s=><div key={s.label}><div style={{fontSize:11,color:T.text2,marginBottom:2}}>{s.label}</div><div style={{fontSize:15,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{s.value}</div></div>)}
                </div>
              </div>

              {/* Chart 1: Monthly */}
              <div style={{...card,padding:isMobile?14:18}}>
                <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Monthly Sales — {yearFilter}</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyData} margin={{top:0,right:0,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:T.text3}}/>
                    <YAxis tick={{fontSize:11,fill:T.text3}} tickFormatter={v=>`$${v>=1000?(v/1000).toFixed(0)+"k":v}`}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    <Bar dataKey="revenue" name="Revenue" fill={T.blue} radius={[3,3,0,0]}/>
                    <Bar dataKey="netProfit" name="Net Profit" fill={T.green} radius={[3,3,0,0]}/>
                    <Bar dataKey="sales" name="# Sales" fill={T.amber} radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Charts 2+3 */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:isMobile?14:20}}>
                <div style={{...card,padding:isMobile?14:18}}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Sales by Platform</div>
                  {platformData.length===0?<div style={{color:T.text3,fontSize:13,textAlign:"center",padding:30}}>No sales yet for {yearFilter}</div>:(
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart><Pie data={platformData} dataKey="revenue" nameKey="platform" cx="50%" cy="50%" outerRadius={65} label={({platform,percent})=>`${platform} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                          {platformData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
                        </Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
                      </ResponsiveContainer>
                      <table style={{width:"100%",borderCollapse:"collapse",marginTop:8,fontSize:12}}>
                        <thead><tr>{["Platform","Sales","Avg","Revenue"].map(h=><th key={h} style={{...thS,fontSize:10,padding:"6px 10px"}}>{h}</th>)}</tr></thead>
                        <tbody>{platformData.map((p,i)=><tr key={i} className="tr"><td style={{...tdS,padding:"7px 10px",fontSize:12}}><span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:CHART_COLORS[i%CHART_COLORS.length],marginRight:6}}/>{p.platform}</td><td style={{...tdS,padding:"7px 10px",fontSize:12,textAlign:"center"}}>{p.sales}</td><td style={{...tdS,padding:"7px 10px",fontSize:12,fontVariantNumeric:"tabular-nums"}}>{fmt(p.avgSale)}</td><td style={{...tdS,padding:"7px 10px",fontSize:12,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{fmt(p.revenue)}</td></tr>)}</tbody>
                      </table>
                    </>
                  )}
                </div>
                <div style={{...card,padding:isMobile?14:18}}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Profit by Category</div>
                  {categoryProfitData.length===0?<div style={{color:T.text3,fontSize:13,textAlign:"center",padding:30}}>No sales yet for {yearFilter}</div>:(
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={categoryProfitData} layout="vertical" margin={{top:0,right:10,left:20,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                        <XAxis type="number" tick={{fontSize:10,fill:T.text3}} tickFormatter={v=>`$${v}`}/>
                        <YAxis type="category" dataKey="category" tick={{fontSize:10,fill:T.text3}} width={50}/>
                        <Tooltip content={<ChartTip/>}/>
                        <Bar dataKey="totalProfit" name="Total Profit" radius={[0,3,3,0]}>{categoryProfitData.map((e,i)=><Cell key={i} fill={e.totalProfit>=0?T.green:T.red}/>)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Charts 4+5 */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:isMobile?14:20}}>
                <div style={{...card,padding:isMobile?14:18}}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Inventory by Category</div>
                  {categoryInventoryData.length===0?<div style={{color:T.text3,fontSize:13,textAlign:"center",padding:30}}>No inventory data</div>:(
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={categoryInventoryData} margin={{top:0,right:0,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                        <XAxis dataKey="category" tick={{fontSize:10,fill:T.text3}} angle={-30} textAnchor="end" height={50}/>
                        <YAxis tick={{fontSize:10,fill:T.text3}}/>
                        <Tooltip content={<ChartTip/>}/>
                        <Bar dataKey="count" name="# Items" fill={T.blue} radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div style={{...card,padding:isMobile?14:18}}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Top 10 Sales by Profit — {yearFilter}</div>
                  {topItemsData.length===0?<div style={{color:T.text3,fontSize:13,textAlign:"center",padding:30}}>No sales yet for {yearFilter}</div>:(
                    <div style={{overflowY:"auto",maxHeight:220}}>
                      {topItemsData.map((r,i)=>(
                        <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topItemsData.length-1?`1px solid ${T.border}`:"none"}}>
                          <span style={{fontSize:12,fontWeight:700,color:T.text3,minWidth:18}}>{i+1}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
                            <div style={{fontSize:10,color:T.text3}}>{r.category} · {r.dateSold}</div>
                          </div>
                          <span style={{fontSize:13,fontWeight:700,color:r.netProfit>=0?T.green:T.red,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{fmt(r.netProfit)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── INVENTORY ── */}
          {view==="inventory"&&(
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?12:16}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:12}}>
                <StatCard label="Total Items" value={items.length} sub="all time"/>
                <StatCard label="Unsold" value={inventory.length} sub="in stock"/>
                <StatCard label="Unsold Capital" value={fmt(unsoldCapital)} color={T.amber} sub="cost of goods"/>
                <StatCard label="Potential Profit" value={fmt(potentialProfit)} color={potentialProfit>=0?T.green:T.red} sub={`${itemsWithMV}/${inventory.length} priced`}/>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <BtnPrimary onClick={()=>setShowAddItem(true)} style={{fontSize:13,padding:"8px 14px"}}>+ Add Item</BtnPrimary>
                <BtnGhost onClick={()=>setShowLot(true)} style={{fontSize:13}}>🔍 Lot Evaluator</BtnGhost>
                {inventory.length>0&&<BtnGhost onClick={refreshAllMV} disabled={refreshingAll} style={{fontSize:13}}>{refreshingAll?`Fetching ${refreshProgress.current}/${refreshProgress.total}…`:`Fetch ${inventory.length-itemsWithMV} Missing Prices`}</BtnGhost>}
                <BtnGhost onClick={()=>exportCSV(inventory,"inventory.csv",[{key:"description",label:"Item"},{key:"purchaseDate",label:"Date"},{key:"purchaseLocation",label:"Location"},{key:"cost",label:"Cost"},{key:"category",label:"Category"},{key:"designation",label:"Condition"},{key:"itemType",label:"Type"},{key:"notes",label:"Notes"}])} style={{fontSize:13,marginLeft:"auto"}}>↓ Export</BtnGhost>
              </div>
              {isMobile?(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",gap:8}}>
                    <input style={{...inp,flex:1}} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
                    <button onClick={()=>setShowFilters(v=>!v)} style={{background:T.surface,border:`1px solid ${T.border}`,color:T.text,padding:"0 14px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:500,minHeight:44,display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>Filter{(filterCat!=="All"||filterType!=="All")&&"•"}</button>
                  </div>
                  {showFilters&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <select style={inp} value={filterCat} onChange={e=>setFilterCat(e.target.value)}><option value="All">All Platforms</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
                    <select style={inp} value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="All">All Types</option>{ITEM_TYPES.map(t=><option key={t}>{t}</option>)}</select>
                  </div>}
                  <div style={{fontSize:12,color:T.text3}}>{filteredInventory.length} of {inventory.length} items</div>
                </div>
              ):(
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  <input style={{...inp,width:200,flex:"0 0 200px"}} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
                  <select style={{...inp,width:160,flex:"0 0 160px"}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}><option value="All">All Platforms</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
                  <select style={{...inp,width:160,flex:"0 0 160px"}} value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="All">All Types</option>{ITEM_TYPES.map(t=><option key={t}>{t}</option>)}</select>
                  <span style={{fontSize:12,color:T.text3,marginLeft:"auto"}}>{filteredInventory.length} of {inventory.length}</span>
                </div>
              )}
              {isMobile?(
                <div>
                  {filteredInventory.length===0&&<div style={{...card,padding:30,textAlign:"center",color:T.text3,fontSize:14}}>{items.length===0?"No data loaded. Tap ↑ to paste your sheet.":"No items match your filters."}</div>}
                  {filteredInventory.map(r=>{const ds=desigStyle(r.designation,dark);return(
                    <div key={r.id} style={{...card,padding:14,marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:8}}>
                        <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,wordBreak:"break-word",flex:1}}>{r.description}</div>
                        <span style={{background:ds.bg,color:ds.c,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:600,flexShrink:0}}>{r.designation}</span>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                        <span style={{background:T.pill,color:T.pillText,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:500}}>{r.category}</span>
                        <span style={{background:T.pill,color:T.pillText,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:500}}>{r.itemType}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:T.text3,paddingTop:8,borderTop:`1px solid ${T.border}`,marginBottom:8}}>
                        <span>{r.purchaseDate} · {r.purchaseLocation}</span>
                        <span style={{color:r.cost>0?T.red:T.text3,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{r.cost>0?fmt(r.cost):"—"}</span>
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <BtnSmall onClick={()=>setShowMarkSold(r.id)} color={T.green} bg={T.accentBg} style={{flex:1,textAlign:"center",padding:"7px"}}>✓ Mark Sold</BtnSmall>
                        <MVCell r={r}/>
                        <button onClick={()=>deleteItem(r.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>
                      </div>
                    </div>
                  );})}
                </div>
              ):(
                <div style={card}>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:isTablet?700:820}}>
                      <colgroup><col style={{width:"26%"}}/><col style={{width:"9%"}}/><col style={{width:"7%"}}/><col style={{width:"10%"}}/>{!isTablet&&<col style={{width:"10%"}}/>}<col style={{width:"8%"}}/><col style={{width:"20%"}}/><col style={{width:"10%"}}/></colgroup>
                      <thead><tr><th style={thS}>Item</th><th style={thS}>Platform</th><th style={thS}>Cond.</th><th style={thS}>Date</th>{!isTablet&&<th style={thS}>Source</th>}<th style={thS}>Cost</th><th style={thS}>Market Value</th><th style={thS}>Actions</th></tr></thead>
                      <tbody>
                        {filteredInventory.length===0&&<tr><td colSpan={isTablet?7:8} style={{padding:36,textAlign:"center",color:T.text3,fontSize:14}}>{items.length===0?"No data loaded. Click ↑ Paste to load your sheet.":"No items match your filters."}</td></tr>}
                        {filteredInventory.map(r=>{const ds=desigStyle(r.designation,dark);return(
                          <tr key={r.id} className="tr">
                            <td style={tdS}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.description}>{r.description}</div></td>
                            <td style={tdS}><span style={{background:T.pill,color:T.pillText,borderRadius:5,padding:"2px 7px",fontSize:12,fontWeight:500}}>{r.category}</span></td>
                            <td style={tdS}><span style={{background:ds.bg,color:ds.c,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:600}}>{r.designation}</span></td>
                            <td style={{...tdS,color:T.text3,fontSize:12}}>{r.purchaseDate}</td>
                            {!isTablet&&<td style={{...tdS,color:T.text3,fontSize:12}}>{r.purchaseLocation}</td>}
                            <td style={{...tdS,color:r.cost>0?T.red:T.text3,fontVariantNumeric:"tabular-nums"}}>{r.cost>0?fmt(r.cost):"—"}</td>
                            <td style={tdS}><MVCell r={r}/></td>
                            <td style={tdS}><div style={{display:"flex",gap:6,alignItems:"center"}}><BtnSmall onClick={()=>setShowMarkSold(r.id)} color={T.green} bg={T.accentBg}>✓ Sold</BtnSmall><button onClick={()=>deleteItem(r.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:15,padding:2}}>×</button></div></td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SOLD ── */}
          {view==="sold"&&(
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?12:16}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:12}}>
                <StatCard label="Items Sold" value={soldItems.length} sub="all time"/>
                <StatCard label="Net Profit" value={fmt(soldItems.reduce((s,r)=>s+(r.netProfit||0),0))} color={T.green} sub="after fees & shipping"/>
                <StatCard label="Total Fees" value={fmt(soldItems.reduce((s,r)=>s+(r.fees||0)+(r.promotedFees||0),0))} color={T.amber} sub="platform + promoted"/>
                <StatCard label="Total Shipping" value={fmt(soldItems.reduce((s,r)=>s+(r.shippingCost||0),0))} color={T.amber} sub="all ship costs"/>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <input style={{...inp,width:200,flex:"0 0 200px"}} placeholder="Search sold items…" value={search} onChange={e=>setSearch(e.target.value)}/>
                <select style={{...inp,width:160,flex:"0 0 160px"}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}><option value="All">All Platforms</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
                <span style={{fontSize:12,color:T.text3,marginLeft:"auto"}}>{filteredSold.length} items</span>
                <BtnGhost onClick={()=>exportCSV(soldItems,"sold.csv",[{key:"description",label:"Item"},{key:"dateSold",label:"Date Sold"},{key:"soldPrice",label:"Sold Price"},{key:"platform",label:"Platform"},{key:"fees",label:"Fees"},{key:"promotedFees",label:"Promoted Fees"},{key:"shippingProvider",label:"Ship Via"},{key:"shippingCost",label:"Ship Cost"},{key:"adjustmentType",label:"Adjustment"},{key:"adjustmentAmount",label:"Adj Amount"},{key:"netProfit",label:"Net Profit"},{key:"adjustedNetProfit",label:"Adj Net Profit"}])} style={{fontSize:13}}>↓ Export</BtnGhost>
              </div>
              {isMobile?(
                <div>
                  {filteredSold.length===0&&<div style={{...card,padding:30,textAlign:"center",color:T.text3,fontSize:14}}>No sold items yet.</div>}
                  {filteredSold.map(r=>{const ds=desigStyle(r.designation,dark);return(
                    <div key={r.id} style={{...card,padding:14,marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:8}}>
                        <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,wordBreak:"break-word",flex:1}}>{r.description}</div>
                        <span style={{fontSize:16,fontWeight:700,color:r.netProfit>=0?T.green:T.red,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{fmt(r.netProfit)}</span>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}><span style={{background:T.pill,color:T.pillText,borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:500}}>{r.category}</span><span style={{background:ds.bg,color:ds.c,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:600}}>{r.designation}</span></div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12,color:T.text3,paddingTop:8,borderTop:`1px solid ${T.border}`}}>
                        <span>Sold: {r.dateSold}</span><span>Price: <strong style={{color:T.text,fontVariantNumeric:"tabular-nums"}}>{fmt(r.soldPrice)}</strong></span>
                        <span>Via: {r.platform}</span><span>Fees: <strong style={{fontVariantNumeric:"tabular-nums"}}>{fmt((r.fees||0)+(r.promotedFees||0))}</strong></span>
                      </div>
                    </div>
                  );})}
                </div>
              ):(
                <div style={card}>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:isTablet?700:820}}>
                      <colgroup><col style={{width:"24%"}}/><col style={{width:"8%"}}/><col style={{width:"6%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/>{!isTablet&&<col style={{width:"10%"}}/>}<col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/></colgroup>
                      <thead><tr><th style={thS}>Item</th><th style={thS}>Platform</th><th style={thS}>Cond.</th><th style={thS}>Date Sold</th><th style={thS}>Sale</th>{!isTablet&&<th style={thS}>Sold Via</th>}<th style={thS}>Fees</th><th style={thS}>Ship</th><th style={thS}>Net</th><th style={thS}>Adj. Net</th></tr></thead>
                      <tbody>
                        {filteredSold.length===0&&<tr><td colSpan={isTablet?9:10} style={{padding:36,textAlign:"center",color:T.text3,fontSize:14}}>No sold items yet.</td></tr>}
                        {filteredSold.map(r=>{const ds=desigStyle(r.designation,dark);return(
                          <tr key={r.id} className="tr">
                            <td style={tdS}><div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.description}>{r.description}</div></td>
                            <td style={tdS}><span style={{background:T.pill,color:T.pillText,borderRadius:5,padding:"2px 7px",fontSize:12,fontWeight:500}}>{r.category}</span></td>
                            <td style={tdS}><span style={{background:ds.bg,color:ds.c,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:600}}>{r.designation}</span></td>
                            <td style={{...tdS,color:T.text3,fontSize:12}}>{r.dateSold}</td>
                            <td style={{...tdS,fontVariantNumeric:"tabular-nums",fontWeight:500}}>{fmt(r.soldPrice)}</td>
                            {!isTablet&&<td style={{...tdS,color:T.text2,fontSize:12}}>{r.platform}</td>}
                            <td style={{...tdS,color:T.text3,fontSize:12,fontVariantNumeric:"tabular-nums"}}>{(r.fees||0)+(r.promotedFees||0)>0?fmt((r.fees||0)+(r.promotedFees||0)):"—"}</td>
                            <td style={{...tdS,color:T.text3,fontSize:12,fontVariantNumeric:"tabular-nums"}}>{r.shippingCost>0?fmt(r.shippingCost):"—"}</td>
                            <td style={{...tdS,fontWeight:600,fontVariantNumeric:"tabular-nums",color:r.netProfit>=0?T.green:T.red}}>{fmt(r.netProfit)}</td>
                            <td style={{...tdS,fontWeight:600,fontVariantNumeric:"tabular-nums",color:r.adjustedNetProfit>=0?T.green:T.red}}>{fmt(r.adjustedNetProfit)}</td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EXPENSES ── */}
          {view==="expenses"&&(
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?12:16}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:isMobile?8:12}}>
                <StatCard label="Total Expenses" value={fmt(expenses.reduce((s,e)=>s+(e.amount||0),0))} color={T.red} sub="all time"/>
                <StatCard label={`${yearFilter} Expenses`} value={fmt(totalExpenses)} color={T.amber}/>
                <StatCard label="# Entries" value={expenses.length} sub="all time"/>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <BtnPrimary onClick={()=>setShowAddExpense(true)} style={{fontSize:13,padding:"8px 14px"}}>+ Add Expense</BtnPrimary>
                <select style={{...inp,width:120,marginLeft:"auto"}} value={yearFilter} onChange={e=>setYearFilter(parseInt(e.target.value))}>{availableYears.map(y=><option key={y}>{y}</option>)}</select>
                <BtnGhost onClick={()=>exportCSV(expensesThisYear,"expenses.csv",[{key:"description",label:"Description"},{key:"date",label:"Date"},{key:"amount",label:"Amount"},{key:"notes",label:"Notes"}])} style={{fontSize:13}}>↓ Export</BtnGhost>
              </div>
              <div style={card}>
                {expensesThisYear.length===0&&<div style={{padding:36,textAlign:"center",color:T.text3,fontSize:14}}>No expenses for {yearFilter}.</div>}
                {expensesThisYear.map((e,i)=>(
                  <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<expensesThisYear.length-1?`1px solid ${T.border}`:"none"}}>
                    <div style={{flex:1,minWidth:0}}><div style={{fontWeight:500,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.description}</div><div style={{fontSize:12,color:T.text3,marginTop:2}}>{e.date}{e.notes&&` · ${e.notes}`}</div></div>
                    <span style={{fontWeight:700,fontSize:15,color:T.red,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{fmt(e.amount)}</span>
                    <button onClick={()=>deleteExpense(e.id)} style={{background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:16,padding:2,flexShrink:0}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MILEAGE ── */}
          {view==="mileage"&&(
            <div style={{display:"flex",flexDirection:"column",gap:isMobile?12:16}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:isMobile?8:12}}>
                <StatCard label="Total Miles" value={mileage.reduce((s,m)=>s+(m.miles||0),0).toFixed(1)} sub="all time"/>
                <StatCard label={`${yearFilter} Miles`} value={totalMiles.toFixed(1)}/>
                <StatCard label="IRS Rate" value={`$${IRS_RATE}/mi`} sub={`${new Date().getFullYear()} rate`}/>
                <StatCard label="Est. Deduction" value={fmt(mileageDeduction)} color={T.green} sub={`${yearFilter}`}/>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <BtnPrimary onClick={()=>setShowAddMileage(true)} style={{fontSize:13,padding:"8px 14px"}}>+ Log Trip</BtnPrimary>
                <select style={{...inp,width:120,marginLeft:"auto"}} value={yearFilter} onChange={e=>setYearFilter(parseInt(e.target.value))}>{availableYears.map(y=><option key={y}>{y}</option>)}</select>
                <BtnGhost onClick={()=>exportCSV(mileageThisYear,"mileage.csv",[{key:"date",label:"Date"},{key:"purpose",label:"Purpose"},{key:"miles",label:"Miles"},{key:"notes",label:"Notes"}])} style={{fontSize:13}}>↓ Export</BtnGhost>
              </div>
              <div style={card}>
                {mileageThisYear.length===0&&<div style={{padding:36,textAlign:"center",color:T.text3,fontSize:14}}>No mileage logged for {yearFilter}.</div>}
                {mileageThisYear.map((m,i)=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderBottom:i<mileageThisYear.length-1?`1px solid ${T.border}`:"none"}}>
                    <div style={{flex:1,minWidth:0}}><div style={{fontWeight:500,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.purpose}</div><div style={{fontSize:12,color:T.text3,marginTop:2}}>{m.date}{m.notes&&` · ${m.notes}`}</div></div>
                    <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,fontSize:15,fontVariantNumeric:"tabular-nums"}}>{m.miles} mi</div><div style={{fontSize:11,color:T.green,fontVariantNumeric:"tabular-nums"}}>{fmt(m.miles*IRS_RATE)}</div></div>
                    <button onClick={()=>deleteMileage(m.id)} style={{background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:16,padding:2,flexShrink:0}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      {isMobile&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,borderTop:`1px solid ${T.border}`,padding:"4px 4px 10px",zIndex:25,display:"flex",gap:2}}>
          {NAV.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={`nav-btn ${view===n.id?"active":""}`}><span style={{fontSize:16}}>{n.icon}</span><span>{n.label}</span></button>)}
        </div>
      )}

      {/* MODALS */}
      {showPaste&&<Modal title="Paste Sheet Data" onClose={()=>setShowPaste(false)}><PasteModalContent/></Modal>}
      {showAddItem&&<Modal title="Add Item" onClose={()=>setShowAddItem(false)}><AddItemForm/></Modal>}
      {showMarkSold&&(()=>{const item=items.find(r=>r.id===showMarkSold);return item?<Modal title="Mark as Sold" onClose={()=>setShowMarkSold(null)}><MarkSoldForm item={item}/></Modal>:null;})()}
      {showAddExpense&&<Modal title="Add Expense" onClose={()=>setShowAddExpense(false)}><ExpenseForm/></Modal>}
      {showAddMileage&&<Modal title="Log Trip" onClose={()=>setShowAddMileage(false)}><MileageForm/></Modal>}
      {showLot&&<Modal title="Lot Evaluator" onClose={()=>setShowLot(false)} wide><LotEvaluator/></Modal>}
      {showYearClose&&(
        <Modal title={`Year-End Close — ${yearFilter}`} onClose={()=>setShowYearClose(false)}>
          <div style={{fontSize:14,color:T.text2,lineHeight:1.6,marginBottom:16}}>This will write off all <strong style={{color:T.text}}>{inventory.length} unsold items</strong> (total cost: <strong style={{color:T.red}}>{fmt(unsoldCapital)}</strong>) as a business expense and zero their cost basis.</div>
          <div style={{padding:12,background:dark?"#1a1a0a":"#fffbeb",border:`1px solid ${dark?"#3a3a0a":"#fef08a"}`,borderRadius:8,fontSize:13,color:T.amber,marginBottom:16}}>⚠ This cannot be undone. Export your data first.</div>
          <div style={{display:"flex",gap:8}}><BtnPrimary onClick={yearEndClose} style={{flex:1,padding:"12px",background:T.amber}}>Confirm Year-End Close</BtnPrimary><BtnGhost onClick={()=>setShowYearClose(false)}>Cancel</BtnGhost></div>
        </Modal>
      )}

      {toast&&<div className="toast" style={{background:toast.type==="error"?"#dc2626":T.text,color:T.surface}}>{toast.msg}</div>}
    </div>
  );
}
