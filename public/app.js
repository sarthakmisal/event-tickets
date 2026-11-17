(function(){

'use strict';

/* ====================== data ====================== */
var ORIGIN=location.origin;
var NOW=new Date();
var S={user:null,org:{name:'',first:'',fee:''},events:[],bookings:[],
  totals:{sold:0,checked:0,sales:0,paidBookings:0,pending:0,pendingAmt:0,fee:0,share:0,received:0,pendingPayout:0},
  team:[],settings:{waConnected:false,waNumber:'',apiKeySaved:false,autoSend:false,attachImg:true,msg:'',address:'',phone:'',email:'',gstin:''},detail:null};
var ui={bkFilter:'all',bkQuery:'',evFilter:'all',evQuery:'',scanLog:[],scanResult:null,newRole:'staff'};
var F=null; // new-event form state

function api(method,url,body){
  var opt={method:method,headers:{'X-Requested-With':'fetch'},credentials:'same-origin'};
  if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body)}
  return fetch('/api'+url,opt).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){
      if(r.status===401&&url!=='/auth/login'){showLogin(url==='/me'?'':j.error);throw {handled:true}}
      if(!r.ok){var e=new Error(j.error||'Something went wrong. Try again.');e.field=j.field;e.status=r.status;throw e}
      return j;
    });
  });
}
function fixEvent(e){e.date=new Date(e.date);return e}
function fixBooking(b){b.at=new Date(b.at);if(b.checkedAt)b.checkedAt=new Date(b.checkedAt);return b}
function fixMember(m){if(m.last)m.last=new Date(m.last);return m}

/* ====================== helpers ====================== */
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function ico(n,c){return '<svg class="ico '+(c||'')+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>'}
function inr(n){return '₹'+Number(n).toLocaleString('en-IN')}
function fDate(d){return d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear()}
function fTime(d){var h=d.getHours(),m=d.getMinutes(),ap=h>=12?'pm':'am';h=h%12||12;return h+':'+String(m).padStart(2,'0')+' '+ap}
function fDT(d){return fDate(d)+', '+fTime(d)}
function pad(n){return String(n).padStart(2,'0')}
function toLocalInput(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())}
function hue(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h}
function av(name){return '<span class="avatar" style="--h:'+hue(name)+'">'+esc(name.trim().charAt(0).toUpperCase())+'</span>'}
function $(s,r){return (r||document).querySelector(s)}
function evById(id){return S.events.find(function(e){return e.id===id})||(S.detail&&S.detail.event.id===id?S.detail.event:null)}
function evStats(id){var e=evById(id);return e&&e.stats?e.stats:{sold:0,checked:0,sales:0}}
function evStatus(e){
  var st=evStats(e.id);
  if(e.date<NOW)return {k:'ended',label:'Ended',cls:''};
  if(!e.open)return {k:'closed',label:'Closed',cls:'warn'};
  if(e.cap&&st.sold>=e.cap)return {k:'soldout',label:'Sold out',cls:'bad'};
  return {k:'live',label:'Live',cls:'good live'};
}
function statusPill(e){var s=evStatus(e);return '<span class="pill '+s.cls+'">'+(s.k==='live'?'<i></i>':'')+s.label+'</span>'}
function totals(){return S.totals}
function slugify(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)}
function greet(){var h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening'}
function copyText(t){
  var done=function(){toast('Copied to clipboard')};
  try{navigator.clipboard.writeText(t).then(done,function(){toast('Copy blocked here. Select the text and copy it.','bad')})}
  catch(e){toast('Copy blocked here. Select the text and copy it.','bad')}
}
function toast(msg,kind){
  var w=$('#toasts');var t=document.createElement('div');
  t.className='toast '+(kind||'');t.innerHTML=ico(kind==='bad'?'alert':'circle-check')+'<span>'+esc(msg)+'</span>';
  w.innerHTML='';w.appendChild(t);
  clearTimeout(toast._t);toast._t=setTimeout(function(){t.remove()},2800);
}
function modal(o){
  var root=$('#modal-root');
  root.innerHTML='<div class="modal-wrap" data-act="modalBg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title"><h3 id="m-title">'+esc(o.title)+'</h3>'+o.body+'<div class="row"><button class="btn" data-act="modalClose">Cancel</button><button class="btn primary" data-act="modalOk">'+esc(o.ok)+'</button></div></div></div>';
  modal._ok=o.onOk;
  var f=root.querySelector('input');if(f)f.focus();
}
function closeModal(){$('#modal-root').innerHTML='';modal._ok=null}

/* ====================== views ====================== */
function bookingsTable(list,showEvent){
  if(!list.length)return '<div class="empty"><b>No bookings found</b>Try a different filter or search.</div>';
  var rows=list.map(function(b){
    var e=evById(b.ev);
    return '<tr>'+
      '<td class="full"><div class="person">'+av(b.name)+'<div><b>'+esc(b.name)+'</b><small class="num">'+esc(b.phone)+'</small></div></div></td>'+
      (showEvent?'<td data-label="Event"><a class="ev-name" href="#event-'+esc(b.ev)+'">'+esc(e?e.name:b.ev)+'</a></td>':'')+
      '<td data-label="Persons" class="num">'+b.qty+'</td>'+
      '<td data-label="Amount" class="num"><b>'+inr(b.amount)+'</b></td>'+
      '<td data-label="Status"><span class="pill '+(b.status==='paid'?'good':'warn')+'">'+(b.status==='paid'?'Paid':'Pending')+'</span></td>'+
      '<td data-label="Time" class="num" style="color:var(--muted)">'+fDate(b.at)+'</td></tr>';
  }).join('');
  return '<div class="tbl stack-tbl"><table><thead><tr><th>Customer</th>'+(showEvent?'<th>Event</th>':'')+'<th>Persons</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function filteredBookings(list){
  var q=ui.bkQuery.trim().toLowerCase();
  return list.filter(function(b){
    if(ui.bkFilter!=='all'&&b.status!==ui.bkFilter)return false;
    if(!q)return true;
    var e=evById(b.ev);
    return (b.name+' '+b.phone+' '+(e?e.name:'')+' '+b.code).toLowerCase().indexOf(q)>-1;
  });
}

function viewOverview(){
  var t=totals(),s=S.settings;
  var pct=t.sold?Math.round(t.checked/t.sold*100):0;
  var evRows=S.events.map(function(e){
    var st=evStats(e.id);
    var sold=e.cap?'<div class="num">'+st.sold+' <span style="color:var(--muted)">/ '+e.cap+'</span></div><div class="bar" style="margin-top:6px;max-width:150px"><i style="width:'+Math.min(100,st.sold/e.cap*100)+'%"></i></div>':'<span class="num">'+st.sold+'</span>';
    return '<tr><td class="full"><a class="ev-name" href="#event-'+e.id+'">'+esc(e.name)+'</a><span class="cell-sub num">'+fDT(e.date)+'</span></td>'+
      '<td data-label="Sold">'+sold+'</td><td data-label="Checked in" class="num">'+st.checked+'</td><td data-label="Sales" class="num"><b>'+inr(st.sales)+'</b></td><td data-label="Status">'+statusPill(e)+'</td></tr>';
  }).join('');
  return ''+
  '<header class="page-head"><div><p class="eyebrow">'+fDate(new Date())+'</p><h1>'+greet()+', '+esc(S.org.first)+'</h1><p class="sub">Here’s how '+esc(S.org.name)+' is doing across all events.</p></div>'+
  '<a class="btn primary" href="#event-new">'+ico('plus')+'New event</a></header>'+
  (!s.autoSend?'<div class="banner">'+ico('chat')+'<span>WhatsApp tickets are off. <a href="#config">Turn on in Settings</a></span></div>':'')+
  '<section class="kpis" aria-label="Summary">'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip green">'+ico('rupee')+'</div><span class="kpi-label">Total sales</span></div><div class="kpi-value num">'+inr(t.sales)+'</div><div class="kpi-sub">'+t.paidBookings+' paid bookings</div></article>'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip indigo">'+ico('ticket')+'</div><span class="kpi-label">Tickets sold</span></div><div class="kpi-value num">'+t.sold+'</div><div class="kpi-sub">persons</div></article>'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip sky">'+ico('usercheck')+'</div><span class="kpi-label">Checked in</span></div><div class="kpi-value num">'+t.checked+'</div><div class="kpi-sub"><span>'+pct+'% of tickets sold</span><div class="bar"><i style="width:'+pct+'%"></i></div></div></article>'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip amber">'+ico('wallet')+'</div><span class="kpi-label">Pending payout</span></div><div class="kpi-value num">'+inr(t.pendingPayout)+'</div><div class="kpi-sub">'+inr(t.received)+' received so far</div></article>'+
  '</section>'+
  '<section class="dash-grid">'+
    '<div class="card"><div class="card-head"><h2>Events</h2><a class="link" href="#events">View all '+ico('right')+'</a></div>'+
      '<div class="tbl stack-tbl"><table><thead><tr><th>Event</th><th>Sold</th><th>Checked in</th><th>Sales</th><th>Status</th></tr></thead><tbody>'+evRows+'</tbody></table></div></div>'+
    '<div class="card"><div class="card-head"><h2>Earnings</h2><span class="hint">Fee: '+esc(S.org.fee)+'</span></div><div class="earn">'+
      '<div class="earn-row"><span>Ticket sales</span><b>'+inr(t.sales)+'</b></div>'+
      '<div class="earn-row"><span>Platform fee</span><b>− '+inr(t.fee)+'</b></div>'+
      '<div class="earn-row total"><span>Your share</span><b>'+inr(t.share)+'</b></div>'+
      '<div class="earn-row"><span>Received</span><b class="rec">'+inr(t.received)+'</b></div>'+
      '<div class="payout"><small>Pending payout</small><b class="num">'+inr(t.pendingPayout)+'</b></div></div></div>'+
  '</section>'+
  '<section class="card"><div class="card-head"><div><h2>Latest bookings</h2>'+(t.pending?'<p class="hint num">'+t.pending+' pending bookings worth '+inr(t.pendingAmt)+' are not paid yet</p>':'')+'</div>'+
    '<div class="toolbar" style="flex:1;justify-content:flex-end">'+
      '<div class="search" style="max-width:260px">'+ico('search')+'<input type="text" id="bk-q" placeholder="Search name, phone, event" value="'+esc(ui.bkQuery)+'" aria-label="Search bookings"></div>'+
      '<div class="seg" role="group" aria-label="Filter bookings">'+bkSegButtons()+'</div></div></div>'+
    '<div id="bk-body">'+bookingsTable(filteredBookings(S.bookings),true)+'</div></section>';
}
function bkSegButtons(){
  var c={all:S.bookings.length,paid:0,pending:0};S.bookings.forEach(function(b){c[b.status]++});
  return [['all','All'],['paid','Paid'],['pending','Pending']].map(function(x){
    return '<button data-act="bkFilter" data-v="'+x[0]+'" aria-pressed="'+(ui.bkFilter===x[0])+'">'+x[1]+'<span class="ct num">'+c[x[0]]+'</span></button>';
  }).join('');
}

function eventRows(){
  var q=ui.evQuery.trim().toLowerCase();
  var list=S.events.slice().sort(function(a,b){return b.date-a.date}).filter(function(e){
    var s=evStatus(e).k;
    if(ui.evFilter==='live'&&s!=='live')return false;
    if(ui.evFilter==='ended'&&s!=='ended')return false;
    return !q||(e.name+' '+e.venue).toLowerCase().indexOf(q)>-1;
  });
  if(!list.length)return '<div class="empty"><b>No events found</b>Try another filter, or create a new event.</div>';
  return '<div class="tbl stack-tbl"><table><thead><tr><th>Event</th><th>Date</th><th class="r">Price</th><th>Sold</th><th class="r">Checked in</th><th class="r">Sales</th><th>Status</th><th></th></tr></thead><tbody>'+
  list.map(function(e){
    var st=evStats(e.id);
    var sold=e.cap?'<div class="num">'+st.sold+' <span style="color:var(--muted)">/ '+e.cap+'</span></div><div class="bar" style="margin-top:6px;max-width:130px"><i style="width:'+Math.min(100,st.sold/e.cap*100)+'%"></i></div>':'<span class="num">'+st.sold+'</span>';
    return '<tr><td class="full"><a class="ev-name" href="#event-'+e.id+'">'+esc(e.name)+'</a><span class="cell-sub">'+esc(e.venue)+'</span></td>'+
    '<td data-label="Date" class="num">'+fDT(e.date)+'</td><td data-label="Price" class="r num">'+(e.price?inr(e.price):'Free')+'</td><td data-label="Sold">'+sold+'</td>'+
    '<td data-label="Checked in" class="r num">'+st.checked+'</td><td data-label="Sales" class="r num"><b>'+inr(st.sales)+'</b></td><td data-label="Status">'+statusPill(e)+'</td>'+
    '<td class="r"><a class="link" href="#event-'+e.id+'">Open '+ico('right')+'</a></td></tr>';
  }).join('')+'</tbody></table></div>';
}
function viewEvents(){
  var c={all:S.events.length,live:0,ended:0};S.events.forEach(function(e){var k=evStatus(e).k;if(k==='live')c.live++;if(k==='ended')c.ended++});
  return '<header class="page-head"><div><h1>Events</h1><p class="sub">Every event you sell tickets for. Open one for its booking QR, bookings and entries.</p></div><a class="btn primary" href="#event-new">'+ico('plus')+'New event</a></header>'+
  '<section class="card"><div class="card-head"><div class="toolbar" style="flex:1">'+
    '<div class="search" style="max-width:340px">'+ico('search')+'<input type="text" id="ev-q" placeholder="Search events or venues" value="'+esc(ui.evQuery)+'" aria-label="Search events"></div>'+
    '<div class="seg" role="group" aria-label="Filter events">'+
      [['all','All'],['live','Live'],['ended','Ended']].map(function(x){return '<button data-act="evFilter" data-v="'+x[0]+'" aria-pressed="'+(ui.evFilter===x[0])+'">'+x[1]+'<span class="ct num">'+c[x[0]]+'</span></button>'}).join('')+
    '</div></div></div><div id="ev-body">'+eventRows()+'</div></section>';
}

function viewEventDetail(id){
  var e=evById(id);
  if(!e)return '<div class="empty card"><b>Event not found</b><a class="link" href="#events">Back to events</a></div>';
  var st=evStats(e.id),bks=(S.detail?S.detail.bookings:[]).slice();
  var entries=bks.filter(function(b){return b.checked}).sort(function(a,b){return b.checkedAt-a.checkedAt});
  var url=ORIGIN+'/e/'+e.id;
  var ended=e.date<NOW;
  return '<header class="page-head"><div><a class="back" href="#events">'+ico('left')+'All events</a><h1>'+esc(e.name)+'</h1>'+
    '<div class="meta"><span>'+ico('calendar')+fDT(e.date)+'</span><span>'+ico('pin')+esc(e.venue)+'</span><span>'+statusPill(e)+'</span></div>'+
    (e.desc?'<p class="sub">'+esc(e.desc)+'</p>':'')+'</div>'+
    '<button class="btn" data-act="copy" data-v="'+esc(url)+'">'+ico('copy')+'Copy booking link</button></header>'+
  '<section class="kpis">'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip green">'+ico('rupee')+'</div><span class="kpi-label">Sales</span></div><div class="kpi-value num">'+inr(st.sales)+'</div></article>'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip indigo">'+ico('ticket')+'</div><span class="kpi-label">Sold</span></div><div class="kpi-value num">'+st.sold+(e.cap?'<span style="font-size:18px;color:var(--muted)"> / '+e.cap+'</span>':'')+'</div></article>'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip sky">'+ico('usercheck')+'</div><span class="kpi-label">Checked in</span></div><div class="kpi-value num">'+st.checked+'</div></article>'+
    '<article class="card kpi"><div class="kpi-top"><div class="chip amber">'+ico('ticket')+'</div><span class="kpi-label">Price</span></div><div class="kpi-value num">'+(e.price?inr(e.price):'Free')+'</div></article>'+
  '</section>'+
  '<section class="split"><div class="stack">'+
    '<div class="card"><div class="card-head"><h2>Bookings</h2><span class="hint num">'+bks.length+' total</span></div>'+bookingsTable(bks.sort(function(a,b){return b.at-a.at}),false)+'</div>'+
    '<div class="card"><div class="card-head"><h2>Entries</h2><span class="hint num">'+entries.length+' checked in</span></div>'+
      (entries.length?entries.map(function(b){return '<div class="entry">'+av(b.name)+'<div><b>'+esc(b.name)+'</b><small class="cell-sub num">'+b.qty+' person · '+esc(b.code)+'</small></div><div class="t">'+fDT(b.checkedAt)+'<br>by '+esc(b.by||'staff')+'</div></div>'}).join(''):'<div class="empty"><b>No entries yet</b>People appear here once their ticket is scanned at the gate.</div>')+
    '</div></div>'+
    '<aside class="stack">'+
      '<div class="card qr-card"><h2 style="font:700 17px var(--font-display)">Booking QR</h2><p class="sub" style="margin:0">Print it or show it on a screen. Scanning opens your booking page.</p>'+
        '<div class="qr-box" id="qr-box"></div><div class="url" id="qr-url">'+esc(url)+'</div>'+
        '<button class="btn" data-act="copy" data-v="'+esc(url)+'" style="width:100%">'+ico('copy')+'Copy link</button></div>'+
      '<div class="card card-body"><div class="sw-row"><div><b>Open for booking</b><small>'+(ended?'This event has ended, so new bookings are closed anyway.':'Turn off to stop new bookings. Tickets already sold still work at the gate.')+'</small></div>'+
        '<button class="switch" role="switch" aria-label="Open for booking" aria-checked="'+e.open+'" data-act="evOpen" data-v="'+e.id+'"></button></div></div>'+
    '</aside></section>';
}
function afterEventDetail(id){
  var box=$('#qr-box');if(!box)return;
  box.innerHTML='<img alt="Booking QR code" width="180" height="180" src="/api/events/'+encodeURIComponent(id)+'/qr.png">';
}

/* ---- new event ---- */
function newForm(){
  var d=new Date(NOW.getTime()+14*864e5);d.setHours(19,0,0,0);
  return {name:'',slug:'',slugTouched:false,date:toLocalInput(d),venue:'',desc:'',price:'',max:'10',cap:'0',askNames:false,open:true};
}
function viewEventNew(){
  if(!F)F=newForm();
  return '<header class="page-head"><div><a class="back" href="#events">'+ico('left')+'Events</a><h1>New event</h1><p class="sub">Fill in the details. You’ll get a booking QR code to print right after.</p></div></header>'+
  '<form class="new-grid" id="new-form" novalidate>'+
    '<div class="stack">'+
      '<section class="card"><div class="card-head"><h2>Event details</h2></div><div class="card-body stack">'+
        '<div class="field"><label for="f-name">Event name</label><input type="text" id="f-name" placeholder="Garba night 2026" value="'+esc(F.name)+'" autocomplete="off"><p class="err" id="e-name"></p></div>'+
        '<div class="field"><label for="f-slug">Booking link</label><div class="affix"><span>/e/</span><input type="text" id="f-slug" placeholder="garba-night-2026" value="'+esc(F.slug)+'" autocomplete="off"></div><p class="note">The event QR code points to this link.</p><p class="err" id="e-slug"></p></div>'+
        '<div class="grid-2"><div class="field"><label for="f-date">Date &amp; time</label><input type="datetime-local" id="f-date" value="'+esc(F.date)+'"><p class="err" id="e-date"></p></div>'+
        '<div class="field"><label for="f-venue">Venue</label><input type="text" id="f-venue" placeholder="Green Palace, Ahilyanagar" value="'+esc(F.venue)+'"><p class="err" id="e-venue"></p></div></div>'+
        '<div class="field"><label for="f-desc">Description <span class="opt">(optional)</span></label><textarea id="f-desc" style="min-height:100px" placeholder="What should guests know?">'+esc(F.desc)+'</textarea></div>'+
      '</div></section>'+
      '<section class="card"><div class="card-head"><h2>Tickets</h2></div><div class="card-body stack">'+
        '<div class="grid-3"><div class="field"><label for="f-price">Price per person (₹)</label><input type="number" id="f-price" min="0" inputmode="numeric" placeholder="499" value="'+esc(F.price)+'"><p class="err" id="e-price"></p></div>'+
        '<div class="field"><label for="f-max">Max persons per booking</label><input type="number" id="f-max" min="1" inputmode="numeric" value="'+esc(F.max)+'"><p class="err" id="e-max"></p></div>'+
        '<div class="field"><label for="f-cap">Total capacity</label><input type="number" id="f-cap" min="0" inputmode="numeric" value="'+esc(F.cap)+'"><p class="note">0 = no limit</p><p class="err" id="e-cap"></p></div></div>'+
        '<div><div class="sw-row"><div><b>Ask for each person’s name</b><small>Off: one name per booking. On: the form asks for a name for every person on the ticket, and the names are printed on it.</small></div><button type="button" class="switch" role="switch" aria-label="Ask for each person’s name" aria-checked="'+F.askNames+'" data-act="fSwitch" data-v="askNames"></button></div>'+
        '<div class="sw-row"><div><b>Open for booking</b><small>Turn off to stop new bookings. Tickets already sold still work at the gate.</small></div><button type="button" class="switch" role="switch" aria-label="Open for booking" aria-checked="'+F.open+'" data-act="fSwitch" data-v="open"></button></div></div>'+
      '</div></section>'+
      '<div class="form-actions"><button type="submit" class="btn primary">Create event</button><a class="btn" href="#events">Cancel</a></div>'+
    '</div>'+
    '<aside class="preview"><p class="lbl" style="margin-bottom:10px;color:var(--muted)">Ticket preview</p><div id="ticket-prev"></div></aside>'+
  '</form>';
}
function ticketPreview(){
  var price=parseFloat(F.price);var dt=F.date?new Date(F.date):null;
  var cap=parseInt(F.cap,10);
  $('#ticket-prev').innerHTML='<div class="ticket"><div class="ticket-top"><small>Admit one</small><h3>'+esc(F.name||'Your event name')+'</h3>'+
    '<p>'+ico('calendar')+(dt&&!isNaN(dt)?fDT(dt):'Pick a date')+'</p><p>'+ico('pin')+esc(F.venue||'Venue')+'</p></div>'+
    '<div class="ticket-cut"></div><div class="ticket-bot"><div><small>Per person</small><b class="num">'+(isNaN(price)||price===0?(F.price===''?'₹—':'Free'):inr(price))+'</b>'+
    '<small style="margin-top:6px">'+(cap>0?cap+' tickets':'No capacity limit')+(F.askNames?' · names on ticket':'')+'</small></div><div class="ticket-qr">'+ico('qr')+'</div></div></div>';
}
function validateNew(){
  var err={};
  if(!F.name.trim())err.name='Enter an event name.';
  if(!F.slug.trim())err.slug='Enter a booking link.';
  else if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(F.slug))err.slug='Use lowercase letters, numbers and hyphens only.';
  else if(F.slug==='new'||evById(F.slug))err.slug='This link is already used. Try another.';
  if(!F.date||isNaN(new Date(F.date)))err.date='Pick a date and time.';
  if(!F.venue.trim())err.venue='Enter the venue.';
  if(F.price===''||parseFloat(F.price)<0||isNaN(parseFloat(F.price)))err.price='Enter a price, or 0 for free.';
  if(!(parseInt(F.max,10)>=1))err.max='Must be at least 1.';
  if(F.cap===''||parseInt(F.cap,10)<0||isNaN(parseInt(F.cap,10)))err.cap='Enter 0 for no limit.';
  ['name','slug','date','venue','price','max','cap'].forEach(function(k){
    var el=$('#e-'+k),inp=$('#f-'+k);if(el)el.textContent=err[k]||'';if(inp)inp.classList.toggle('bad',!!err[k]);
  });
  return err;
}

/* ---- team ---- */
function teamRows(){
  return '<div class="tbl stack-tbl"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last login</th><th class="r">Actions</th></tr></thead><tbody>'+
  S.team.map(function(m){
    return '<tr><td class="full"><div class="person">'+av(m.name)+'<div><b>'+esc(m.name)+(m.you?' <span style="color:var(--muted);font-weight:600">(you)</span>':'')+'</b><small>'+esc(m.email)+'</small></div></div></td>'+
    '<td data-label="Role"><span class="pill '+(m.role==='admin'?'accent':'')+'">'+(m.role==='admin'?'Admin':'Gate staff')+'</span></td>'+
    '<td data-label="Status"><span class="pill '+(m.active?'good':'warn')+'"><i></i>'+(m.active?'Active':'Disabled')+'</span></td>'+
    '<td data-label="Last login" class="num" style="color:var(--muted)">'+(m.last?fDT(m.last):'Never')+'</td>'+
    '<td class="r full"><div class="row-actions"><button class="btn sm" data-act="pwd" data-v="'+m.id+'">'+ico('key')+'Password</button>'+
    (m.you?'':'<button class="btn sm '+(m.active?'danger':'')+'" data-act="toggleMember" data-v="'+m.id+'">'+(m.active?'Disable':'Enable')+'</button>')+'</div></td></tr>';
  }).join('')+'</tbody></table></div>';
}
function viewTeam(){
  return '<header class="page-head"><div><h1>Team</h1><p class="sub">People who can sign in for your events. Gate staff can only scan tickets at the entry; admins can manage everything.</p></div></header>'+
  '<section class="team-grid"><div class="card"><div class="card-head"><h2>Members <span class="num" style="color:var(--muted)" id="mem-ct">('+S.team.length+')</span></h2></div><div id="team-body">'+teamRows()+'</div></div>'+
  '<form class="card" id="member-form" novalidate><div class="card-head"><h2>Add a member</h2></div><div class="card-body stack">'+
    '<div class="field"><label for="m-name">Name</label><input type="text" id="m-name" placeholder="Full name" autocomplete="off"><p class="err" id="e-mname"></p></div>'+
    '<div class="field"><label for="m-email">Email <span class="opt">(used to sign in)</span></label><input type="email" id="m-email" placeholder="name@example.com" autocomplete="off"><p class="err" id="e-memail"></p></div>'+
    '<div class="field"><label for="m-pass">Password</label><input type="password" id="m-pass" placeholder="At least 8 characters" autocomplete="new-password"><p class="err" id="e-mpass"></p></div>'+
    '<div class="field"><span class="lbl">Role</span><div class="role" role="radiogroup" aria-label="Role">'+
      '<button type="button" role="radio" aria-checked="'+(ui.newRole==='staff')+'" data-act="role" data-v="staff"><b>Gate staff</b><small>Scanner only</small></button>'+
      '<button type="button" role="radio" aria-checked="'+(ui.newRole==='admin')+'" data-act="role" data-v="admin"><b>Admin</b><small>Everything</small></button></div></div>'+
    '<button class="btn primary" type="submit">'+ico('plus')+'Add member</button></div></form></section>';
}

/* ---- settings ---- */
var VARS=['name','event','organiser','ticketCode','bookingCode','quantity','amount','date','venue','ticketUrl'];
var SAMPLE={name:'Vishal',event:'Diwali night',organiser:'Jivan Mhaske',ticketCode:'DW-4K7Q',bookingCode:'BK-20418',quantity:'1',amount:'₹1',date:'26 Oct 2026, 8:09 pm',venue:'NGR',ticketUrl:ORIGIN+'/t/DW-4K7Q'};
function renderMsg(t){return esc(t).replace(/\{\{(\w+)\}\}/g,function(m,k){return SAMPLE[k]!==undefined?SAMPLE[k]:m})}
function waPreview(){
  var s=S.settings;
  $('#wa-prev').innerHTML=(s.attachImg?'<div class="img">'+ico('qr')+'</div>':'')+'<p>'+renderMsg(s.msg)+'</p><time>8:12 pm</time>';
}
function viewConfig(){
  var s=S.settings;
  return '<header class="page-head"><div><h1>Settings</h1><p class="sub">'+esc(S.org.name)+' · Platform fee: '+esc(S.org.fee)+'</p></div></header>'+
  '<div class="stack" style="max-width:980px">'+
  '<section class="card"><div class="card-head"><h2>WhatsApp connection</h2><span class="hint">Platform number</span></div><div class="card-body">'+
    '<div class="conn"><div class="conn-ico">'+ico('chat')+'</div><div class="grow"><b>Sending from '+esc(s.waNumber)+'</b><small>Managed by the platform</small></div>'+
    '<span class="pill good live" id="wa-pill"><i></i>Connected</span><button class="btn sm" data-act="refreshWa" id="wa-btn">'+ico('refresh')+'Refresh</button></div>'+
  '</div></section>'+
  '<section class="card"><div class="card-head"><h2>kwskit API key</h2></div><div class="card-body"><div class="test-row">'+
    '<div class="field"><label for="c-key">API key</label><input type="password" id="c-key" placeholder="'+(s.apiKeySaved?'Saved. Enter a new key to replace it':'Paste your key')+'" autocomplete="off"><p class="note">Stored encrypted and never shown again. The phone-link QR appears above once the key is saved.</p></div>'+
    '<button class="btn" data-act="saveKey" style="margin-bottom:'+'22px">'+ico('key')+'Save key</button></div></div></section>'+
  '<section class="card"><div class="card-head"><h2>Ticket delivery</h2></div><div class="card-body">'+
    '<div class="sw-row"><div><b>Send ticket on WhatsApp automatically</b><small>As soon as a payment succeeds, the ticket is sent to the mobile number given in the form.</small></div><button class="switch" role="switch" aria-label="Send ticket on WhatsApp automatically" aria-checked="'+s.autoSend+'" data-act="sSwitch" data-v="autoSend"></button></div>'+
    '<div class="sw-row"><div><b>Attach the ticket image (with QR)</b><small>Off: only the text message with the ticket link is sent.</small></div><button class="switch" role="switch" aria-label="Attach the ticket image" aria-checked="'+s.attachImg+'" data-act="sSwitch" data-v="attachImg"></button></div>'+
    '<div class="msg-grid" style="margin-top:18px"><div class="field"><label for="wa-msg">Message</label><div class="chips" aria-label="Insert a field">'+
      VARS.map(function(v){return '<button type="button" class="vchip" data-act="insVar" data-v="'+v+'">{{'+v+'}}</button>'}).join('')+'</div>'+
      '<textarea id="wa-msg" rows="10">'+esc(s.msg)+'</textarea></div>'+
      '<div class="field"><span class="lbl">Preview</span><div class="phone"><small>Today</small><div class="bubble" id="wa-prev"></div></div></div></div>'+
    '<div class="save-row"><button class="btn primary" data-act="saveSettings">Save settings</button></div>'+
  '</div></section>'+
  '<section class="card"><div class="card-head"><h2>Send a test message</h2></div><div class="card-body"><div class="test-row">'+
    '<div class="field"><label for="c-test">Mobile number</label><input type="tel" id="c-test" inputmode="numeric" placeholder="10-digit number"><p class="err" id="e-test"></p></div>'+
    '<button class="btn" data-act="sendTest" style="margin-bottom:22px">'+ico('send')+'Send test</button></div></div></section>'+
  '<section class="card"><div class="card-head"><h2>Contact details</h2><span class="hint">Shown to customers on your event pages</span></div><form class="card-body stack" id="contact-form" novalidate>'+
    '<div class="field"><label for="c-address">Address</label><input type="text" id="c-address" value="'+esc(s.address)+'" placeholder="Street, city, PIN"></div>'+
    '<div class="grid-2"><div class="field"><label for="c-phone">Phone</label><input type="tel" id="c-phone" value="'+esc(s.phone)+'" placeholder="+91"><p class="err" id="e-cphone"></p></div>'+
    '<div class="field"><label for="c-email">Email</label><input type="email" id="c-email" value="'+esc(s.email)+'" placeholder="hello@example.com"><p class="err" id="e-cemail"></p></div></div>'+
    '<div class="field" style="max-width:360px"><label for="c-gstin">GSTIN <span class="opt">(optional)</span></label><input type="text" id="c-gstin" value="'+esc(s.gstin)+'" placeholder="22AAAAA0000A1Z5" style="text-transform:uppercase"><p class="err" id="e-cgstin"></p></div>'+
    '<div><button class="btn primary" type="submit">Save</button></div></form></section>'+
  '</div>';
}

/* ---- scanner ---- */
function viewScanner(){
  var r=ui.scanResult;
  return '<header class="page-head"><div><h1>Gate scanner</h1><p class="sub">Scan a ticket QR with the camera, or type the ticket code.</p></div></header>'+
  '<section class="card scan"><div class="card-body stack">'+
    '<div id="cam-wrap" hidden><video id="cam" class="cam" playsinline muted></video><button type="button" class="btn" data-act="camStop" style="width:100%;margin-top:10px">Stop camera</button></div>'+
    '<button type="button" class="btn" data-act="camStart" id="cam-btn">'+ico('scan')+'Scan with camera</button>'+
    '<form id="scan-form" class="stack" novalidate>'+
    '<div class="field"><label for="s-code">Ticket code</label><input type="text" id="s-code" placeholder="ABCD-2345" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;font-size:18px;height:52px;font-weight:700;letter-spacing:.04em"></div>'+
    '<button class="btn primary" type="submit" style="height:50px">'+ico('usercheck')+'Check in</button></form>'+
    '<div id="scan-res" aria-live="polite">'+(r?scanResultHtml(r):'')+'</div></div></section>'+
  (ui.scanLog.length?'<section class="card scan"><div class="card-head"><h2>This session</h2></div>'+ui.scanLog.map(function(l){return '<div class="entry">'+av(l.name)+'<div><b>'+esc(l.name)+'</b><small class="cell-sub">'+esc(l.event)+'</small></div><div class="t">'+fTime(l.at)+'</div></div>'}).join('')+'</section>':'');
}
function scanResultHtml(r){return '<div class="scan-result '+r.kind+'">'+ico(r.kind==='good'?'circle-check':r.kind==='warn'?'alert':'circle-x')+'<div><b>'+esc(r.title)+'</b><span>'+esc(r.text)+'</span></div></div>'}
function doScan(raw){
  var code=raw.trim().toUpperCase();
  if(!code){ui.scanResult={kind:'bad',title:'Enter a ticket code',text:'Type or paste the code printed on the ticket.'};return Promise.resolve()}
  return api('POST','/scan',{code:code}).then(function(j){
    if(j.result==='ok'){ui.scanResult={kind:'good',title:'Welcome, '+j.name,text:j.qty+' person · '+j.event};ui.scanLog.unshift({name:j.name,event:j.event,at:new Date(j.at)})}
    else if(j.result==='already')ui.scanResult={kind:'warn',title:'Already checked in',text:j.name+' entered at '+fDT(new Date(j.at))+(j.by?' (scanned by '+j.by+')':'')+'.'};
    else if(j.result==='unpaid')ui.scanResult={kind:'bad',title:'Payment pending',text:j.name+' has not paid for this ticket. Do not let them in.'};
    else ui.scanResult={kind:'bad',title:'Ticket not found',text:'No booking matches '+code+'. Check the code and try again.'};
  },function(e){if(e.handled)throw e;ui.scanResult={kind:'bad',title:'Could not check in',text:e.message}});
}
var cam={stream:null,timer:null,busy:false};
function stopCam(){
  if(cam.timer){clearInterval(cam.timer);cam.timer=null}
  if(cam.stream){cam.stream.getTracks().forEach(function(t){t.stop()});cam.stream=null}
  var w=$('#cam-wrap');if(w)w.hidden=true;var b=$('#cam-btn');if(b)b.hidden=false;
}
function startCam(){
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('This browser cannot scan QR codes. Type the code instead.','bad');return}
  var det=new window.BarcodeDetector({formats:['qr_code']});
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false}).then(function(stream){
    cam.stream=stream;var v=$('#cam');v.srcObject=stream;v.play();
    $('#cam-wrap').hidden=false;$('#cam-btn').hidden=true;
    cam.timer=setInterval(function(){
      if(cam.busy||v.readyState<2)return;cam.busy=true;
      det.detect(v).then(function(codes){
        if(!codes.length){cam.busy=false;return}
        return doScan(codes[0].rawValue).then(function(){
          var r=$('#scan-res');if(r)r.innerHTML=scanResultHtml(ui.scanResult);
          setTimeout(function(){cam.busy=false},2000);
        });
      }).catch(function(){cam.busy=false});
    },300);
  },function(){toast('Camera access was blocked. Allow it in the browser, or type the code.','bad')});
}

/* ====================== router ====================== */
var viewEl=$('#view');
var routing=0;
function parseHash(){
  var h=(location.hash||'#overview').slice(1),name=h,arg=null;
  if(h==='event-new')name='event-new';
  else if(h.indexOf('event-')===0){name='event';arg=h.slice(6)}
  return {name:name,arg:arg};
}
function load(name,arg){
  function evs(r){S.events=r.events.map(fixEvent)}
  switch(name){
    case 'overview':return Promise.all([api('GET','/overview'),api('GET','/settings')]).then(function(r){evs(r[0]);S.bookings=r[0].bookings.map(fixBooking);S.totals=r[0].totals;S.settings=r[1].settings});
    case 'events':return api('GET','/events').then(evs);
    case 'event':return api('GET','/events/'+encodeURIComponent(arg)).then(function(r){S.detail={event:fixEvent(r.event),bookings:r.bookings.map(fixBooking)}});
    case 'team':return api('GET','/team').then(function(r){S.team=r.members.map(fixMember)});
    case 'config':return api('GET','/settings').then(function(r){S.settings=r.settings});
    default:return Promise.resolve();
  }
}
function route(){
  if(!S.user)return;
  var p=parseHash(),name=p.name,arg=p.arg;
  if(S.user.role==='staff'&&name!=='scanner'){location.hash='scanner';return}
  stopCam();
  var token=++routing;
  load(name,arg).then(function(){if(token===routing)render(name,arg)},function(e){
    if(e&&e.handled)return;if(token!==routing)return;
    viewEl.innerHTML='<div class="card empty"><b>Could not load this page</b>'+esc(e.message)+'<br><br><button class="btn" data-act="retry">Try again</button></div>';
  });
}
function render(name,arg){
  var html;
  if(name!=='event-new')F=null;
  switch(name){
    case 'events':html=viewEvents();break;
    case 'event-new':html=viewEventNew();break;
    case 'event':html=viewEventDetail(arg);break;
    case 'team':html=viewTeam();break;
    case 'config':html=viewConfig();break;
    case 'scanner':html=viewScanner();break;
    default:name='overview';html=viewOverview();
  }
  viewEl.innerHTML=html;
  viewEl.style.animation='none';void viewEl.offsetWidth;viewEl.style.animation='';
  var nav=name==='event'||name==='event-new'?'events':name;
  document.querySelectorAll('[data-nav]').forEach(function(a){
    var on=a.dataset.nav===nav;a.classList.toggle('active',on);
    if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  document.title=({overview:'Dashboard',events:'Events',team:'Team',config:'Settings',scanner:'Scanner','event-new':'New event',event:'Event'}[name]||'Panel')+' · Event Tickets';
  if(name==='event')afterEventDetail(arg);
  if(name==='event-new')ticketPreview();
  if(name==='config')waPreview();
  $('#app').classList.remove('menu-open');
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);

/* ====================== session ====================== */
function applyMe(me){
  S.user=me.user;S.org=me.org;ORIGIN=me.publicUrl||location.origin;
  document.body.classList.remove('logged-out');
  document.body.classList.toggle('role-staff',me.user.role==='staff');
  $('#org-name').textContent=me.org.name;
  $('#side-user').textContent=me.user.name;
  $('#side-role').textContent=me.user.role==='admin'?'Admin':'Gate staff';
  $('#side-av').textContent=me.user.name.charAt(0).toUpperCase();
}
function showLogin(msg){
  stopCam();S.user=null;document.body.classList.add('logged-out');
  var e=$('#e-login');if(e)e.textContent=msg||'';
  var i=$('#l-email');if(i)i.focus();
}
function toastErr(e){if(e&&e.handled)return;toast(e&&e.message?e.message:'Something went wrong. Try again.','bad')}
function fieldErr(e,map){
  if(e&&e.handled)return;
  var id=e&&e.field&&map[e.field];
  if(id&&$('#'+id)){$('#'+id).textContent=e.message;var inp=$('#'+id.replace(/^e-/,'f-'));if(inp){inp.classList.add('bad');inp.focus()}}
  else toastErr(e);
}

/* ====================== actions ====================== */
var A={
  theme:function(){
    var r=document.documentElement,cur=r.getAttribute('data-theme');
    var isDark=cur?cur==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;
    r.setAttribute('data-theme',isDark?'light':'dark');
  },
  menu:function(){$('#app').classList.add('menu-open')},
  closeMenu:function(){$('#app').classList.remove('menu-open')},
  retry:function(){route()},
  logout:function(){api('POST','/auth/logout').then(function(){location.hash='';showLogin()},toastErr)},
  bkFilter:function(el){ui.bkFilter=el.dataset.v;document.querySelector('.seg[aria-label="Filter bookings"]').innerHTML=bkSegButtons();$('#bk-body').innerHTML=bookingsTable(filteredBookings(S.bookings),true)},
  evFilter:function(el){ui.evFilter=el.dataset.v;viewEl.innerHTML=viewEvents()},
  copy:function(el){copyText(el.dataset.v)},
  evOpen:function(el){var e=evById(el.dataset.v);api('PATCH','/events/'+encodeURIComponent(e.id),{open:!e.open}).then(function(r){toast(r.event.open?'Bookings are open':'Bookings are closed');route()},toastErr)},
  fSwitch:function(el){var k=el.dataset.v;F[k]=!F[k];el.setAttribute('aria-checked',F[k]);ticketPreview()},
  sSwitch:function(el){var k=el.dataset.v;S.settings[k]=!S.settings[k];el.setAttribute('aria-checked',S.settings[k]);waPreview()},
  role:function(el){ui.newRole=el.dataset.v;document.querySelectorAll('.role button').forEach(function(b){b.setAttribute('aria-checked',b.dataset.v===ui.newRole)})},
  toggleMember:function(el){
    var m=S.team.find(function(x){return x.id==el.dataset.v});
    api('PATCH','/team/'+m.id,{active:!m.active}).then(function(r){m.active=r.member.active;$('#team-body').innerHTML=teamRows();toast(m.name+(m.active?' can sign in again':' is disabled'))},toastErr);
  },
  pwd:function(el){
    var m=S.team.find(function(x){return x.id==el.dataset.v});
    modal({title:'Set a new password for '+m.name,ok:'Update password',body:'<div class="field"><label for="p-new">New password</label><input type="password" id="p-new" placeholder="At least 8 characters" autocomplete="new-password"><p class="err" id="e-pnew"></p></div>',
      onOk:function(){
        var v=$('#p-new').value;if(v.length<8){$('#e-pnew').textContent='Use at least 8 characters.';return false}
        return api('POST','/team/'+m.id+'/password',{password:v}).then(function(){toast('Password updated for '+m.name)},function(e){if(e.handled)return;$('#e-pnew').textContent=e.message;return false});
      }});
  },
  modalClose:closeModal,
  modalBg:function(el,ev){if(ev.target===el)closeModal()},
  modalOk:function(){
    var r=modal._ok&&modal._ok();
    if(r===false)return;
    if(r&&r.then){r.then(function(ok){if(ok!==false)closeModal()});return}
    closeModal();
  },
  refreshWa:function(el){
    el.disabled=true;el.innerHTML=ico('refresh','spin')+'Checking';
    api('GET','/settings/wa-status').then(function(r){
      var pill=$('#wa-pill');if(pill){pill.className='pill '+(r.connected?'good live':'bad');pill.innerHTML=(r.connected?'<i></i>Connected':'Not connected')}
      toast(r.connected?'WhatsApp is connected':'WhatsApp is not connected',r.connected?'':'bad');
    },toastErr).then(function(){var b=$('#wa-btn');if(b){b.disabled=false;b.innerHTML=ico('refresh')+'Refresh'}});
  },
  saveKey:function(){
    var v=$('#c-key').value.trim();if(!v){toast('Paste your kwskit API key first','bad');return}
    api('PUT','/settings/api-key',{apiKey:v}).then(function(r){S.settings=r.settings;$('#c-key').value='';$('#c-key').placeholder='Saved. Enter a new key to replace it';toast('API key saved')},toastErr);
  },
  insVar:function(el){
    var t=$('#wa-msg'),v='{{'+el.dataset.v+'}}',a=t.selectionStart,b=t.selectionEnd;
    t.value=t.value.slice(0,a)+v+t.value.slice(b);t.focus();t.selectionStart=t.selectionEnd=a+v.length;
    S.settings.msg=t.value;waPreview();
  },
  saveSettings:function(){
    S.settings.msg=$('#wa-msg').value;
    api('PUT','/settings/delivery',{autoSend:S.settings.autoSend,attachImg:S.settings.attachImg,msg:S.settings.msg}).then(function(r){S.settings=r.settings;toast('Settings saved')},toastErr);
  },
  sendTest:function(){
    var v=$('#c-test').value.replace(/\D/g,'').slice(-10),e=$('#e-test');
    if(v.length!==10){e.textContent='Enter a 10-digit mobile number.';return}
    e.textContent='';
    api('POST','/settings/test-message',{phone:v}).then(function(r){toast('Test message sent to '+r.to)},toastErr);
  },
  camStart:startCam,
  camStop:stopCam
};
document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-act]');if(!el)return;
  var fn=A[el.dataset.act];if(fn){fn(el,ev)}
});
document.addEventListener('keydown',function(ev){
  if(ev.key==='Escape'){closeModal();A.closeMenu()}
});

/* inputs */
document.addEventListener('input',function(ev){
  var t=ev.target,id=t.id;if(!id)return;
  if(id==='bk-q'){ui.bkQuery=t.value;$('#bk-body').innerHTML=bookingsTable(filteredBookings(S.bookings),true);return}
  if(id==='ev-q'){ui.evQuery=t.value;$('#ev-body').innerHTML=eventRows();return}
  if(id==='wa-msg'){S.settings.msg=t.value;waPreview();return}
  if(F&&id.indexOf('f-')===0){
    var k=id.slice(2);F[k]=t.value;
    if(k==='name'&&!F.slugTouched){F.slug=slugify(t.value);$('#f-slug').value=F.slug}
    if(k==='slug'){F.slugTouched=true}
    ticketPreview();
  }
});

/* forms */
function busy(f,on){var b=f.querySelector('button[type=submit]');if(b)b.disabled=on}
document.addEventListener('submit',function(ev){
  var f=ev.target;ev.preventDefault();
  if(f.id==='login-form'){
    var em=$('#l-email').value.trim(),pw=$('#l-pass').value;
    if(!em||!pw){$('#e-login').textContent='Enter your email and password.';return}
    busy(f,true);
    api('POST','/auth/login',{email:em,password:pw}).then(function(me){
      $('#l-pass').value='';$('#e-login').textContent='';applyMe(me);
      if(!location.hash||location.hash==='#')location.hash='overview';
      route();
    },function(e){if(!e.handled)$('#e-login').textContent=e.message}).then(function(){busy(f,false)});
  }
  if(f.id==='new-form'){
    var err=validateNew();
    var first=Object.keys(err)[0];
    if(first){var i=$('#f-'+first);if(i)i.focus();return}
    busy(f,true);
    api('POST','/events',{name:F.name.trim(),slug:F.slug,date:new Date(F.date).toISOString(),venue:F.venue.trim(),desc:F.desc.trim(),price:parseFloat(F.price),max:parseInt(F.max,10),cap:parseInt(F.cap,10),askNames:F.askNames,open:F.open}).then(function(r){
      F=null;toast('Event created. Print its booking QR below.');location.hash='event-'+r.event.id;
    },function(e){fieldErr(e,{name:'e-name',slug:'e-slug',date:'e-date',venue:'e-venue',price:'e-price',max:'e-max',cap:'e-cap'})}).then(function(){busy(f,false)});
  }
  if(f.id==='member-form'){
    var n=$('#m-name').value.trim(),em2=$('#m-email').value.trim(),pw2=$('#m-pass').value,ok=true;
    function set(id,m){$('#e-'+id).textContent=m||'';if(m)ok=false}
    set('mname',n?'':'Enter a name.');
    set('memail',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em2)?'':'Enter a valid email.');
    set('mpass',pw2.length>=8?'':'Use at least 8 characters.');
    if(!ok)return;
    busy(f,true);
    api('POST','/team',{name:n,email:em2,password:pw2,role:ui.newRole}).then(function(){
      toast(n+' added as '+(ui.newRole==='admin'?'admin':'gate staff'));route();
    },function(e){
      if(e.handled)return;
      if(e.field==='email')$('#e-memail').textContent=e.message;else if(e.field==='password')$('#e-mpass').textContent=e.message;else toastErr(e);
    }).then(function(){busy(f,false)});
  }
  if(f.id==='contact-form'){
    var ok2=true;
    var ph=$('#c-phone').value.trim(),em3=$('#c-email').value.trim(),gs=$('#c-gstin').value.trim().toUpperCase();
    function set2(id,m){$('#e-'+id).textContent=m||'';if(m)ok2=false}
    set2('cphone',!ph||/^[+\d][\d\s-]{7,15}$/.test(ph)?'':'Enter a valid phone number.');
    set2('cemail',!em3||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em3)?'':'Enter a valid email.');
    set2('cgstin',!gs||/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gs)?'':'GSTIN has 15 characters, like 22AAAAA0000A1Z5.');
    if(!ok2)return;
    busy(f,true);
    api('PUT','/settings/contact',{address:$('#c-address').value.trim(),phone:ph,email:em3,gstin:gs}).then(function(r){S.settings=r.settings;toast('Contact details saved')},toastErr).then(function(){busy(f,false)});
  }
  if(f.id==='scan-form'){
    var inp=$('#s-code'),val=inp.value;busy(f,true);
    doScan(val).then(function(){
      $('#scan-res').innerHTML=scanResultHtml(ui.scanResult);
      if(ui.scanResult.kind==='good'){var log=$('#scan-log');if(log)log.remove();stopCam();render('scanner');$('#scan-res').innerHTML=scanResultHtml(ui.scanResult)}
    },function(){}).then(function(){busy(f,false);var i=$('#s-code');if(i){i.value='';i.focus()}});
  }
});

/* ====================== boot ====================== */
api('GET','/me').then(function(me){applyMe(me);route()},function(e){if(!e.handled)showLogin()});
})();
