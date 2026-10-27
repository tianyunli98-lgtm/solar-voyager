import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

// Exercise the exact browser bundle shipped with the site, without npm or a DOM.
runInThisContext(readFileSync(new URL('../dist/vendor/astronomy.browser.min.js', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../dist/js/ephemeris.js', import.meta.url), 'utf8');
const { AU_KM, BODIES, getPositions, getOrbitPoints } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const length = a => Math.hypot(a.x,a.y,a.z);
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
let checks = 0;
function verify(predicate, message) { assert.ok(predicate, message); checks++; }

verify(BODIES.length === 10 && new Set(BODIES.map(b=>b.id)).size === 10, 'Ten unique supported bodies');
for (const iso of ['1800-01-01T00:00:00Z','2000-01-01T12:00:00Z','2026-10-22T00:00:00Z','2200-01-01T00:00:00Z']) {
  const date = new Date(iso), positions = getPositions(date);
  assert.deepEqual(positions.Sun, {x:0,y:0,z:0}); checks++;
  for (const body of BODIES) {
    const p = positions[body.id];
    verify([p.x,p.y,p.z].every(Number.isFinite), `${body.id} finite at ${iso}`);
  }
  // Rotation must preserve heliocentric distances. This catches axis mistakes,
  // accidental unit conversion, and mixing geocentric with heliocentric frames.
  for (const id of ['Earth','Mars','Jupiter','Neptune']) {
    const distance = Astronomy.HelioDistance(Astronomy.Body[id], date);
    verify(Math.abs(length(positions[id])-distance) < 1e-10, `${id} AU distance preserved`);
  }
  verify(Math.abs(positions.Earth.y)<0.001, 'Earth orbit lies near fixed J2000 ecliptic');
  const moonDistance = length(sub(positions.Moon, positions.Earth))*AU_KM;
  verify(moonDistance>350000 && moonDistance<410000, 'Moon is Earth-relative, physical lunar distance');
}

// Independent geometric event check: the 8 April 2024 total solar eclipse.
// A geocentric Moon direction must align closely with the direction to the Sun.
const eclipse = getPositions(new Date('2024-04-08T18:18:00Z'));
const toMoon = sub(eclipse.Moon,eclipse.Earth), toSun = sub(eclipse.Sun,eclipse.Earth);
const separationDeg = Math.acos(dot(toMoon,toSun)/(length(toMoon)*length(toSun)))*180/Math.PI;
verify(separationDeg < 0.5, '2024 eclipse Sun/Moon alignment <0.5 degrees');

const jan = getPositions(new Date('2026-01-03T00:00:00Z'));
const jul = getPositions(new Date('2026-07-04T00:00:00Z'));
verify(length(jan.Earth)<0.985 && length(jul.Earth)>1.015, 'Earth perihelion/aphelion and calendar epoch are correct');
verify(length(sub(jan.Earth,jul.Earth))>1.98, 'Date change advances Earth to opposite side of orbit');
const path = getOrbitPoints('Mars',new Date('2026-01-01T00:00:00Z'),90);
verify(path.length===91 && path.every(p=>Number.isFinite(length(p))), 'Orbit samples include valid endpoints');
const lunarPath = getOrbitPoints('Moon',new Date('2026-01-01T00:00:00Z'),90);
verify(lunarPath.every(p=>length(p)<0.003), 'Moon orbit samples are Earth-relative');
assert.throws(()=>getPositions(new Date('invalid')),TypeError); checks++;
assert.throws(()=>getOrbitPoints('Unknown',new Date()),RangeError); checks++;
console.log(`PASS: ${checks} ephemeris checks; eclipse separation ${separationDeg.toFixed(4)} degrees.`);
console.log('Tests validate integration, frame conventions and physical/event invariants; they are not a full ephemeris accuracy audit.');
