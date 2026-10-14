// visual.raw.json + raw/*.v,*.f -> visual.bin + visual.json: meshoptimizer simplify (lock nothing, error-bounded,
// then sloppy if still over budget), int16-quantised positions, uint16 / uint32 indices
// node vis.mjs <robot dir> [target triangles per mesh] [max error]
import { MeshoptSimplifier as S } from "meshoptimizer/meshopt_simplifier.module.js";
import fs from "node:fs";
const [dir, tgt = "1500", err = "0.01"] = process.argv.slice(2);
await S.ready;
const man = JSON.parse(fs.readFileSync(`${dir}/visual.raw.json`, "utf8"));
const parts = [];
let off = 0, tris0 = 0, tris1 = 0;
const push = (buf) => {
  const pad = (4 - off % 4) % 4;
  if (pad) parts.push(Buffer.alloc(pad)), off += pad;
  const o = off;
  parts.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  off += buf.byteLength;
  return o;
};
man.meshes.forEach((me, k) => {
  const rd = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
  const V = new Float32Array(rd(`${dir}/raw/${k}.v`));
  let F = new Uint32Array(rd(`${dir}/raw/${k}.f`));
  tris0 += F.length / 3;
  const target = Math.min(F.length, Math.max(300, +tgt) * 3);
  if (F.length > target) {
    let [I] = S.simplify(F, V, 3, target, +err);
    if (I.length > target * 1.5) [I] = [S.simplifySloppy(I, V, 3, null, target, +err)[0]];
    F = new Uint32Array(I);
  }
  // compact: keep only used vertices
  const map = new Int32Array(V.length / 3).fill(-1), nv = [];
  const Fi = new Uint32Array(F.length);
  F.forEach((v, i) => {
    if (map[v] < 0) map[v] = nv.length / 3, nv.push(V[v * 3], V[v * 3 + 1], V[v * 3 + 2]);
    Fi[i] = map[v];
  });
  tris1 += Fi.length / 3;
  const n = nv.length / 3, lo = [0, 1, 2].map((a) => Math.min(...nv.filter((_, i) => i % 3 === a))), hi = [0, 1, 2].map((a) => Math.max(...nv.filter((_, i) => i % 3 === a)));
  const scale = lo.map((l, a) => Math.max(hi[a] - l, 1e-9) / 65535);
  const q = new Int16Array(n * 3);
  for (let i = 0; i < n * 3; i++) q[i] = Math.round((nv[i] - lo[i % 3]) / scale[i % 3] - 32768);
  const idx = n < 65536 ? Uint16Array.from(Fi) : Fi;
  me.v = [push(q), n];
  me.i = [push(idx), idx.length, idx.BYTES_PER_ELEMENT];
  me.lo = lo.map((l, a) => l + 32768 * scale[a]);
  me.scale = scale;
});
fs.writeFileSync(`${dir}/visual.bin`, Buffer.concat(parts));
fs.writeFileSync(`${dir}/visual.json`, JSON.stringify(man));
console.log(`${dir}: ${man.meshes.length} meshes, ${tris0} -> ${tris1} triangles, ${(off / 1024).toFixed(0)} KB`);
