/**
 * Solar Voyager ephemeris. Application code: MIT.
 * Astronomy Engine 2.1.19: https://github.com/cosinekitty/astronomy
 * The engine targets ~1 arcminute angular accuracy; this is not a JPL DE440
 * numerical ephemeris. Positions are simultaneous geometric centers, with no
 * light-time or aberration correction. Surface orientation is a visual model.
 * Source frame: heliocentric EQJ -> fixed J2000 ecliptic (ECL).
 * Scene frame: (x, y, z) = (ECL.x, ECL.z, -ECL.y), in AU, right-handed.
 */

export const AU_KM = 149597870.7;
export const DAY_MS = 86400000;
export const EPHEMERIS_INFO = Object.freeze({
  engine: 'Astronomy Engine 2.1.19',
  coordinates: 'Heliocentric geometric · J2000 ecliptic · AU',
  accuracy: '模型设计目标约 1 角分；非 JPL 数值星历。显示同一时刻的几何位置，未计算光行时与光行差。',
  source: 'https://github.com/cosinekitty/astronomy',
  facts: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
});

// Equatorial radii (km); rotation is sidereal hours, negative means retrograde.
// Planet values are rounded NASA NSSDCA fact-sheet values. The Sun uses a
// nominal radius and approximate equatorial rotation; it rotates differentially.
export const BODIES = Object.freeze([
  { id:'Sun', name:'太阳', nameEn:'SUN', type:'恒星', radiusKm:695700, rotationHours:609.12, tilt:7.25, orbitalPeriodDays:0, color:'#ffd18c', texture:'sun.jpg', description:'太阳系的引力中心。炽热的等离子体持续释放能量，光从这里到达地球需要约 8 分钟。' },
  { id:'Mercury', name:'水星', nameEn:'MERCURY', type:'类地行星', radiusKm:2439.5, rotationHours:1407.6, tilt:0.034, orbitalPeriodDays:87.969, color:'#b7a69b', texture:'mercury.jpg', description:'最靠近太阳的行星。遍布撞击坑的古老表面，几乎没有大气层，昼夜温差巨大。' },
  { id:'Venus', name:'金星', nameEn:'VENUS', type:'类地行星', radiusKm:6052, rotationHours:-5832.5, tilt:177.4, orbitalPeriodDays:224.701, color:'#e1b77e', texture:'venus.jpg', description:'浓厚的二氧化碳大气包裹着这颗逆向自转的世界。可见光下，厚重云层遮住了地表。' },
  { id:'Earth', name:'地球', nameEn:'EARTH', type:'类地行星', radiusKm:6378, rotationHours:23.9345, tilt:23.4393, orbitalPeriodDays:365.256, color:'#6fb8ee', texture:'earth.jpg', description:'我们的蓝色家园。海洋、陆地与流动的云层交织，夜半球可见城市灯光。' },
  { id:'Moon', name:'月球', nameEn:'MOON', type:'天然卫星', radiusKm:1737.5, rotationHours:655.7, tilt:6.7, orbitalPeriodDays:27.3217, color:'#c3c6cc', texture:'moon.jpg', parent:'Earth', description:'地球唯一的天然卫星。暗色月海与明亮的撞击坑记录着太阳系漫长的历史。' },
  { id:'Mars', name:'火星', nameEn:'MARS', type:'类地行星', radiusKm:3396, rotationHours:24.6229, tilt:25.19, orbitalPeriodDays:686.98, color:'#e99c77', texture:'mars.jpg', description:'铁锈色的沙漠世界。巨大的火山、峡谷和极冠，让这颗邻近行星充满值得探索的细节。' },
  { id:'Jupiter', name:'木星', nameEn:'JUPITER', type:'气态巨行星', radiusKm:71492, rotationHours:9.925, tilt:3.13, orbitalPeriodDays:4331, color:'#dfc1a2', texture:'jupiter.jpg', description:'太阳系最大的行星。明暗相间的云带围绕着它，大红斑是一场持续多年的巨大风暴。' },
  { id:'Saturn', name:'土星', nameEn:'SATURN', type:'气态巨行星', radiusKm:60268, rotationHours:10.7, tilt:26.73, orbitalPeriodDays:10747, color:'#ecd5a7', texture:'saturn.jpg', description:'冰粒与岩屑组成的广阔光环环绕着这颗气态巨行星。靠近观察，可以辨认环带之间的间隙。' },
  { id:'Uranus', name:'天王星', nameEn:'URANUS', type:'冰巨行星', radiusKm:25559, rotationHours:-17.2, tilt:97.77, orbitalPeriodDays:30589, color:'#9cdddf', texture:'uranus.jpg', description:'近乎侧躺着公转的冰巨行星。大气中的甲烷吸收红光，赋予它淡青色的外观。' },
  { id:'Neptune', name:'海王星', nameEn:'NEPTUNE', type:'冰巨行星', radiusKm:24764, rotationHours:16.1, tilt:28.32, orbitalPeriodDays:59800, color:'#638de9', texture:'neptune.jpg', description:'遥远而寒冷的冰巨行星。强烈的风在大气中流动，它完成一周公转需要约 164 个地球年。' },
].map(Object.freeze));

function engine() {
  const astronomy = globalThis.Astronomy;
  if (!astronomy?.HelioVector || !astronomy?.Rotation_EQJ_ECL) {
    throw new Error('Astronomy Engine is not loaded. Load vendor/astronomy.browser.min.js before the application module.');
  }
  return astronomy;
}

function checkDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('Ephemeris time must be a valid JavaScript Date.');
  }
}

/** Return a new {Sun, Mercury, ...} dictionary of scene-space AU vectors. */
export function getPositions(date) {
  checkDate(date);
  const A = engine();
  const time = A.MakeTime(date);
  const rotation = A.Rotation_EQJ_ECL();
  const earth = A.HelioVector(A.Body.Earth, time);
  const positions = {};
  for (const body of BODIES) {
    if (body.id === 'Sun') {
      positions.Sun = { x:0, y:0, z:0 };
      continue;
    }
    let equatorial;
    if (body.id === 'Moon') {
      // GeoMoon gives geometric Earth-centered EQJ coordinates. GeoVector
      // would introduce a light-time convention inconsistent with planets.
      const moon = A.GeoMoon(time);
      equatorial = new A.Vector(earth.x + moon.x, earth.y + moon.y, earth.z + moon.z, time);
    } else {
      equatorial = body.id === 'Earth' ? earth : A.HelioVector(A.Body[body.id], time);
    }
    const ecliptic = A.RotateVector(rotation, equatorial);
    positions[body.id] = { x:ecliptic.x, y:ecliptic.z, z:-ecliptic.y };
  }
  return positions;
}

/** Sample the actual ephemeris path, not a circular orbit approximation.
 * Moon samples are Earth-relative; all other samples are heliocentric.
 */
export function getOrbitPoints(id, date, count = 180) {
  checkDate(date);
  const body = BODIES.find(item => item.id === id);
  if (!body) throw new RangeError(`Unknown body: ${id}`);
  if (!body.orbitalPeriodDays) return [];
  if (!Number.isInteger(count) || count < 2 || count > 4096) throw new RangeError('Orbit sample count must be 2–4096.');
  const A = engine();
  const rotation = A.Rotation_EQJ_ECL();
  const result = [];
  for (let i=0; i<=count; ++i) {
    const sample = new Date(date.getTime() + body.orbitalPeriodDays * DAY_MS * (i/count - 0.5));
    const eq = id === 'Moon' ? A.GeoMoon(sample) : A.HelioVector(A.Body[id], sample);
    const v = A.RotateVector(rotation, eq);
    result.push({ x:v.x, y:v.z, z:-v.y });
  }
  return result;
}
