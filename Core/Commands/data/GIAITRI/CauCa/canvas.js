import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { TEMP_DIR, ensureDataFiles } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "CauCaFont";
(function () {
  if (!fs.existsSync(fontDir)) return;
  for (const [file, weight] of [["BeVietnamPro_800ExtraBold.ttf","800"],["BeVietnamPro_700Bold.ttf","bold"],["BeVietnamPro_600SemiBold.ttf","600"],["BeVietnamPro_400Regular.ttf","normal"]]) {
    const p = path.join(fontDir, file);
    if (fs.existsSync(p)) { try { registerFont(p, { family: FONT, weight }); } catch {} }
  }
})();

const RARITY_COLORS = { common:"#94A3B8", uncommon:"#22C55E", rare:"#3B82F6", epic:"#A855F7", legendary:"#F97316", mythic:"#EF4444" };
const RARITY_LABELS = { common:"PHỔ THÔNG", uncommon:"KHÔNG PHỔ BIẾN", rare:"HIẾM", epic:"SỬ THI", legendary:"HUYỀN THOẠI", mythic:"TỐI THƯỢNG" };

function roundRect(ctx,x,y,w,h,r){const R=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+R,y);ctx.arcTo(x+w,y,x+w,y+h,R);ctx.arcTo(x+w,y+h,x,y+h,R);ctx.arcTo(x,y+h,x,y,R);ctx.arcTo(x,y,x+w,y,R);ctx.closePath();}
function fitText(ctx,text,maxW){let t=String(text||"");if(ctx.measureText(t).width<=maxW)return t;while(t.length>1&&ctx.measureText(t+"…").width>maxW)t=t.slice(0,-1);return t+"…";}
async function safeLoadImage(p){if(!p||!fs.existsSync(p))return null;try{return await loadImage(p);}catch{return null;}}
function drawProgressBar(ctx,x,y,w,h,progress,color="#22D3EE"){roundRect(ctx,x,y,w,h,h/2);ctx.fillStyle="rgba(30,50,70,0.9)";ctx.fill();const pw=Math.max(0,Math.min(1,progress))*w;if(pw>0){ctx.save();roundRect(ctx,x,y,pw,h,h/2);ctx.fillStyle=color;ctx.fill();ctx.restore();}ctx.strokeStyle="rgba(34,211,238,0.5)";ctx.lineWidth=1;roundRect(ctx,x,y,w,h,h/2);ctx.stroke();}

export async function renderCatchResult(data) {
  ensureDataFiles();
  const W=900,H=520; const canvas=createCanvas(W,H); const ctx=canvas.getContext("2d");
  const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#061018"); bg.addColorStop(0.5,"#0A1A28"); bg.addColorStop(1,"#071420");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="rgba(34,211,238,0.55)"; ctx.lineWidth=3; roundRect(ctx,8,8,W-16,H-16,18); ctx.stroke();
  const headerH=52; ctx.fillStyle="rgba(8,24,40,0.95)"; roundRect(ctx,16,16,W-32,headerH,12); ctx.fill();
  ctx.strokeStyle="rgba(34,211,238,0.45)"; ctx.lineWidth=1.5; roundRect(ctx,16,16,W-32,headerH,12); ctx.stroke();
  const mapName=data.map?.name||"Hồ Bé";
  ctx.font=`bold 22px ${FONT}`; ctx.fillStyle="#22D3EE"; ctx.textAlign="left"; ctx.textBaseline="middle";
  ctx.fillText(`🎣 KẾT QUẢ CÂU CÁ — ${mapName.toUpperCase()}`,32,16+headerH/2);
  ctx.font=`600 14px ${FONT}`; ctx.fillStyle="rgba(150,200,220,0.85)"; ctx.textAlign="right";
  ctx.fillText("HNNP FISHING ZALO",W-32,16+headerH/2);

  const leftX=28,leftY=84,leftW=340,leftH=340;
  ctx.fillStyle="rgba(6,18,30,0.95)"; roundRect(ctx,leftX,leftY,leftW,leftH,14); ctx.fill();
  ctx.strokeStyle="rgba(34,211,238,0.4)"; ctx.lineWidth=2; roundRect(ctx,leftX,leftY,leftW,leftH,14); ctx.stroke();
  const fishImg=await safeLoadImage(data.imagePath);
  if(fishImg){const pad=24,maxW=leftW-pad*2,maxH=leftH-pad*2-40;const scale=Math.min(maxW/fishImg.width,maxH/fishImg.height,1.2);const iw=fishImg.width*scale,ih=fishImg.height*scale;ctx.drawImage(fishImg,leftX+(leftW-iw)/2,leftY+(leftH-ih-36)/2,iw,ih);}
  else{ctx.font=`bold 64px ${FONT}`;ctx.fillStyle="#22D3EE";ctx.textAlign="center";ctx.fillText(data.fish?.icon||"🐟",leftX+leftW/2,leftY+leftH/2-20);}
  ctx.font=`bold 18px ${FONT}`;ctx.fillStyle="#E0F2FE";ctx.textAlign="center";
  ctx.fillText(fitText(ctx,data.fish?.name||"Cá",leftW-20),leftX+leftW/2,leftY+leftH-28);

  const rarity=data.fish?.rarity||"common"; const rarColor=RARITY_COLORS[rarity]||RARITY_COLORS.common;
  const badgeW=180,badgeH=32,badgeX=leftX+(leftW-badgeW)/2,badgeY=leftY+leftH+12;
  ctx.fillStyle="rgba(10,20,35,0.95)"; roundRect(ctx,badgeX,badgeY,badgeW,badgeH,8); ctx.fill();
  ctx.strokeStyle=rarColor; ctx.lineWidth=1.5; roundRect(ctx,badgeX,badgeY,badgeW,badgeH,8); ctx.stroke();
  ctx.font=`bold 13px ${FONT}`; ctx.fillStyle=rarColor; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(`PHẨM CẤP: ${RARITY_LABELS[rarity]||rarity.toUpperCase()}`,badgeX+badgeW/2,badgeY+badgeH/2);

  const rightX=390,rightY=84,rightW=480,avSize=56;
  ctx.beginPath(); ctx.arc(rightX+avSize/2,rightY+avSize/2,avSize/2,0,Math.PI*2); ctx.fillStyle="#0E2A40"; ctx.fill();
  ctx.strokeStyle="#22D3EE"; ctx.lineWidth=2; ctx.stroke();
  if(data.avatarPath){const av=await safeLoadImage(data.avatarPath);if(av){ctx.save();ctx.beginPath();ctx.arc(rightX+avSize/2,rightY+avSize/2,avSize/2-1,0,Math.PI*2);ctx.clip();ctx.drawImage(av,rightX,rightY,avSize,avSize);ctx.restore();}}
  else{ctx.font=`bold 20px ${FONT}`;ctx.fillStyle="#22D3EE";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(data.displayName||"?").slice(0,1).toUpperCase(),rightX+avSize/2,rightY+avSize/2);}
  ctx.font=`bold 20px ${FONT}`;ctx.fillStyle="#F0F9FF";ctx.textAlign="left";ctx.textBaseline="middle";
  ctx.fillText(fitText(ctx,data.displayName||"Người chơi",280),rightX+avSize+14,rightY+16);
  ctx.font=`600 14px ${FONT}`;ctx.fillStyle="rgba(150,210,230,0.9)";
  ctx.fillText(`Lv.${data.fishingLevel||1} Cần Thủ`,rightX+avSize+14,rightY+38);

  let y=rightY+72;
  ctx.font=`bold 28px ${FONT}`;ctx.fillStyle="#22D3EE";ctx.fillText(fitText(ctx,data.fish?.name||"Cá",rightW-20),rightX,y); y+=44;
  for (const row of [
    {icon:"📏",label:"Kích thước:",value:`${data.size} cm`,color:"#E0F2FE"},
    {icon:"💰",label:"Giá bán ước tính:",value:`+${Number(data.price||0).toLocaleString("vi-VN")}$`,color:"#4ADE80"},
    {icon:"✨",label:"EXP nhận được:",value:`+${data.expGain||100} EXP`,color:"#22D3EE"},
  ]) {
    ctx.font=`16px ${FONT}`;ctx.fillStyle="rgba(180,210,230,0.85)";ctx.fillText(`${row.icon}  ${row.label}`,rightX,y);
    const lw=ctx.measureText(`${row.icon}  ${row.label} `).width;
    ctx.font=`bold 16px ${FONT}`;ctx.fillStyle=row.color;ctx.fillText(row.value,rightX+lw+4,y); y+=32;
  }
  y+=8; ctx.strokeStyle="rgba(34,211,238,0.25)"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(rightX,y); ctx.lineTo(rightX+rightW-20,y); ctx.stroke(); y+=20;
  for (const line of [
    {icon:"🎣",text:`Cần: ${data.rod?.name||"Cần Tre"}`},
    {icon:"🪱",text:`Mồi: ${data.bait?.name||"Mồi Giun"}${data.baitRemaining!=null?` (x${data.baitRemaining})`:""}`},
    {icon:"📍",text:`Vị trí: ${data.map?.name||"Hồ Bé"}`},
  ]) { ctx.font=`15px ${FONT}`; ctx.fillStyle="rgba(200,220,240,0.9)"; ctx.fillText(`${line.icon}  ${line.text}`,rightX,y); y+=28; }
  y+=6; const expNeed=data.fishingExpRequired||100, expCur=data.fishingExp||0;
  ctx.font=`13px ${FONT}`; ctx.fillStyle="rgba(150,200,220,0.85)";
  ctx.fillText(`⭐ Level ${data.fishingLevel||1} (${expCur}/${expNeed} EXP)`,rightX,y); y+=18;
  drawProgressBar(ctx,rightX,y,rightW-40,12,expNeed>0?expCur/expNeed:1,"#22D3EE");
  return canvas.toBuffer("image/png");
}

export async function renderFailResult(data) {
  ensureDataFiles();
  const W=640,H=280; const canvas=createCanvas(W,H); const ctx=canvas.getContext("2d");
  const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#0A1218"); bg.addColorStop(1,"#0C1A28");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="rgba(239,68,68,0.5)"; ctx.lineWidth=2.5; roundRect(ctx,10,10,W-20,H-20,14); ctx.stroke();
  ctx.font=`bold 26px ${FONT}`; ctx.fillStyle="#F87171"; ctx.textAlign="center"; ctx.fillText("🎣 CÂU CÁ THẤT BẠI",W/2,70);
  ctx.font=`18px ${FONT}`; ctx.fillStyle="#E0F2FE"; ctx.fillText("🐟 Cá đã thoát mất!",W/2,120);
  ctx.font=`16px ${FONT}`; ctx.fillStyle="rgba(180,200,220,0.9)"; ctx.fillText(`🪱 Đã mất 1 ${data.baitConsumed||"Mồi"}`,W/2,160);
  ctx.font=`14px ${FONT}`; ctx.fillStyle="rgba(120,160,180,0.8)"; ctx.fillText("Thử lại với .cauca cau",W/2,210);
  return canvas.toBuffer("image/png");
}

export async function renderMapCanvas(maps, currentMapId) {
  ensureDataFiles();
  const W=720, rowH=88, headerH=64, pad=20;
  const H=headerH+pad+maps.length*rowH+pad+50;
  const canvas=createCanvas(W,H); const ctx=canvas.getContext("2d");
  const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#061018"); bg.addColorStop(1,"#0A1A28");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="rgba(34,211,238,0.5)"; ctx.lineWidth=2.5; roundRect(ctx,8,8,W-16,H-16,16); ctx.stroke();
  ctx.fillStyle="rgba(8,24,40,0.95)"; roundRect(ctx,18,18,W-36,48,10); ctx.fill();
  ctx.font=`bold 22px ${FONT}`; ctx.fillStyle="#22D3EE"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("🗺️  BẢN ĐỒ CÂU CÁ",W/2,42);
  let y=headerH+pad;
  maps.forEach((m,i)=>{
    const isCurrent=m.id===currentMapId; const x=24, boxW=W-48;
    ctx.fillStyle=isCurrent?"rgba(14,40,60,0.95)":"rgba(8,22,36,0.9)"; roundRect(ctx,x,y,boxW,rowH-10,12); ctx.fill();
    ctx.strokeStyle=isCurrent?"#22D3EE":"rgba(34,211,238,0.3)"; ctx.lineWidth=isCurrent?2:1; roundRect(ctx,x,y,boxW,rowH-10,12); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+28,y+(rowH-10)/2,16,0,Math.PI*2); ctx.fillStyle=isCurrent?"#22D3EE":"rgba(30,60,80,0.9)"; ctx.fill();
    ctx.font=`bold 14px ${FONT}`; ctx.fillStyle=isCurrent?"#061018":"#E0F2FE"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(String(i+1),x+28,y+(rowH-10)/2);
    ctx.textAlign="left"; ctx.font=`bold 17px ${FONT}`; ctx.fillStyle="#F0F9FF"; ctx.fillText(m.name,x+56,y+24);
    ctx.font=`13px ${FONT}`; ctx.fillStyle="rgba(180,210,230,0.85)";
    ctx.fillText(`${"⭐".repeat(m.stars||1)}  ${m.difficultyLabel||""}  ·  Lv.${m.requiredLevel||1}+`,x+56,y+48);
    if(isCurrent){ctx.font=`bold 12px ${FONT}`;ctx.fillStyle="#4ADE80";ctx.textAlign="right";ctx.fillText("● ĐANG Ở ĐÂY",x+boxW-16,y+(rowH-10)/2);}
    y+=rowH;
  });
  ctx.font=`14px ${FONT}`; ctx.fillStyle="rgba(150,200,220,0.85)"; ctx.textAlign="center";
  ctx.fillText("📍 Reply số vị trí để di chuyển",W/2,H-28);
  return canvas.toBuffer("image/png");
}

export async function renderRankCanvas(rankList, nameMap={}) {
  ensureDataFiles();
  const W=720, rowH=52, headerH=70;
  const H=headerH+20+Math.max(rankList.length,1)*rowH+30;
  const canvas=createCanvas(W,Math.max(H,200)); const ctx=canvas.getContext("2d");
  const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,"#061018"); bg.addColorStop(1,"#0A1A28");
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,canvas.height);
  ctx.strokeStyle="rgba(34,211,238,0.5)"; ctx.lineWidth=2.5; roundRect(ctx,8,8,W-16,canvas.height-16,16); ctx.stroke();
  ctx.fillStyle="rgba(8,24,40,0.95)"; roundRect(ctx,18,18,W-36,48,10); ctx.fill();
  ctx.font=`bold 22px ${FONT}`; ctx.fillStyle="#FBBF24"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText("🏆  TOP 15 CẦN THỦ",W/2,42);
  const medals=["🥇","🥈","🥉"]; let y=headerH+10;
  if(!rankList.length){ctx.font=`16px ${FONT}`;ctx.fillStyle="rgba(150,180,200,0.8)";ctx.fillText("Chưa có dữ liệu xếp hạng.",W/2,headerH+40);}
  rankList.forEach((u,i)=>{
    const x=24, boxW=W-48;
    ctx.fillStyle=i<3?"rgba(20,40,55,0.95)":"rgba(8,22,36,0.85)"; roundRect(ctx,x,y,boxW,rowH-6,10); ctx.fill();
    ctx.strokeStyle=i<3?"rgba(251,191,36,0.4)":"rgba(34,211,238,0.2)"; ctx.lineWidth=1; roundRect(ctx,x,y,boxW,rowH-6,10); ctx.stroke();
    const medal=medals[i]||`${i+1}.`;
    ctx.font=`bold 16px ${FONT}`; ctx.fillStyle="#F0F9FF"; ctx.textAlign="left"; ctx.textBaseline="middle";
    const name=nameMap[u.userId]||u.userId?.slice(-6)||"???";
    ctx.fillText(`${medal}  ${fitText(ctx,name,160)}`,x+14,y+(rowH-6)/2);
    ctx.font=`13px ${FONT}`; ctx.fillStyle="rgba(180,210,230,0.9)"; ctx.textAlign="right";
    ctx.fillText(`Lv.${u.fishingLevel}  ·  🐟 ${u.totalCaught}  ·  📏 ${Math.round(u.totalSize)}cm  ·  💰 ${Number(u.totalSoldValue||0).toLocaleString("vi-VN")}$`,x+boxW-14,y+(rowH-6)/2);
    y+=rowH;
  });
  return canvas.toBuffer("image/png");
}

export function saveBufferToTempImage(buffer, prefix="cauca") {
  ensureDataFiles();
  const file=path.join(TEMP_DIR,`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}.png`);
  fs.writeFileSync(file, buffer);
  return file;
}
