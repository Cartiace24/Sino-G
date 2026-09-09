/* ================= SINO G — app ================= */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const view = () => document.getElementById('view');

/* ---------- mock data ---------- */
const DB = {
  user: { name:'Isaiah', username:'sai', initial:'I', cls:'av-isaiah' },
  groups: [
    { id:'boys', name:'The Boys', short:'TB', members:8, free:4, maybe:2, busy:2 },
    { id:'college', name:'College Friends', short:'CF', members:12, free:6, maybe:3, busy:3 },
    { id:'ball', name:'Basketball Group', short:'BG', members:6, free:5, maybe:1, busy:0 },
  ],
  boys: [
    { n:'Isaiah', u:'you · set 2h ago', s:'free', cls:'av-isaiah', i:'I' },
    { n:'John', u:'free until 11 PM', s:'free', cls:'av-john', i:'J' },
    { n:'Carlo', u:'free after 6 PM', s:'free', cls:'av-carlo', i:'C' },
    { n:'Kevin', u:'free all night', s:'free', cls:'av-kevin', i:'K' },
    { n:'Mark', u:'might finish work late', s:'maybe', cls:'av-mark', i:'M' },
    { n:'Angelo', u:'family dinner, maybe after', s:'maybe', cls:'av-angelo', i:'A' },
    { n:'Rafa', u:'out of town', s:'busy', cls:'av-rafa', i:'R' },
    { n:'Mika', u:'exam week', s:'busy', cls:'av-mika', i:'M' },
  ],
  planDays: {
    'SAT 12': [
      { t:'12 PM', n:2 }, { t:'1 PM', n:3 }, { t:'2 PM', n:5 }, { t:'3 PM', n:7 },
      { t:'4 PM', n:9 }, { t:'5 PM', n:10 }, { t:'6 PM', n:11 }, { t:'7 PM', n:12, best:true },
      { t:'8 PM', n:11 }, { t:'9 PM', n:7 },
    ],
    'SUN 13': [
      { t:'12 PM', n:5 }, { t:'1 PM', n:6 }, { t:'2 PM', n:8 }, { t:'3 PM', n:9 },
      { t:'4 PM', n:10 }, { t:'5 PM', n:10, best:true }, { t:'6 PM', n:9 }, { t:'8 PM', n:6 },
    ],
    'FRI 11': [
      { t:'5 PM', n:3 }, { t:'6 PM', n:5 }, { t:'7 PM', n:8 }, { t:'8 PM', n:9, best:true }, { t:'10 PM', n:7 },
    ],
  },
  hangouts: [
    { id:'h1', who:'Isaiah', what:'Basketball?', where:'Nuvali Court', when:'Tonight · 7 PM', group:'THE BOYS',
      down:['Isaiah','John','Mark','Carlo'], maybe:['Angelo'], cant:['Rafa'], live:true },
    { id:'h2', who:'Mika', what:'Coffee + study?', where:'Kanteen, ATC', when:'Tomorrow · 2 PM', group:'COLLEGE FRIENDS',
      down:['Mika','Rafa'], maybe:['Isaiah'], cant:[], live:true },
  ],
};
const state = {
  avail: 'free', from:'6:00 PM', until:'10:00 PM', dayIdx:5,
  planDay:'SAT 12', barSel:7,
  myResp:{}, newHang:{ group:'THE BOYS', what:'', where:'', when:'Tonight · 7:00 PM' },
};
const STATUS = { free:'FREE', maybe:'MAYBE', busy:'BUSY' };

/* ---------- helpers ---------- */
function toast(msg){ const t=$('#toast'); t.innerHTML=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2400); }
function icons(){ if(window.lucide) lucide.createIcons(); }
function avatar(p, cls=''){ return `<span class="avatar ${cls||''} ${p.cls||'av-default'} ${p.big||''}">${p.i||p.name?.[0]||'?'}</span>`; }
function dot(s){ return `<span class="dot ${s}"></span>`; }
function statusLine(s){ return `<span class="statusline ${s}">${dot(s)} ${STATUS[s]}</span>`; }
function setAuthMode(on){ document.body.classList.toggle('auth', on); $('#topbar').style.display = on ? 'none' : ''; }
function setActiveTab(route){
  $$('#tabbar a, .side-nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  const inApp = ['today','plan','g','me','me-availability','group'].includes(route);
  setAuthMode(!inApp);
  $('#tabbar').style.display = inApp ? '' : 'none';
  const sb = $('#sidebar'); if(sb) sb.style.display = inApp ? '' : 'none';
  $('#topbar').style.display = inApp ? '' : 'none';
}
function go(h){ location.hash = h; }

/* ================================================================
   SCREENS
================================================================ */
const S = {};

/* ---------- 1 WELCOME ---------- */
S.welcome = () => `
<div class="welcome-hero">
  <p class="kicker">FOR FRIEND GROUPS · BARKADAS · CREWS</p>
  <h1 class="welcome-giant">SINO<br/><span>G?</span></h1>
  <p class="lede" style="margin-top:14px;font-size:18px;color:var(--ink)"><strong>Stop asking the group chat.<br/>See who's free.</strong></p>
  <div class="hero-avatars">
    <div class="stack">
      <span class="avatar av-john">J</span><span class="avatar av-mark">M</span><span class="avatar av-carlo">C</span><span class="avatar av-kevin">K</span>
      <span class="stack-more">+4</span>
    </div>
    <span class="small muted"><b style="color:var(--ink)">4 free tonight</b> in The Boys</span>
  </div>
  <div class="ticker"><div>&nbsp;WHO'S FREE TODAY? &nbsp;●&nbsp; SINO G? &nbsp;●&nbsp; 4 FRIENDS ARE DOWN &nbsp;●&nbsp; SATURDAY 7 PM LOOKS GOOD &nbsp;●&nbsp; WHO'S FREE TONIGHT? &nbsp;●&nbsp; SINO G? &nbsp;●&nbsp; 4 FRIENDS ARE DOWN &nbsp;●&nbsp; SATURDAY 7 PM LOOKS GOOD &nbsp;●&nbsp;</div></div>
  <button class="btn btn-dark btn-block btn-big" data-goto="#/register">Get Started <i data-lucide="arrow-right"></i></button>
  <p class="small muted" style="text-align:center;margin-top:14px">Already have an account? <a class="link-u" href="#/login" data-nav>Log in</a></p>
</div>`;

/* ---------- 2 LOGIN ---------- */
S.login = () => `
<div class="auth-wrap">
  <a class="backlink" href="#/welcome" data-nav><i data-lucide="arrow-left"></i> BACK</a>
  <p class="kicker">WELCOME BACK</p>
  <h1 class="display lg">LOG<br/>IN.</h1>
  <div style="height:20px"></div>
  <div class="field"><label>Email</label><input class="input" type="email" placeholder="you@email.com" value="isaiah@email.com"/></div>
  <div class="field"><label>Password</label><input class="input" type="password" placeholder="••••••••" value="password123"/></div>
  <div class="row-between" style="margin:2px 0 18px"><span></span><a class="small link-u" href="#/login" data-nav>Forgot password?</a></div>
  <button class="btn btn-dark btn-block btn-big" data-goto="#/today">Log In</button>
  <div class="divider-or">OR</div>
  <button class="btn btn-paper btn-block" data-goto="#/today"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.2c1.9-1.8 3-4.4 3-7.5Z" fill="#4285F4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.7A10 10 0 0 0 12 22Z" fill="#34A853"/><path d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3.1a10 10 0 0 0 0 9.2l3.3-2.7Z" fill="#FBBC05"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4A10 10 0 0 0 3.1 7.4l3.3 2.7C7.2 7.8 9.4 6 12 6Z" fill="#EA4335"/></svg> Continue with Google</button>
  <p class="small muted" style="text-align:center;margin-top:18px">New here? <a class="link-u" href="#/register" data-nav>Create an account</a></p>
</div>`;

/* ---------- 3 REGISTER ---------- */
S.register = () => `
<div class="auth-wrap">
  <a class="backlink" href="#/welcome" data-nav><i data-lucide="arrow-left"></i> BACK</a>
  <p class="kicker">30 SECONDS, PROMISE</p>
  <h1 class="display lg">JOIN<br/>SINO G.</h1>
  <div style="height:20px"></div>
  <div class="field"><label>Email</label><input class="input" type="email" placeholder="you@email.com"/></div>
  <div class="field"><label>Password</label><input class="input" type="password" placeholder="At least 8 characters"/></div>
  <div class="field"><label>Confirm password</label><input class="input" type="password" placeholder="Repeat it"/></div>
  <button class="btn btn-green btn-block btn-big" data-goto="#/create-profile">Create Account</button>
  <div class="divider-or">OR</div>
  <button class="btn btn-paper btn-block" data-goto="#/create-profile">Continue with Google</button>
  <p class="small muted" style="text-align:center;margin-top:18px">Already in? <a class="link-u" href="#/login" data-nav>Log in</a></p>
</div>`;

/* ---------- 4 CREATE PROFILE ---------- */
S['create-profile'] = () => `
<div class="auth-wrap" style="text-align:left">
  <p class="kicker">STEP 1 OF 2</p>
  <h1 class="display lg">ALMOST<br/>THERE.</h1>
  <p class="lede" style="margin:8px 0 20px">How should the barkada know you?</p>
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
    <span class="avatar xl av-default" id="prevAv" style="border-style:dashed">?</span>
    <button class="btn btn-paper btn-sm" id="upBtn"><i data-lucide="image-plus"></i> Upload photo</button>
  </div>
  <div class="field"><label>Display name</label><input class="input" id="dnInput" placeholder="e.g. Isaiah" value="Isaiah"/></div>
  <div class="field"><label>Username</label><input class="input" placeholder="e.g. @sai" value="@sai"/></div>
  <button class="btn btn-dark btn-block btn-big" data-goto="#/start">Continue <i data-lucide="arrow-right"></i></button>
</div>`;

/* ---------- 5 CREATE OR JOIN ---------- */
S.start = () => `
<div class="auth-wrap" style="max-width:520px">
  <p class="kicker">STEP 2 OF 2</p>
  <h1 class="display lg">WHAT BRINGS YOU HERE?</h1>
  <div style="height:18px"></div>
  <button class="choice green" data-goto="#/today">
    <span class="k">★ START FRESH</span>
    <h3>Create a group</h3>
    <p>Start your own barkada. Invite them in seconds.</p>
    <span class="go"><i data-lucide="plus"></i></span>
  </button>
  <button class="choice" id="joinToggle">
    <span class="k">✦ GOT A CODE?</span>
    <h3>Join a group</h3>
    <p>Enter the invite code from your friends.</p>
    <span class="go"><i data-lucide="arrow-right"></i></span>
  </button>
  <div id="joinBox" style="display:none">
    <label class="kicker">INVITE CODE</label>
    <div class="invite-code">${'<input maxlength="1" inputmode="text"/>'.repeat(6)}</div>
    <button class="btn btn-dark btn-block btn-big" data-goto="#/today">Join The Boys</button>
    <div class="empty" style="margin-top:14px"><i data-lucide="ticket"></i><p class="small"><b style="color:var(--ink)">No code yet?</b><br/>Ask anyone in the group — it's 6 letters, takes 5 seconds.</p></div>
  </div>
</div>`;

/* ---------- 6 TODAY ---------- */
S.today = () => {
  const free = DB.boys.filter(m=>m.s==='free').slice(0,4);
  return `
  <p class="kicker" style="margin-top:14px">GOOD EVENING, ISAIAH.</p>
  <h1 class="display xl">WHO'S<br/>FREE <span class="accent">TONIGHT?</span></h1>

  <div class="two-col" style="margin-top:8px">
    <div>
      <div class="row-between" style="align-items:flex-end;margin-top:18px">
        <span class="bignum">04</span>
        <span class="kicker" style="text-align:right;padding-bottom:14px">FRIENDS ARE<br/>AVAILABLE</span>
      </div>
      <div class="hero-avatars">
        <div class="stack">${free.map(m=>`<span class="avatar ${m.cls}">${m.i}</span>`).join('')}</div>
        <span class="small"><b>John · Mark · Carlo · Kevin</b> <span class="muted">+3</span></span>
      </div>
      <button class="btn btn-line btn-sm" data-goto="#/group/boys" style="margin-top:10px">See who's free <i data-lucide="arrow-right"></i></button>
    </div>
    <div>
      <div class="besthero">
        <span class="kicker">★ BEST UPCOMING WINDOW</span>
        <h3>Saturday<br/>looks good.</h3>
        <div class="row-between" style="margin-top:10px">
          <div><div class="bign">7<span style="font-size:22px">/8</span></div><p>available · 7:00 PM</p></div>
          <button class="btn btn-green btn-sm" data-goto="#/plan">View plan <i data-lucide="arrow-up-right"></i></button>
        </div>
      </div>
    </div>
  </div>

  <hr class="rule"/>
  <div class="row-between"><span class="kicker">YOUR GROUPS · 3</span><a class="small link-u" href="#/me" data-nav>Manage</a></div>
  <div class="rows" style="margin-top:6px">
    ${DB.groups.map(g=>`
      <button class="group-row" data-goto="#/group/${g.id}">
        <span class="gavatar">${g.short}</span>
        <span class="gmeta"><strong>${g.name}</strong>
          <span class="countline"><b class="free-n" style="color:var(--free)">${g.free} free</b> · ${g.maybe} maybe · ${g.busy} busy &nbsp;·&nbsp; ${g.members} members</span>
        </span>
        <i data-lucide="chevron-right" style="margin-left:auto;color:var(--muted);width:19px;height:19px"></i>
      </button>`).join('')}
  </div>

  <hr class="rule"/>
  <div class="row-between"><span class="kicker">LIVE NOW · 2 ASKING</span><a class="small link-u" href="#/g" data-nav>Open G?</a></div>
  ${DB.hangouts.map(h=>`
    <button class="hangitem" data-goto="#/hangout/${h.id}">
      <span class="pulse"></span>
      <span><strong>${h.who}:</strong> ${h.what} <span class="muted">· ${h.when}</span><br/>
      <span class="small muted">${h.down.length} down · ${h.where}</span></span>
      <i data-lucide="arrow-up-right" style="margin-left:auto;color:var(--muted);width:18px;height:18px"></i>
    </button>`).join('')}

  <div style="position:sticky;bottom:84px;margin-top:26px">
    <button class="btn btn-green btn-block btn-big" data-goto="#/g" style="box-shadow:0 10px 0 var(--ink)">⚡ WHO'S DOWN?</button>
  </div>`;
};

/* ---------- 7 GROUP DETAILS ---------- */
S.group = (id='boys') => {
  const g = DB.groups.find(x=>x.id===id) || DB.groups[0];
  return `
  <a class="backlink" href="#/today" data-nav style="margin-top:14px"><i data-lucide="arrow-left"></i> TODAY</a>
  <div class="row-between" style="align-items:flex-start">
    <div style="display:flex;gap:16px;align-items:center">
      <span class="gavatar big">${g.short}</span>
      <div><p class="kicker">${g.members} MEMBERS</p>
      <h1 class="display md">${g.name}</h1>
      <p class="countline"><b class="free-n" style="color:var(--free)">${g.free} free</b> · ${g.maybe} maybe · ${g.busy} busy</p></div>
    </div>
    <button class="btn btn-paper btn-sm" data-goto="#/settings"><i data-lucide="settings-2"></i></button>
  </div>

  <div class="row-between" style="margin-top:20px">
    <span class="kicker">AVAILABLE NOW · ${g.free}</span>
    <button class="btn btn-line btn-sm" id="inviteBtn"><i data-lucide="user-plus"></i> Invite friends</button>
  </div>
  <div class="rows" style="margin-top:8px">
    ${DB.boys.map(m=>`
      <div class="member-row">
        <span class="avatar sm ${m.cls}">${m.i}</span>
        <span class="who"><strong>${m.n}</strong><small>${m.u}</small></span>
        <span class="right">${statusLine(m.s)}</span>
      </div>`).join('')}
  </div>

  <hr class="rule"/>
  <span class="kicker">RECENT HANGOUTS</span>
  <div class="hangitem"><span class="avatar sm av-john">J</span><span class="small"><b>Night ride to Tagaytay</b> · Sat<br/><span class="muted">6 went · organized by John</span></span></div>
  <div class="hangitem"><span class="avatar sm av-carlo">C</span><span class="small"><b>2v2 basketball</b> · Wed<br/><span class="muted">4 went · organized by Carlo</span></span></div>
  <div class="empty" id="inviteEmpty" style="display:none;margin-top:14px"><i data-lucide="link"></i>
    <p class="small"><b style="color:var(--ink)">Invite link copied: sinog.app/j/TB8X2K</b><br/>Share it in the GC. Expires in 7 days.</p></div>`;
};

/* ---------- 8 MY AVAILABILITY ---------- */
S['me-availability'] = () => {
  const days = [['M','7'],['T','8'],['W','9'],['T','10'],['F','11'],['S','12'],['S','13']];
  const dots = ['free','free','maybe','busy','free','free','maybe'];
  const from = ['4:00 PM','5:00 PM','6:00 PM','7:00 PM'];
  const until = ['8:00 PM','9:00 PM','10:00 PM','11 PM'];
  return `
  <p class="kicker" style="margin-top:14px">TAKES ~20 SECONDS</p>
  <h1 class="display lg">MY<br/>AVAIL<span style="background:var(--green);border-radius:6px;padding:0 .1em">ABILITY.</span></h1>
  <div class="weekstrip">
    ${days.map((d,i)=>`<button class="day ${i===state.dayIdx?'sel':''}" data-day="${i}"><b>${d[0]}</b><strong>${d[1]}</strong>${dot(dots[i])}</button>`).join('')}
  </div>
  <hr class="rule"/>
  <p class="kicker">SATURDAY, SEPTEMBER 12</p>
  <h2 class="display md" style="margin-top:6px">HOW AVAILABLE ARE YOU?</h2>
  <div class="seg3">
    <button class="seg ${state.avail==='free'?'on-free':''}" data-av="free">${dot('free')}FREE<small>I'm in</small></button>
    <button class="seg ${state.avail==='maybe'?'on-maybe':''}" data-av="maybe">${dot('maybe')}MAYBE<small>Depends</small></button>
    <button class="seg ${state.avail==='busy'?'on-busy':''}" data-av="busy">${dot('busy')}BUSY<small>Can't</small></button>
  </div>
  <div class="timegrid" style="margin-top:14px">
    <div><p class="kicker" style="margin-bottom:8px">FROM</p>
      <div style="display:grid;gap:8px">${from.map(t=>`<button class="time-chip ${state.from===t?'sel':''}" data-from="${t}">${t}</button>`).join('')}</div></div>
    <div><p class="kicker" style="margin-bottom:8px">UNTIL</p>
      <div style="display:grid;gap:8px">${until.map(t=>`<button class="time-chip ${state.until===t?'sel':''}" data-until="${t}">${t}</button>`).join('')}</div></div>
  </div>
  <div style="position:sticky;bottom:84px;margin-top:20px">
    <button class="btn btn-green btn-block btn-big" id="saveAvail" style="box-shadow:0 10px 0 var(--ink)">Save availability</button>
  </div>`;
};

/* ---------- 9 GROUP AVAILABILITY (PLAN) ---------- */
S.plan = () => {
  const rows = DB.planDays[state.planDay];
  const max = Math.max(...rows.map(r=>r.n));
  const best = rows.find(r=>r.best);
  return `
  <p class="kicker" style="margin-top:14px">PLAN · THE BOYS · 8 FRIENDS</p>
  <h1 class="display lg">WHEN'S<br/>EVERYONE <span class="accent">FREE?</span></h1>
  <div class="daytabs" style="margin-top:14px">
    ${Object.keys(DB.planDays).map(d=>`<button class="daytab ${d===state.planDay?'sel':''}" data-pday="${d}">${d}</button>`).join('')}
    <button class="daytab" id="nextWeek">NEXT WEEK →</button>
  </div>
  <div class="besthero">
    <span class="tag-best">★ BEST TIME</span>
    <h3>${state.planDay}<br/>${best.t}</h3>
    <div class="row-between"><p><b style="color:#fff">${best.n} of 8 friends</b> available</p>
    <button class="btn btn-green btn-sm" data-goto="#/g">Ask the group ⚡</button></div>
  </div>
  <span class="kicker">TAP A TIME TO SEE WHO'S FREE</span>
  <div class="bars">
    ${rows.map((r,i)=>`
      <button class="bar-row ${r.best?'best':''} ${i===state.barSel?'':''}" data-bar="${i}">
        <span class="t">${r.t}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round(r.n/max*100)}%"></span></span>
        <span class="n">${r.n}</span>
      </button>`).join('')}
  </div>
  <div class="sheet" id="whoBox">
    <div class="row-between"><span class="kicker">WHO'S FREE · ${rows[state.barSel].t}</span><span class="small"><b>${rows[state.barSel].n}/8</b></span></div>
    <div class="stack" style="margin:12px 0">
      <span class="avatar sm av-isaiah">I</span><span class="avatar sm av-john">J</span><span class="avatar sm av-kevin">K</span><span class="avatar sm av-carlo">C</span><span class="stack-more">+${rows[state.barSel].n-4}</span>
    </div>
    <p class="small muted">Isaiah · John · Kevin · Carlo ${rows[state.barSel].n>4?`· +${rows[state.barSel].n-4} more`:''} — Mark is maybe, Rafa is busy.</p>
  </div>`;
};

/* ---------- 10 G? ---------- */
S.g = () => `
  <p class="kicker" style="margin-top:14px">SPONTANEOUS MODE ⚡ · 2 LIVE NOW</p>
  <h1 class="display xl">WHO'S<br/><span class="accent">DOWN?</span></h1>
  <p class="lede" style="margin-top:8px">See who's ready to hang out. No planning thread needed.</p>
  <button class="btn btn-dark btn-block btn-big" id="startHang" style="margin-top:16px">+ Start a hangout</button>

  <div class="sheet" id="hangForm" style="display:none">
    <span class="kicker">NEW HANGOUT · ~15 SECONDS</span>
    <div class="field" style="margin-top:12px"><label>Group</label>
      <div class="chiprow" id="fGroup">${['THE BOYS','COLLEGE FRIENDS','BASKETBALL'].map((g,i)=>`<button class="chip ${state.newHang.group===g?'sel':''}" data-fg="${g}">${g}</button>`).join('')}</div></div>
    <div class="field"><label>What are you planning?</label><input class="input" id="fWhat" placeholder="e.g. Basketball" value="${state.newHang.what}"/></div>
    <div class="field"><label>Where? <span style="text-transform:none;letter-spacing:0">(optional)</span></label><input class="input" id="fWhere" placeholder="e.g. Nuvali" value="${state.newHang.where}"/></div>
    <div class="field"><label>When?</label>
      <div class="chiprow" id="fWhen">${['Tonight · 7:00 PM','Later · 9 PM','Tomorrow · 2 PM'].map(w=>`<button class="chip ${state.newHang.when===w?'sel':''}" data-fw="${w}">${w}</button>`).join('')}</div></div>
    <button class="btn btn-green btn-block btn-big" id="askGroup">Ask the group ⚡</button>
  </div>

  <hr class="rule"/>
  <span class="kicker">LIVE REQUESTS</span>
  <div id="hangList">
  ${DB.hangouts.map(h=>`
    <button class="hangitem" data-goto="#/hangout/${h.id}">
      <span class="pulse"></span>
      <span class="avatar ${h.who==='Isaiah'?'av-isaiah':h.who==='Mika'?'av-mika':'av-john'}">${h.who[0]}</span>
      <span><span class="kicker" style="font-size:10px">${h.group} · ${h.when}</span><br/>
        <strong style="font-size:16px">${h.what}</strong> <span class="muted small">— ${h.who}</span><br/>
        <span class="small"><b class="free-n" style="color:var(--free)">🔥 ${h.down.length} down</b> <span class="muted">· ${h.where}</span></span></span>
      <i data-lucide="chevron-right" style="margin-left:auto;color:var(--muted)"></i>
    </button>`).join('')}
  </div>
  <div class="empty" style="margin-top:14px"><i data-lucide="moon"></i><p class="small"><b style="color:var(--ink)">Quiet right now?</b><br/>Be the first to ask. Barkadas move fast.</p></div>`;

/* ---------- 11 HANGOUT DETAILS ---------- */
S.hangout = (id='h1') => {
  const h = DB.hangouts.find(x=>x.id===id) || DB.hangouts[0];
  const my = state.myResp[h.id];
  const downCount = h.down.length + (my==='down'?1:0);
  const allDown = [...h.down, ...(my==='down' ? ['You'] : [])];
  return `
  <a class="backlink" href="#/g" data-nav style="margin-top:14px"><i data-lucide="arrow-left"></i> ALL HANGOUTS</a>
  <div class="hangalert">
    <span class="kicker">🔥 HANGOUT ALERT · LIVE</span>
    <p class="small" style="color:#cfccc2;margin-top:10px;letter-spacing:.1em;font-weight:700">${h.who.toUpperCase()} IS ASKING:</p>
    <h2>${h.what}</h2>
    <div class="meta">
      <span><i data-lucide="map-pin"></i> ${h.where}</span>
      <span><i data-lucide="clock"></i> ${h.when}</span>
      <span><i data-lucide="users"></i> ${h.group}</span>
    </div>
  </div>
  <h2 class="display md">ARE YOU<br/>DOWN?</h2>
  <div class="respond" style="margin-top:12px">
    <button class="rbtn down ${my==='down'?'picked':''}" data-resp="down" data-h="${h.id}">🔥 I'M DOWN</button>
    <button class="rbtn maybe-b ${my==='maybe'?'picked':''}" data-resp="maybe" data-h="${h.id}">⏳ MAYBE</button>
    <button class="rbtn cant ${my==='cant'?'picked':''}" data-resp="cant" data-h="${h.id}">✕ CAN'T</button>
  </div>
  <hr class="rule"/>
  <div class="row-between"><span class="kicker">🔥 ${String(downCount).padStart(2,'0')} PEOPLE ARE DOWN</span><span class="small muted">updates live</span></div>
  <div class="rows" style="margin-top:8px">
    ${allDown.map(n=>`<div class="member-row"><span class="avatar sm ${n==='Isaiah'||n==='You'?'av-isaiah':n==='John'?'av-john':n==='Mark'?'av-mark':'av-carlo'}">${n[0]}</span><span class="who"><strong>${n}</strong><small>is down · just now</small></span><span class="right">🔥</span></div>`).join('')}
    ${h.maybe.map(n=>`<div class="member-row"><span class="avatar sm av-mark">${n[0]}</span><span class="who"><strong>${n}</strong><small>is thinking about it</small></span><span class="right">${statusLine('maybe')}</span></div>`).join('')}
    ${h.cant.map(n=>`<div class="member-row"><span class="avatar sm av-rafa">${n[0]}</span><span class="who"><strong>${n}</strong><small>can't make it</small></span><span class="right">${statusLine('busy')}</span></div>`).join('')}
  </div>
  <button class="btn btn-line btn-block" style="margin-top:18px" data-goto="#/g"><i data-lucide="share-2"></i> Nudge the GC</button>`;
};

/* ---------- 12 PROFILE ---------- */
S.me = () => `
  <div style="display:flex;gap:18px;align-items:center;margin-top:18px">
    <span class="avatar xl av-isaiah">I</span>
    <div><p class="kicker">@SAI</p><h1 class="display md">ISAIAH</h1>
    <p class="small muted">3 groups · usually free weekends</p></div>
  </div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn btn-line btn-sm" data-goto="#/settings"><i data-lucide="pencil"></i> Edit profile</button>
    <button class="btn btn-green btn-sm" data-goto="#/me-availability"><i data-lucide="clock"></i> Set availability</button>
  </div>
  <hr class="rule"/>
  <span class="kicker">MY GROUPS · 3</span>
  <div class="rows" style="margin-top:6px">
    ${DB.groups.map(g=>`<button class="group-row" data-goto="#/group/${g.id}">
      <span class="gavatar">${g.short}</span>
      <span class="gmeta"><strong>${g.name}</strong><small>${g.members} MEMBERS · <b style="color:var(--free)">${g.free} FREE NOW</b></small></span>
      <i data-lucide="chevron-right" style="margin-left:auto;color:var(--muted)"></i></button>`).join('')}
  </div>
  <button class="choice" data-goto="#/start" style="margin-top:18px"><span class="k">+ NEW</span><h3 style="font-size:20px">Create or join another</h3><span class="go"><i data-lucide="plus"></i></span></button>
  <button class="btn btn-paper btn-block" data-goto="#/settings" style="margin-top:4px"><i data-lucide="settings-2"></i> Settings</button>`;

/* ---------- 13 SETTINGS ---------- */
S.settings = () => `
  <a class="backlink" href="#/me" data-nav style="margin-top:14px"><i data-lucide="arrow-left"></i> PROFILE</a>
  <h1 class="display lg">SET<br/>TINGS.</h1>
  <div class="setgroup" style="margin-top:18px">
    <span class="kicker">ACCOUNT</span>
    <button class="setrow" data-goto="#/me"><i data-lucide="user"></i> Edit profile <i data-lucide="chevron-right" class="chev"></i></button>
    <button class="setrow" id="pwBtn"><i data-lucide="lock"></i> Change password <i data-lucide="chevron-right" class="chev"></i></button>
  </div>
  <div class="setgroup">
    <span class="kicker">PREFERENCES</span>
    <div class="setrow"><i data-lucide="bell"></i> Notifications <span class="switch" id="notifSw" role="switch" aria-checked="true" tabindex="0"></span></div>
    <div class="setrow"><i data-lucide="zap"></i> Hangout alerts <span class="switch" role="switch" aria-checked="true"></span></div>
  </div>
  <div class="setgroup">
    <span class="kicker" style="color:var(--busy)">DANGER ZONE</span>
    <button class="setrow danger" id="delBtn"><i data-lucide="trash-2"></i> Delete account</button>
    <button class="setrow" data-goto="#/welcome"><i data-lucide="log-out"></i> Log out</button>
  </div>
  <p class="small muted" style="text-align:center;margin-top:10px">SINO G · v1.0 · made for barkadas</p>`;

/* ================================================================
   ROUTER
================================================================ */
const routes = {
  '/welcome':['welcome','welcome'], '/login':['login','login'], '/register':['register','register'],
  '/create-profile':['create-profile','register'], '/start':['start','register'],
  '/today':['today','today'], '/group':['group','today'], '/me-availability':['me-availability','me-availability'],
  '/plan':['plan','plan'], '/g':['g','g'], '/hangout':['hangout','g'], '/me':['me','me'], '/settings':['settings','me'],
};
function render(){
  let h = location.hash.replace(/^#/,'') || '/welcome';
  const [base, param] = h.split('/').length > 2 ? ['/'+h.split('/')[1], h.split('/')[2]] : [h, null];
  const r = routes[base] || routes['/welcome'];
  const [screen, tab] = r;
  view().innerHTML = S[screen](param);
  setActiveTab(tab === 'welcome' ? 'welcome' : screen === 'group' ? 'today' : screen === 'hangout' ? 'g' : screen === 'settings' ? 'me' : tab);
  window.scrollTo({top:0});
  bind(screen);
  icons();
}

function bind(screen){
  $$('[data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto));

  if(screen==='create-profile'){
    $('#upBtn').onclick = () => { $('#prevAv').textContent = $('#dnInput').value?.[0]?.toUpperCase()||'I'; $('#prevAv').className='avatar xl av-isaiah'; toast('Photo added. Looking good.'); };
    $('#dnInput').oninput = e => { if($('#prevAv').classList.contains('av-isaiah')) $('#prevAv').textContent = e.target.value?.[0]?.toUpperCase()||'I'; };
  }
  if(screen==='start'){
    const box = $('#joinBox');
    $('#joinToggle').onclick = () => { box.style.display = box.style.display==='none'?'block':'none'; const first = box.querySelector('input'); first && first.focus(); icons(); };
    $$('.invite-code input').forEach((inp,i,arr)=>{ inp.oninput=()=>{ inp.value=inp.value.toUpperCase(); if(inp.value&&arr[i+1]) arr[i+1].focus(); }; inp.onkeydown=e=>{ if(e.key==='Backspace'&&!inp.value&&arr[i-1]) arr[i-1].focus(); }; });
    if(box) $$('.invite-code input').forEach((inp,i)=>{ if(i<6) inp.value = 'TB8X2K'[i]||''; });
  }
  if(screen==='group' && $('#inviteBtn')){
    $('#inviteBtn').onclick = async () => {
      try{ await navigator.clipboard.writeText('sinog.app/j/TB8X2K'); }catch(e){}
      $('#inviteEmpty').style.display='block'; toast('<b>Invite link copied.</b> Drop it in the GC.');
    };
  }
  if(screen==='me-availability'){
    $$('[data-av]').forEach(b=>b.onclick=()=>{ state.avail=b.dataset.av; render(); });
    $$('[data-day]').forEach(b=>b.onclick=()=>{ state.dayIdx=+b.dataset.day; render(); });
    $$('[data-from]').forEach(b=>b.onclick=()=>{ state.from=b.dataset.from; render(); });
    $$('[data-until]').forEach(b=>b.onclick=()=>{ state.until=b.dataset.until; render(); });
    const sv = $('#saveAvail'); if(sv) sv.onclick=()=>{ toast(`<b>Saved.</b> Sat 12 · ${state.avail.toUpperCase()} · ${state.from}–${state.until}`); setTimeout(()=>go('#/today'),650); };
  }
  if(screen==='plan'){
    $$('[data-pday]').forEach(b=>b.onclick=()=>{ state.planDay=b.dataset.pday; const rows=DB.planDays[state.planDay]; state.barSel=rows.findIndex(r=>r.best); render(); });
    const nw = $('#nextWeek'); if(nw) nw.onclick=()=>toast('Next week is still filling in. Nudge the group.');
    $$('[data-bar]').forEach(b=>b.onclick=()=>{ state.barSel=+b.dataset.bar; render(); $('#whoBox')?.scrollIntoView({behavior:'smooth',block:'nearest'}); });
  }
  if(screen==='g'){
    const f = $('#hangForm');
    $('#startHang').onclick = () => { f.style.display = f.style.display==='none'?'block':'none'; f.scrollIntoView({behavior:'smooth'}); };
    $$('#fGroup .chip').forEach(c=>c.onclick=()=>{ state.newHang.group=c.dataset.fg; $$('#fGroup .chip').forEach(x=>x.classList.toggle('sel',x===c)); });
    $$('#fWhen .chip').forEach(c=>c.onclick=()=>{ state.newHang.when=c.dataset.fw; $$('#fWhen .chip').forEach(x=>x.classList.toggle('sel',x===c)); });
    const ask = $('#askGroup');
    if(ask) ask.onclick = () => {
      state.newHang.what = $('#fWhat').value.trim(); state.newHang.where = $('#fWhere').value.trim()||'TBD';
      if(!state.newHang.what){ toast('What are you planning? Add it first.'); $('#fWhat').focus(); return; }
      const id = 'h'+Date.now();
      DB.hangouts.unshift({ id, who:'Isaiah', what:state.newHang.what, where:state.newHang.where, when:state.newHang.when, group:state.newHang.group, down:['Isaiah'], maybe:[], cant:[], live:true });
      state.newHang.what=''; state.newHang.where='';
      toast('<b>⚡ Asked!</b> The group has been pinged.');
      setTimeout(()=>go('#/hangout/'+id),600);
    };
  }
  if(screen==='hangout'){
    $$('[data-resp]').forEach(b=>b.onclick=()=>{
      const h = b.dataset.h, v = b.dataset.resp;
      state.myResp[h] = state.myResp[h]===v ? null : v;
      const msgs = { down:'<b>🔥 You\'re down!</b> Isaiah will see it live.', maybe:'<b>Maybe noted.</b> We\'ll keep you posted.', cant:'<b>Marked can\'t.</b> Next time.' };
      if(state.myResp[h]) toast(msgs[v]);
      render();
    });
  }
  if(screen==='settings'){
    const sw = $('#notifSw');
    if(sw){ const flip=()=>{ const on = sw.style.background!=='var(--line)'; sw.style.background = on?'var(--line)':'var(--ink)'; toast(on?'Notifications paused.':'Notifications on.'); }; sw.onclick=flip; sw.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); flip(); } }; }
    const pw = $('#pwBtn'); if(pw) pw.onclick=()=>toast('<b>Reset link sent.</b> Check your email.');
    const del = $('#delBtn'); if(del) del.onclick=()=>{ if(confirm('Delete your Sino G account? This can\'t be undone.')) toast('Account deletion requested.'); };
  }
}

window.addEventListener('hashchange', render);
if(!location.hash) location.hash = '#/welcome';
render();
