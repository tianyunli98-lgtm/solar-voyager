import * as THREE from '../vendor/three.module.min.js';
import { BODIES, getPositions, getOrbitPoints, AU_KM } from './ephemeris.js';

const $ = id => document.getElementById(id);
const C = 299792.458;
const MIN_TIME = Date.UTC(1700, 0, 1), MAX_TIME = Date.UTC(2200, 11, 31, 23, 59);
const state = { selected: 'Earth', mode: 'orbit', time: Date.now(), rate: 1, speed: 100,
  theta: 0, phi: .22, distance: 24000, autoOrbit: false, labels: true, orbits: true,
  ship: new THREE.Vector3(), velocity: new THREE.Vector3(), keys: new Set() };
const objects = new Map(), positions = {}, orbitLines = [], mapPoints = [];
let renderer, scene, camera, stars, sunLight, last = performance.now(), lastUi = 0, lastEphemeris = -Infinity;
let toastTimer, pointer = null, simulatedLast = NaN, orbitYear = null, texturesFailed = [];
const loader = new THREE.TextureLoader();
const texturePromises = [];
const geo = new THREE.SphereGeometry(1, 96, 64);
const v = new THREE.Vector3(), temp = new THREE.Vector3(), rotation = new THREE.Euler(0, 0, 0, 'YXZ');
const body = id => BODIES.find(b => b.id === id);
const fmt = (n, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const distanceText = km => Math.abs(km) >= AU_KM * .1 ? `${fmt(km / AU_KM, 3)} AU` : `${fmt(km)} km`;
const speedText = n => n >= C * .1 ? `${fmt(n / C, 2)} c` : `${fmt(n, n < 10 ? 1 : 0)} km/s`;

function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3600); }
function texture(name) {
  let resolve; const promise = new Promise(r => resolve = r); texturePromises.push(promise);
  const t = loader.load(`assets/textures/${name}`, () => resolve(), undefined, () => { texturesFailed.push(name); resolve(); });
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}

const surfaceVertex = `
  varying vec2 vUv; varying vec3 vNormalWorld; varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() { vUv=uv; vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz;
    vNormalWorld=normalize(mat3(modelMatrix)*normal);
    gl_Position=projectionMatrix*viewMatrix*world;
    #include <logdepthbuf_vertex>
  }`;
const surfaceFragment = `
  uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDirection;
  uniform float isEarth; uniform float exposure; varying vec2 vUv; varying vec3 vNormalWorld; varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n=normalize(vNormalWorld); float ndl=dot(n,sunDirection);
    vec3 albedo=texture2D(dayMap,vUv).rgb;
    vec3 color=albedo*(0.045+1.8*max(ndl,0.0));
    if(isEarth>0.5) { color+=texture2D(nightMap,vUv).rgb*1.3*(1.0-smoothstep(-0.15,0.14,ndl));
      vec3 viewDir=normalize(-vWorld); float ocean=1.0-smoothstep(0.12,0.3,albedo.r+albedo.g);
      color+=vec3(.3,.4,.5)*pow(max(dot(reflect(-sunDirection,n),viewDir),0.0),70.0)*ocean*max(ndl,0.0); }
    gl_FragColor=vec4(color*exposure,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function createBody(b) {
  const group = new THREE.Group(); scene.add(group);
  const surface = new THREE.Group(); surface.rotation.z = THREE.MathUtils.degToRad(b.tilt || 0); group.add(surface);
  const map = texture(b.texture || `${b.id.toLowerCase()}.jpg`);
  const material = b.id === 'Sun' ? new THREE.MeshBasicMaterial({ map, color: 0xfff3d7 }) : new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: map }, nightMap: { value: b.id === 'Earth' ? texture('earth-night.jpg') : map },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) }, isEarth: { value: b.id === 'Earth' ? 1 : 0 }, exposure: { value: 1 } },
    vertexShader: surfaceVertex, fragmentShader: surfaceFragment
  });
  const mesh = new THREE.Mesh(geo, material); mesh.scale.setScalar(b.radiusKm); surface.add(mesh);
  let clouds, atmosphere;
  if (b.id === 'Earth') {
    const cloudMap = texture('earth-clouds.jpg'); cloudMap.colorSpace = THREE.NoColorSpace;
    clouds = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xffffff, alphaMap: cloudMap,
      transparent: true, opacity: .72, depthWrite: false, shininess: 5 }));
    clouds.scale.setScalar(b.radiusKm * 1.006); surface.add(clouds);
  }
  if (['Earth', 'Venus', 'Neptune', 'Uranus'].includes(b.id)) {
    const tint = b.id === 'Venus' ? 0xefc28f : b.id === 'Uranus' ? 0x72d5e3 : 0x3c8bff;
    atmosphere = new THREE.Mesh(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { glowColor: { value: new THREE.Color(tint) }, sunDirection: { value: new THREE.Vector3() } },
      vertexShader: surfaceVertex,
      fragmentShader: `uniform vec3 glowColor; uniform vec3 sunDirection; varying vec3 vNormalWorld; varying vec3 vWorld;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec3 n=normalize(vNormalWorld); float rim=pow(1.0-max(dot(n,normalize(-vWorld)),0.0),3.2);
          float lit=smoothstep(-.25,.65,dot(n,sunDirection)); gl_FragColor=vec4(glowColor,rim*lit*.65); }`
    })); atmosphere.scale.setScalar(b.radiusKm * 1.022); surface.add(atmosphere);
  }
  if (b.id === 'Saturn') {
    const ringGeo = new THREE.RingGeometry(b.radiusKm * 1.24, b.radiusKm * 2.27, 160, 2);
    const p = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r / b.radiusKm - 1.24) / 1.03, .5); }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshPhongMaterial({ map: texture('saturn-ring.png'), side: THREE.DoubleSide, transparent: true, opacity: .92, depthWrite: false, shininess: 0 }));
    ring.rotation.x = -Math.PI / 2; surface.add(ring);
  }
  if (b.id === 'Sun') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128); grad.addColorStop(0,'rgba(255,226,148,.7)'); grad.addColorStop(.22,'rgba(255,166,62,.15)'); grad.addColorStop(.52,'rgba(246,100,15,.035)'); grad.addColorStop(1,'rgba(246,100,15,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.setScalar(b.radiusKm * 7); group.add(glow);
  }
  const label = document.createElement('span'); label.className = 'body-label'; label.textContent = `· ${b.name}`; $('labels').appendChild(label);
  objects.set(b.id, { group, surface, mesh, material, clouds, atmosphere, label });
}

function makeStars() {
  const count = 4300, data = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  let seed = 19287; const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const az = rand() * Math.PI * 2, z = rand() * 2 - 1, d = Math.sqrt(1-z*z), radius = 2e9;
    data.set([Math.cos(az)*d*radius,z*radius,Math.sin(az)*d*radius],i*3);
    const c = .22 + rand() * .65; colors.set([c*(.85+rand()*.15),c*(.85+rand()*.15),c],i*3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(data,3)); g.setAttribute('color', new THREE.BufferAttribute(colors,3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.25, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .8, depthWrite: false })); scene.add(stars);
}

function updateEphemeris(force = false) {
  if (!force && Math.abs(state.time - lastEphemeris) < 200) return;
  const result = getPositions(new Date(state.time));
  for (const b of BODIES) { const p = result[b.id]; positions[b.id] ||= new THREE.Vector3(); positions[b.id].set(p.x, p.y, p.z).multiplyScalar(AU_KM); }
  lastEphemeris = state.time;
}

function buildOrbitLines() {
  const year = new Date(state.time).getUTCFullYear(); if (year === orbitYear) return;
  orbitYear = year;
  for (const line of orbitLines) { scene.remove(line); line.geometry.dispose(); line.material.dispose(); } orbitLines.length = 0;
  const midpoint = Date.UTC(year, 0, 1);
  for (const b of BODIES.filter(b => !['Sun', 'Moon'].includes(b.id))) {
    const points = getOrbitPoints(b.id,new Date(midpoint)).map(p=>new THREE.Vector3(p.x*AU_KM,p.y*AU_KM,p.z*AU_KM));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: b.color || '#56667a', transparent: true, opacity: .18, depthWrite: false }));
    line.userData.bodyId=b.id; scene.add(line); orbitLines.push(line);
  }
}

function setMode(mode) {
  if (mode === 'flight' && state.mode !== 'flight') { state.autoOrbit = false; toast('飞船已接管 · WASD 移动，拖动转向，空格制动'); }
  state.mode = mode; state.velocity.set(0,0,0); state.keys.clear();
  document.body.classList.toggle('flight-mode', mode === 'flight');
  $('flightTab').classList.toggle('active',mode==='flight'); $('exploreTab').classList.toggle('active',mode!=='flight');
  $('flightBtn').innerHTML = mode === 'flight' ? '返回观察 <span>↗</span>' : '开始驾驶 <span>→</span>';
  $('modeLabel').textContent=mode==='flight'?'手动驾驶':mode==='map'?'太阳系全景':state.autoOrbit?'自动环绕':'环绕观察';
  document.querySelector('.viewport-hint').innerHTML = mode === 'flight' ? '拖动转向 · 滚轮调速 <span class="hint-divider">/</span> <kbd>Space</kbd> 制动' : '拖动环绕 · 滚轮缩放 <span class="hint-divider">/</span> <kbd>F</kbd> 聚焦目标';
}

function focusTarget(auto = false, notify = true) {
  const b = body(state.selected), pos = positions[b.id];
  const away = b.id === 'Sun' ? new THREE.Vector3(1,.18,1) : pos.clone().negate().normalize();
  away.applyAxisAngle(new THREE.Vector3(0,1,0), -.55); away.y += .24; away.normalize();
  const mobileFit=innerWidth<=760?Math.max(1.18,innerHeight/innerWidth*(b.id==='Saturn'?.85:.65)):1;
  state.theta = Math.atan2(away.x,away.z); state.phi = Math.asin(away.y); state.distance = b.radiusKm * (b.id==='Saturn'?6.2:3.65) * mobileFit;
  state.autoOrbit = auto; setMode('orbit'); state.autoOrbit=auto; updateCamera(0); updateUi();
  document.body.classList.remove('show-destinations', 'show-info');
  if(notify) toast(`已抵达${b.name} · ${auto?'自动环绕中，拖动可接管':'拖动观察，滚轮靠近'}`);
}

function selectTarget(id, arrive = false) {
  state.selected=id; const b=body(id);
  $('selectedName').textContent=b.name; $('selectedEn').textContent=(b.nameEn || b.id).toUpperCase();
  $('selectedType').textContent=b.type || (id==='Sun'?'恒星':id==='Moon'?'天然卫星':'行星');
  $('selectedDesc').textContent=b.description;
  $('selectedRadius').innerHTML=`${fmt(b.radiusKm)} <span>km</span>`;
  $('selectedPeriod').innerHTML=id==='Sun'?'—':`${fmt(b.orbitalPeriodDays || 0,2)} <span>天</span>`;
  $('breadcrumbTarget').textContent=b.name;
  document.querySelectorAll('.planet-row').forEach(el=>{ const active=el.dataset.id===id; el.classList.toggle('active',active); el.setAttribute('aria-pressed',String(active)); });
  if(arrive)focusTarget(false,false); updateUi();
}

function showMap() { setMode('map'); state.theta=.1; state.phi=1.32; state.distance=65*AU_KM; updateCamera(0); toast('太阳系全景 · 大小与距离保持真实比例，选择天体可抵达近旁'); }

function updateCamera(dt) {
  if(state.mode!=='flight') {
    if(state.autoOrbit)state.theta+=dt*.06;
    const target=state.mode==='map'?positions.Sun:positions[state.selected];
    state.ship.copy(target).add(temp.set(Math.sin(state.theta)*Math.cos(state.phi),Math.sin(state.phi),Math.cos(state.theta)*Math.cos(state.phi)).multiplyScalar(state.distance));
    camera.position.set(0,0,0); camera.lookAt(v.copy(target).sub(state.ship));
  } else {
    rotation.setFromQuaternion(camera.quaternion,'YXZ');
    const turn=dt*.85;
    if(state.keys.has('ArrowLeft'))rotation.y+=turn;if(state.keys.has('ArrowRight'))rotation.y-=turn;
    if(state.keys.has('ArrowUp'))rotation.x+=turn;if(state.keys.has('ArrowDown'))rotation.x-=turn;
    rotation.x=THREE.MathUtils.clamp(rotation.x,-1.55,1.55); camera.quaternion.setFromEuler(rotation);
    const axis = temp.set(Number(state.keys.has('KeyD'))-Number(state.keys.has('KeyA')),Number(state.keys.has('KeyE'))-Number(state.keys.has('KeyQ')),Number(state.keys.has('KeyS'))-Number(state.keys.has('KeyW')));
    const boost=state.keys.has('ShiftLeft')||state.keys.has('ShiftRight')?10:1;
    axis.normalize().applyQuaternion(camera.quaternion).multiplyScalar(state.speed*boost);
    state.velocity.lerp(axis,1-Math.exp(-dt*9));
    if(state.keys.has('Space'))state.velocity.set(0,0,0);
    const displacement=state.velocity.clone().multiplyScalar(dt); const length=displacement.length();
    if(length>0) {
      const direction=displacement.clone().normalize(); let allowed=length;
      for(const b of BODIES){ const offset=state.ship.clone().sub(positions[b.id]); const radius=b.radiusKm*1.001;
        const projection=offset.dot(direction), discriminant=projection*projection-offset.lengthSq()+radius*radius;
        if(discriminant>=0){const hit=-projection-Math.sqrt(discriminant);if(hit>=0&&hit<allowed)allowed=Math.max(0,hit-.01);}
      }
      if(allowed<length){state.velocity.set(0,0,0);toast('接近天体表面 · 安全制动');}
      state.ship.addScaledVector(direction,allowed);
    }
    // Planet motion can overtake the camera while the simulation clock is accelerated.
    for(const b of BODIES){const delta=state.ship.clone().sub(positions[b.id]);const safe=b.radiusKm*1.001;if(delta.length()<safe){state.ship.copy(positions[b.id]).add(delta.lengthSq()?delta.setLength(safe):new THREE.Vector3(safe,0,0));state.velocity.set(0,0,0);}}
  }
}

function updateScene() {
  const days=(state.time-Date.UTC(2000,0,1,12))/86400000;
  for(const b of BODIES){
    const o=objects.get(b.id); o.group.position.copy(positions[b.id]).sub(state.ship);
    // Obliquity > 90 degrees already represents retrograde rotation.
    const angle=(days*24/Math.abs(b.rotationHours || 24)*Math.PI*2)%(Math.PI*2); o.mesh.rotation.y=angle;
    if(o.clouds)o.clouds.rotation.y=angle*.98+.2;
    if(o.material.uniforms)o.material.uniforms.sunDirection.value.copy(positions[b.id]).negate().normalize();
    if(o.atmosphere)o.atmosphere.material.uniforms.sunDirection.value.copy(positions[b.id]).negate().normalize();
  }
  for(const line of orbitLines){line.position.copy(state.ship).negate();const b=body(line.userData.bodyId);line.visible=state.orbits&&state.ship.distanceTo(positions[b.id])>b.radiusKm*20;}
  sunLight.position.copy(positions.Sun).sub(state.ship);
  const nearest=Math.min(...BODIES.map(b=>Math.max(.05,state.ship.distanceTo(positions[b.id])-b.radiusKm)));
  camera.near=Math.max(.01,Math.min(100,nearest*.001)); camera.updateProjectionMatrix();
}

function renderLabels(){
  const width=innerWidth,height=innerHeight,placed=[];
  const ordered=[...BODIES].sort((a,b)=>(b.id===state.selected?2:b.id==='Sun'?1:0)-(a.id===state.selected?2:a.id==='Sun'?1:0));
  for(const b of ordered){const o=objects.get(b.id), delta=o.group.position;
    const dist=delta.length(), angular=b.radiusKm/dist;
    v.copy(delta).project(camera); let valid=state.labels&&v.z<1&&v.z>-1&&Math.abs(v.x)<.95&&Math.abs(v.y)<.83;
    if(valid){const ray=delta.clone().normalize();for(const other of BODIES){if(other.id===b.id)continue;const center=objects.get(other.id).group.position;const along=center.dot(ray);if(along>0&&along<dist&&center.lengthSq()-along*along<other.radiusKm*other.radiusKm){valid=false;break;}}}
    o.label.style.display=valid?'block':'none';
    if(valid){const radius=angular*height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      const x=(v.x+1)*width/2+Math.min(radius+12,width*.4),y=(1-v.y)*height/2-8;
      if(placed.some(p=>Math.abs(p.x-x)<55&&Math.abs(p.y-y)<18)){o.label.style.display='none';continue;}placed.push({x,y});
      o.label.style.transform=`translate(${x}px,${y}px)`;
      o.label.style.color=b.id===state.selected?'#e4bd81':'#8391a5';}
  }
}

function drawMinimap(){
  const canvas=$('minimap'), ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,max=Math.min(w/2-20,h/2-10);
  ctx.clearRect(0,0,w,h); mapPoints.length=0;
  ctx.strokeStyle='#263142';ctx.lineWidth=1;ctx.setLineDash([2,7]);ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();ctx.setLineDash([]);
  const radial=au=>Math.log1p(au*2)/Math.log1p(65)*max;
  for(const b of BODIES.filter(x=>x.id!=='Moon')){
    const p=positions[b.id],r=radial(p.length()/AU_KM),az=Math.atan2(p.z,p.x),x=cx+Math.cos(az)*r,y=cy+Math.sin(az)*r;
    if(state.orbits&&b.id!=='Sun'){ctx.strokeStyle='#233044';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.fillStyle=b.color||'#fff';ctx.arc(x,y,b.id==='Sun'?4:b.id===state.selected?4:2.3,0,Math.PI*2);ctx.fill();
    if(b.id===state.selected){ctx.strokeStyle='#e4bd81';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.stroke();}
    mapPoints.push({id:b.id,x,y});
  }
  const r=radial(state.ship.length()/AU_KM),a=Math.atan2(state.ship.z,state.ship.x),x=cx+Math.cos(a)*Math.min(r,max+5),y=cy+Math.sin(a)*Math.min(r,max+5);
  ctx.strokeStyle='#d9e8ff';ctx.beginPath();ctx.moveTo(x-3,y+7);ctx.lineTo(x,y+1);ctx.lineTo(x+3,y+7);ctx.stroke();
}

function updateUi(){
  const b=body(state.selected),alt=state.ship.distanceTo(positions[b.id])-b.radiusKm;
  $('altitudeValue').textContent=distanceText(Math.max(0,alt)); $('velocityValue').textContent=speedText(state.mode==='flight'?state.velocity.length():0);
  $('selectedDistance').innerHTML=`${fmt(positions[b.id].length()/AU_KM,4)} <span>AU</span>`;
  const iso=new Date(state.time).toISOString();$('utcClock').textContent=iso.slice(0,19).replace('T',' ')+' UTC';
  if(document.activeElement!==$('dateInput'))$('dateInput').value=iso.slice(0,16);
  $('modeLabel').textContent=state.mode==='flight'?'手动驾驶':state.mode==='map'?'太阳系全景':state.autoOrbit?'自动环绕':'环绕观察';
  const forward=camera.getWorldDirection(new THREE.Vector3()),bearing=(THREE.MathUtils.radToDeg(Math.atan2(-forward.z,forward.x))+360)%360;
  document.querySelector('.compass').innerHTML=`<span>黄道方位 ${fmt(bearing,1)}°</span><i></i><b>⌄</b><i></i><span>俯仰 ${fmt(THREE.MathUtils.radToDeg(Math.asin(forward.y)),1)}°</span>`;
  $('orbitBtn').classList.toggle('active',state.autoOrbit);
  for(const el of document.querySelectorAll('.planet-row'))el.querySelector('.planet-distance').textContent=fmt(positions[el.dataset.id].length()/AU_KM,2)+' AU';
  drawMinimap();
}

function setSpeed(value){state.speed=THREE.MathUtils.clamp(value,.1,1e8);$('speedSlider').value=Math.log10(state.speed);$('speedValue').textContent=speedText(state.speed);
  const percent=(Math.log10(state.speed)+1)/9*100;$('speedSlider').style.background=`linear-gradient(to right,#e4bd81 ${percent}%,#303b4b ${percent}%)`;
  document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',Math.abs(Number(el.dataset.speed)-state.speed)<state.speed*.001));}
function setRate(value){state.rate=value;$('timeRate').value=value;$('playBtn').textContent=value?'Ⅱ':'▶';$('playBtn').setAttribute('aria-label',value?'暂停时间':'播放时间');}

function setupControls(){
  for(const b of BODIES){const row=document.createElement('button');row.type='button';row.className='planet-row';row.dataset.id=b.id;
    row.innerHTML=`<span class="planet-dot" style="background-color:${b.color};background-image:url('assets/textures/${b.texture||b.id.toLowerCase()+'.jpg'}')"></span><span style="flex:1"><span class="planet-name">${b.name}</span><span class="planet-en">${(b.nameEn||b.id).toUpperCase()}</span></span><span class="planet-distance"></span>`;
    row.addEventListener('click',()=>selectTarget(b.id,true));$('planetList').appendChild(row);}
  $('planetSearch').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.planet-row').forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);el.style.display=el.hidden?'none':'';});});
  $('goBtn').onclick=()=>focusTarget(false);$('orbitBtn').onclick=()=>{if(state.mode!=='orbit')focusTarget(true);else{state.autoOrbit=!state.autoOrbit;updateUi();toast(state.autoOrbit?'自动环绕已开启':'已停止自动环绕');}};
  const toggleFlight=()=>state.mode==='flight'?focusTarget(false,false):setMode('flight');
  $('flightBtn').onclick=toggleFlight;$('flightTab').onclick=()=>setMode('flight');$('exploreTab').onclick=()=>focusTarget(false,false);$('mapBtn').onclick=showMap;
  $('speedSlider').oninput=e=>setSpeed(10**Number(e.target.value));document.querySelectorAll('[data-speed]').forEach(el=>el.onclick=()=>setSpeed(Number(el.dataset.speed)));
  $('labelsToggle').onchange=e=>state.labels=e.target.checked;$('orbitsToggle').onchange=e=>state.orbits=e.target.checked;
  $('timeRate').onchange=e=>setRate(Number(e.target.value));$('playBtn').onclick=()=>setRate(state.rate?0:1);
  $('nowBtn').onclick=()=>{state.time=Date.now();setRate(1);updateEphemeris(true);buildOrbitLines();updateUi();toast('已回到当前时间');};
  $('dateInput').onchange=e=>{const input=new Date(e.target.value+'Z').getTime();if(!Number.isFinite(input)||input<MIN_TIME||input>MAX_TIME){toast('请选择 1700—2200 年之间的 UTC 日期');updateUi();return;}state.time=input;updateEphemeris(true);buildOrbitLines();updateCamera(0);updateUi();};
  for(const name of ['help','settings']){$(name+'Btn').onclick=()=>{$(name+'Dialog').showModal();state.keys.clear();};$(name+'Close').onclick=()=>$(name+'Dialog').close();$(name+'Dialog').addEventListener('click',e=>{if(e.target===$(name+'Dialog'))$(name+'Dialog').close();});}
  $('exposureSlider').oninput=e=>{renderer.toneMappingExposure=Number(e.target.value);};
  $('qualitySelect').onchange=e=>{renderer.setPixelRatio(Math.min(devicePixelRatio,Number(e.target.value)));resize();};
  $('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此预览环境不支持全屏，请在独立浏览器中打开');}};
  $('screenshotBtn').onclick=()=>{renderer.render(scene,camera);const link=document.createElement('a');link.download=`solar-voyager-${new Date(state.time).toISOString().slice(0,10)}.png`;link.href=renderer.domElement.toDataURL('image/png');link.click();toast('探索画面已保存');};
  $('destinationsToggle').onclick=()=>{document.body.classList.toggle('show-destinations');document.body.classList.remove('show-info');};$('infoToggle').onclick=()=>{document.body.classList.toggle('show-info');document.body.classList.remove('show-destinations');};
  $('minimap').onclick=e=>{const rect=e.target.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*e.target.width,y=(e.clientY-rect.top)/rect.height*e.target.height;const closest=[...mapPoints].sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(closest&&Math.hypot(closest.x-x,closest.y-y)<20)selectTarget(closest.id,true);};
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);state.autoOrbit=false;canvas.focus();});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer.x=e.clientX;pointer.y=e.clientY;
    if(state.mode==='flight'){rotation.setFromQuaternion(camera.quaternion,'YXZ');rotation.y-=dx*.003;rotation.x=THREE.MathUtils.clamp(rotation.x-dy*.003,-1.55,1.55);camera.quaternion.setFromEuler(rotation);}else{state.theta-=dx*.005;state.phi=THREE.MathUtils.clamp(state.phi+dy*.005,-1.55,1.55);}});
  const release=()=>pointer=null;canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(state.mode==='flight')setSpeed(state.speed*Math.exp(-e.deltaY*.003));else state.distance=THREE.MathUtils.clamp(state.distance*Math.exp(e.deltaY*.0015),(state.mode==='map'?body('Sun').radiusKm:body(state.selected).radiusKm)*1.005,100*AU_KM);},{passive:false});
  window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.code==='KeyF'&&!e.repeat)focusTarget(false);if(e.code==='KeyH'&&!e.repeat)document.body.classList.toggle('hud-hidden');if(e.code==='Escape'&&state.mode==='flight')focusTarget(false,false);
    if(state.mode==='flight')state.keys.add(e.code);});
  window.addEventListener('keyup',e=>state.keys.delete(e.code));window.addEventListener('blur',()=>{state.keys.clear();state.velocity.set(0,0,0);});
  document.addEventListener('visibilitychange',()=>{last=performance.now();state.keys.clear();});
  document.querySelectorAll('[data-control]').forEach(btn=>{btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);state.keys.add(btn.dataset.control);};btn.onpointerup=btn.onpointercancel=btn.onlostpointercapture=()=>state.keys.delete(btn.dataset.control);});
  window.addEventListener('resize',resize);setSpeed(100);
}

function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*(innerWidth<=760?.09:.035),innerWidth,innerHeight);camera.updateProjectionMatrix();}
function animate(now){
  const dt=Math.min((now-last)/1000,.07);last=now;
  if(!document.hidden){
    state.time=THREE.MathUtils.clamp(state.time+dt*1000*state.rate,MIN_TIME,MAX_TIME);
    if((state.time===MIN_TIME||state.time===MAX_TIME)&&state.rate){setRate(0);toast('已达到支持的星历日期边界');}
    updateEphemeris();buildOrbitLines();updateCamera(dt);updateScene();renderer.render(scene,camera);renderLabels();
    if(now-lastUi>150){updateUi();lastUi=now;}
  }
  requestAnimationFrame(animate);
}

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('universe'),antialias:true,logarithmicDepthBuffer:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x05080d);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,1e11);
    scene.add(new THREE.AmbientLight(0x71849f,.22));sunLight=new THREE.PointLight(0xfff6e5,2.3,0,0);scene.add(sunLight);
    makeStars();BODIES.forEach(createBody);updateEphemeris(true);setupControls();selectTarget('Earth');focusTarget(false,false);resize();
    $('loadingText').textContent='正在载入行星表面地图…';
    await Promise.all(texturePromises);
    $('loading').classList.add('hidden');setTimeout(()=>$('loading').remove(),600);
    requestAnimationFrame(animate);setTimeout(buildOrbitLines,100);
    if(texturesFailed.length)toast(`部分纹理载入失败：${texturesFailed.join('、')}。刷新可重试。`);
  }catch(error){console.error(error);$('loadingText').textContent='三维渲染无法启动。请使用支持 WebGL 2 的浏览器，并开启硬件加速。';const retry=document.createElement('button');retry.className='secondary-button';retry.style.width='180px';retry.textContent='重新载入';retry.onclick=()=>location.reload();$('loading').appendChild(retry);}
}
init();
