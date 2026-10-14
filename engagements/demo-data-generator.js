const ExcelJS = require("exceljs"); const fs = require("fs");
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cats = [["Ride-on cars","1500+",1650,0.42],["Compact gifts","300-600",420,0.25],["Dolls","100-300",180,0.15],["Building blocks","100-300",210,0.1],["Small toys","<100",55,0.08]];
const rows = ["order_id,date,category,price_band,qty,revenue_aed,channel"];
let id = 10000;
for (let d = new Date(Date.UTC(2025,9,1)); d < new Date(Date.UTC(2026,9,1)); d.setUTCDate(d.getUTCDate()+1)) {
  const m = d.getUTCMonth(); const season = [11,0].includes(m)?1.6:[6,7].includes(m)?0.75:1;
  const n = Math.round((18 + rnd()*10) * season);
  for (let i=0;i<n;i++){ let r=rnd(),acc=0,c=cats[0]; for(const k of cats){acc+=k[3]; if(r<acc){c=k;break}}
    // ride-on share falls after June 2026 (stock-outs)
    if (c[0]==="Ride-on cars" && d >= new Date(Date.UTC(2026,5,1)) && rnd()<0.55) c = cats[1];
    const q = 1 + (rnd()<0.15?1:0); const rev = Math.round(c[2]*(0.85+rnd()*0.3)*q);
    rows.push([id++, d.toISOString().slice(0,10), c[0], c[1], q, rev, rnd()<0.62?"Google":"Instagram"].join(","));
  }
}
fs.writeFileSync("orders_12m.csv", rows.join("\n"));
(async()=>{ const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet("Ad spend");
  ws.addRow(["Month","Campaign","Spend AED","Clicks","Conversions","Conv value AED"]);
  const camps=[["Shopping - Ride-ons",9000,3.9],["Shopping - Gifts",4000,5.4],["Search - Brand",1500,9.1],["PMax - All",6000,3.1]];
  for(let m=0;m<12;m++){ const dt=new Date(Date.UTC(2025,9+m,1)); for(const c of camps){ const sp=Math.round(c[1]*(0.8+rnd()*0.4)); const roas=c[2]*(c[0].includes("Ride")&&m>=8?0.6:1)*(0.85+rnd()*0.3);
    ws.addRow([dt, c[0], sp, Math.round(sp/1.9), Math.round(sp*roas/700), Math.round(sp*roas)]); } }
  await wb.xlsx.writeFile("ad_spend_12m.xlsx"); console.log("rows", rows.length-1);
})();
