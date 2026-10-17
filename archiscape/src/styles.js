// - the styles, in historical order. Each one reads the same heights: wall(K, E) dresses every exposed storey
// face, roof(K, R) crowns every column (R.tower: a column standing at least two storeys clear of its
// neighbours gets the style's dome / spire / pagoda), prop(K, ...) furnishes empty ground -
var AS_STYLES = [
  {
    id: "stonehenge",
    label: "Stonehenge",
    title: "Stonehenge",
    era: "Neolithic Britain · c. 2500 BC",
    blurb: "Sarsen uprights capped by lintels; every block becomes a trilithon",
    palette: [10328202],
    ground: { hex: 8231762, side: 6115394 },
    // no walls or roofs: posts at every corner of a block, lintels along its open edges
    column(K, C) {
      for (let L = 0; L < C.h; L++) {
        const y0 = L * AS_H, hh = AS_H * 0.78;
        C.cell.v.forEach((vi, i) => {
          if (!C.exposed(L, i) && !C.exposed(L, (i + 3) % 4)) return;
          const r = asHash(vi, L, 7), p = C.corners[i].clone().lerp(C.cen2, 0.12);
          const e = C.cell.e[i], yaw = Math.atan2(-e.t.y, e.t.x);
          K.ybox("matte", 10328202, p.x, y0 + hh / 2, p.y, 8.5e-3, hh, 6e-3, yaw + (r - 0.5) * 0.4, 0.22, r);
        });
        C.cell.e.forEach((e, k) => {
          if (!C.exposed(L, k)) return;
          const r = asHash(C.ci, k, L, 3), mid = e.a.clone().lerp(e.b, 0.5);
          K.ybox("matte", 9673854, mid.x, y0 + hh + 2.6e-3, mid.y, e.len * 1.1, 5.2e-3, 6.5e-3, Math.atan2(-e.t.y, e.t.x), 0.18, r);
        });
      }
    },
    prop(K, x, z, r) {
      if (r < 0.05) K.ybox("matte", 9673854, x, 2e-3, z, 0.016, 4e-3, 6e-3, r * 60, 0.2, r);
      else if (r > 0.965) {
        // a sheep
        K.sphere("matte", 15461076, new THREE6.Vector3(x, 4e-3, z), 4e-3, 3e-3, 2.6e-3, 1);
        K.sphere("matte", 3355443, new THREE6.Vector3(x + 4e-3, 5e-3, z), 1.5e-3, 1.5e-3, 1.3e-3, 0);
      }
    },
    // the monument: an outer ring of trilithons around a horseshoe of taller ones
    preset(cells) {
      return cells.map((c) => {
        const d = c.c.length() / AS_R, a = Math.atan2(c.c.y, c.c.x);
        if (Math.abs(d - 0.62) < 0.075) return 1;
        if (d > 0.18 && d < 0.36 && Math.cos(a - 0.5) < 0.55) return asHash(c.i, 9) < 0.7 ? 2 : 0;
        return 0;
      });
    }
  },
  {
    id: "greek",
    label: "Greek",
    title: "Classical Greece",
    era: "Athens · 5th century BC · the Acropolis",
    blurb: "White marble temples ringed by Doric columns, low pediments - and the ruins they became",
    palette: [14275781, 14012866],
    ground: { hex: 14077887, side: 9081720 },
    wall(K, E) {
      const marble = 15921122, ruin = asHash(E.ci, 77) < 0.2;
      // the cella wall, set back behind the colonnade
      asWall(K, E, "satin", E.bh, 0, ruin && E.top ? AS_H * 0.45 : AS_H, -5.5e-3, 0.03);
      if (E.L === 0) {
        // the stylobate: three steps
        for (let i = 0; i < 2; i++) asBand(K, E, "satin", marble, i * 1.65e-3, 1.65e-3, 3.6e-3 - i * 1.8e-3, 6e-3, 0.012 - i * 3e-3);
      }
      const y0 = E.L === 0 ? 3.3e-3 : 0, top = E.y1 - E.a3.y - 4.4e-3;
      for (const u of asSlots(E.len, 0.01, 0.3)) {
        const p = asAt(E, u, y0, 1.6e-3);
        // a ruin: broken columns of uneven height, the entablature gone
        const hh = ruin && E.top ? (top - y0) * (0.25 + 0.75 * asHash(E.ci, E.k, Math.round(u * 50))) : top - y0;
        K.cyl("satin", marble, p, p.clone().setY(p.y + hh), 1.6e-3, 1.35e-3, 10, 0.03, E.r);
        if (!(ruin && E.top)) K.box("satin", marble, p.clone().setY(p.y + hh - 4e-4), E.t3, AS_UP, E.n3, 4.2e-3, 1e-3, 4.2e-3);
      }
      if (ruin && E.top) return;
      // entablature: architrave, a frieze of triglyphs, cornice - all marble
      asBand(K, E, "satin", marble, AS_H - 4.4e-3, 1.8e-3, 1.6e-3, 3.2e-3, 2e-3);
      asBand(K, E, "satin", 15329769, AS_H - 2.6e-3, 1.6e-3, 1.7e-3, 3.2e-3, 2e-3);
      for (const u of asSlots(E.len, 7.5e-3, 0.3)) asOn(K, E, "satin", 13421250, u, AS_H - 1.8e-3, 1e-3, 1.4e-3, 3.4e-3, 4e-4);
      if (E.top) asBand(K, E, "satin", marble, AS_H - 1e-3, 1e-3, 2.4e-3, 3.4e-3, 2.5e-3);
    },
    roof(K, R) {
      if (asHash(R.ci, 77) < 0.2) {
        // fallen: the cella open to the sky, a few drums lying where they fell
        const dy = AS_H * 0.55;
        R = { ...R, y: R.y - dy, cen: R.cen.clone().setY(R.y - dy), v3: R.v3.map((p) => p.clone().setY(R.y - dy)), join: R.join.map(() => true) };
        asFlat(K, R, { kind: "satin", hex: 14209992 });
        for (let i = 0; i < 2; i++) {
          const p = R.cen.clone().add(new THREE6.Vector3((asHash(R.ci, i) - 0.5) * R.ins, 1.4e-3, (asHash(R.ci, i, 3) - 0.5) * R.ins));
          const d = new THREE6.Vector3(Math.cos(i * 2 + R.r * 9), 0, Math.sin(i * 2 + R.r * 9));
          K.cyl("satin", 15921122, p.clone().addScaledVector(d, -2.4e-3), p.clone().addScaledVector(d, 2.4e-3), 1.5e-3, 1.5e-3, 10);
        }
        return;
      }
      asPitched(K, R, {
        kind: "satin", hex: 15000287, pitch: 0.28, over: 3.5e-3, ridge: 15921122,
        gable: (K2, p, q, apex) => {
          // the pediment: a marble triangle and its acroterion
          K2.tri("satin", 15921122, p, q, apex);
          K2.box("satin", 15921122, apex.clone().setY(apex.y + 1.2e-3), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), 1.6e-3, 2.4e-3, 1.6e-3);
        }
      });
    },
    prop(K, x, z, r) {
      if (r < 0.1) asTree(K, "olive", x, z, 1, r);
      else if (r < 0.16) asTree(K, "cypress", x, z, 1, r);
      else if (r > 0.96) K.cyl("satin", 15921122, new THREE6.Vector3(x, 1.4e-3, z - 2.5e-3), new THREE6.Vector3(x + 1e-3, 1.4e-3, z + 2.5e-3), 1.5e-3, 1.5e-3, 10);
    }
  },
  {
    id: "roman",
    label: "Roman",
    title: "Imperial Rome",
    era: "Rome · 1st–2nd century · Colosseum and Pantheon",
    blurb: "Tiers of arches, terracotta roofs, coffered domes on the tallest halls",
    palette: [14206626, 13605474, 11883580, 15129803],
    ground: { hex: 11773327, side: 8418150 },
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.05);
      const s = asSlots(E.len, 0.014, 0.5);
      for (const u of s) asArch(K, E, "matte", 3877152, u, 0.012, 7.4e-3, 0.014);
      for (let i = 0; i <= s.length; i++) if (s.length) asOn(K, E, "matte", 15195352, i / s.length, AS_H / 2, 1.6e-3, AS_H - 4e-3, 7e-4, 1.6e-3);
      asBand(K, E, "matte", 15195352, AS_H - 2.6e-3, 2.6e-3, 1.2e-3, 2.6e-3, 1e-3);
      if (E.L === 0) asBand(K, E, "matte", 11316396, 0, 3e-3, 1e-3, 2.4e-3, 1e-3);
    },
    roof(K, R) {
      if (R.tower) {
        asFlat(K, R, { hex: 12960936 });
        // the Pantheon: stepped rings, a shallow dome and its oculus
        asDome(K, R, { kind: "matte", hex: 10132362, profile: "stepped", scale: 0.95, drum: 4e-3, height: 0.8 });
        K.cyl("matte", 1710618, R.cen.clone().setY(R.y + 4e-3 + R.ins * 0.95 * 0.69), R.cen.clone().setY(R.y + 4e-3 + R.ins * 0.95 * 0.7), R.ins * 0.2, R.ins * 0.2, 10);
      } else asPitched(K, R, { kind: "matte", hex: 11954493, pitch: 0.36, over: 3.5e-3, hip: 0.45 });
    },
    prop(K, x, z, r) {
      if (r < 0.1) asTree(K, "pine", x, z, 1, r);
      else if (r < 0.2) asTree(K, "cypress", x, z, 1, r);
    }
  },
  {
    id: "hagia",
    label: "Hagia Sophia",
    title: "Hagia Sophia & the Ottoman domes",
    era: "Constantinople / Istanbul · 537, and Sinan's 16th century",
    blurb: "A dome floating on a ring of windows, cascades of half-domes, pencil minarets",
    palette: [14260088, 14723718, 13799276],
    ground: { hex: 12167565, side: 9206882 },
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.05);
      for (const u of asSlots(E.len, 0.0105)) {
        asArch(K, E, "matte", 15393743, u, 0.0135, 5.4e-3, 0.0105, 3e-4);
        asArch(K, E, "matte", 3812906, u, 0.013, 3.8e-3, 9e-3, 7e-4);
      }
      if (E.L > 0) asBand(K, E, "matte", 15392719, 0, 1.4e-3, 6e-4, 1.2e-3);
      if (E.L === 0) asBand(K, E, "matte", 13352100, 0, 3e-3, 8e-4, 1.8e-3);
    },
    roof(K, R) {
      const lead = 9410204;
      if (R.tower && R.h >= 4 && R.ins < 0.013) {
        // a pencil minaret: a slender fluted shaft, two balconies, a sharp lead cone
        asFlat(K, R, { hex: R.wall, parapet: 2e-3 });
        const b = R.cen.clone(), r = Math.min(R.ins * 0.5, 4.5e-3);
        K.cyl("satin", 15657696, b, b.clone().setY(b.y + 0.075), r, r * 0.85, 12);
        for (const y of [0.04, 0.062]) {
          K.cyl("satin", 15657696, b.clone().setY(b.y + y), b.clone().setY(b.y + y + 2e-3), r * 1.7, r * 1.7, 12);
          K.cyl("satin", 15657696, b.clone().setY(b.y + y - 2e-3), b.clone().setY(b.y + y), r * 0.9, r * 1.7, 12);
        }
        K.cyl("satin", lead, b.clone().setY(b.y + 0.075), b.clone().setY(b.y + 0.1), r * 1.05, 2e-4, 12);
        K.sphere("gold", 14265674, b.clone().setY(b.y + 0.101), 7e-4, 1.4e-3, 7e-4, 0);
      } else if (R.tower) {
        // the great dome: a drum pierced by a ring of windows, a shallow lead dome, a gilded crescent
        asFlat(K, R, { hex: R.wall, parapet: 2.5e-3 });
        const r = R.ins * 0.9, b = R.cen.clone();
        K.cyl("matte", R.wall, b, b.clone().setY(b.y + 6e-3), r * 1.02, r * 1.02, 24);
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * Math.PI * 2, n = new THREE6.Vector3(Math.cos(a), 0, Math.sin(a));
          K.box("matte", 3812906, b.clone().addScaledVector(n, r * 1.025).setY(b.y + 3.2e-3), new THREE6.Vector3(-n.z, 0, n.x), AS_UP, n, 1.4e-3, 3e-3, 6e-4);
        }
        K.lathe("satin", lead, b.clone().setY(b.y + 6e-3), "hemi", r, r * 0.6, 24, 0, 0.03, R.r);
        const top = b.clone().setY(b.y + 6e-3 + r * 0.6);
        K.cyl("gold", 14265674, top, top.clone().setY(top.y + 5e-3), 4e-4, 4e-4, 5);
        K.sphere("gold", 14265674, top.clone().setY(top.y + 5.5e-3), 1.2e-3, 1.2e-3, 4e-4, 0);
        // half-domes leaning on it from the lower neighbours' side
        R.n3.forEach((n, k) => {
          if (asHash(R.ci, k, 2) > 0.5) return;
          const m = R.v3[k].clone().lerp(R.v3[(k + 1) % 4], 0.5);
          K.lathe("satin", lead, m.clone().addScaledVector(n, -r * 0.05), "hemi", r * 0.45, r * 0.32, 12, 0, 0.03, R.r);
        });
      } else if (R.r < 0.45) {
        // small lead domes over the side halls
        asFlat(K, R, { hex: 13421994, parapet: 1.5e-3, phex: R.wall });
        const r = R.ins * 0.62;
        K.cyl("matte", R.wall, R.cen, R.cen.clone().setY(R.y + 2.5e-3), r, r, 14);
        K.lathe("satin", lead, R.cen.clone().setY(R.y + 2.5e-3), "hemi", r, r * 0.75, 14, 0, 0.03, R.r);
        K.sphere("gold", 14265674, R.cen.clone().setY(R.y + 2.5e-3 + r * 0.75 + 1e-3), 6e-4, 1.2e-3, 6e-4, 0);
      } else asFlat(K, R, { hex: 13421994, parapet: 1.5e-3, phex: R.wall });
    },
    prop(K, x, z, r) {
      if (r < 0.1) asTree(K, "cypress", x, z, 1.1, r);
      else if (r < 0.18) asTree(K, "round", x, z, 1, r, 6528847);
    }
  },
  {
    id: "islamic",
    label: "Islamic",
    title: "Islamic architecture",
    era: "Cairo, Isfahan, Granada · 8th–17th century",
    blurb: "Pointed arches, latticed bays, battlements, domes and minarets",
    palette: [14928802, 15722198, 14203275, 15986662],
    ground: { hex: 14270611, side: 11510123 },
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.05);
      const s = asSlots(E.len, 0.012);
      s.forEach((u, i) => {
        if (E.L === 0 && i === 0 && E.r < 0.45) {
          asPointed(K, E, "satin", 2850700, u, 0.011, 9.5e-3, 0.019, 5e-4);
          asPointed(K, E, "matte", 3021597, u, 0.01, 6.5e-3, 0.017, 9e-4);
        } else if (!E.top && E.L > 0 && i === 0 && E.r > 0.7) {
          // a mashrabiya bay
          asOn(K, E, "satin", 7228207, u, 0.015, 0.011, 0.017, 2.8e-3, 5.5e-3);
          asOn(K, E, "satin", 4597274, u, 0.015, 8e-3, 0.012, 5.7e-3, 6e-4);
        } else asPointed(K, E, "matte", 3021597, u, 0.012, 4.2e-3, 7e-3, 4e-4);
      });
      if (E.L === 0) asBand(K, E, "matte", 13416838, 0, 2.5e-3, 6e-4, 2e-3);
    },
    roof(K, R) {
      if (R.tower && R.h >= 4 && R.ins < 0.012) {
        // a minaret: shaft, balcony, a pointed cap and a crescent finial
        asFlat(K, R, { hex: R.wall, parapet: 3e-3 });
        const b = R.cen.clone(), r = R.ins * 0.55;
        K.cyl("matte", R.wall, b, b.clone().setY(b.y + 0.05), r, r * 0.85, 10);
        K.cyl("matte", 13416838, b.clone().setY(b.y + 0.034), b.clone().setY(b.y + 0.037), r * 1.6, r * 1.6, 12);
        K.lathe("satin", 2989974, b.clone().setY(b.y + 0.05), "pointed", r * 0.95, r * 1.2, 10);
        K.sphere("gold", 14265674, b.clone().setY(b.y + 0.05 + r * 1.75), 1e-3, 1e-3, 1e-3, 0);
      } else if (R.tower || R.r < 0.1) {
        asFlat(K, R, { hex: R.wall, parapet: 2e-3 });
        asDome(K, R, { hex: asPick([15986662, 3051670, 13214282], asHash(R.ci, 5)), kind: asHash(R.ci, 5) > 0.66 ? "gold" : "satin", profile: "pointed", scale: R.tower ? 0.85 : 0.6, drum: R.tower ? 7e-3 : 3e-3, finial: (K2, p) => K2.sphere("gold", 14265674, p.clone().setY(p.y + 1.5e-3), 1e-3, 2e-3, 1e-3, 0) });
      } else asFlat(K, R, { hex: R.wall, parapet: 2.5e-3, merlon: 2.2e-3 });
    },
    prop(K, x, z, r) {
      if (r < 0.2) asTree(K, "palm", x, z, 1, r);
      else if (r > 0.97) {
        K.cyl("satin", 2850700, new THREE6.Vector3(x, 0, z), new THREE6.Vector3(x, 2.5e-3, z), 7e-3, 7e-3, 12);
        K.cyl("glass", 6795194, new THREE6.Vector3(x, 2.5e-3, z), new THREE6.Vector3(x, 2.6e-3, z), 6e-3, 6e-3, 12);
      }
    }
  },
  {
    id: "forbidden",
    label: "Forbidden City",
    title: "The Forbidden City",
    era: "Beijing · Ming and Qing · from 1420",
    blurb: "Vermilion walls on white marble terraces, golden glazed roofs with upswept eaves",
    palette: [10627618, 10168352, 11219238],
    ground: { hex: 12432806, side: 8618612 },
    wall(K, E) {
      if (E.L === 0) {
        // a white marble terrace with its balustrade, the red wall set back above it
        asWall(K, E, "satin", 15263450, 0, 5e-3, 0, 0.02);
        asBand(K, E, "satin", 15921127, 5e-3, 1.2e-3, 2.6e-3, 2.4e-3, 3e-3);
        asWall(K, E, "matte", E.bh, 5e-3, AS_H, 0, 0.03);
      } else asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.03);
      // lattice doors and windows in gold-brown, framed by red columns
      for (const u of asSlots(E.len, 0.0105)) {
        const y = E.L === 0 ? 0.0165 : 0.0145, hh = E.L === 0 ? 0.017 : 0.011;
        asOn(K, E, "satin", 12093742, u, y, 7e-3, hh, 4e-4);
        for (const dy of [-0.3, 0, 0.3]) asOn(K, E, "satin", 7023127, u, y + dy * hh, 7e-3, 4e-4, 8e-4);
        asOn(K, E, "satin", 7023127, u, y, 4e-4, hh, 8e-4);
      }
      // painted brackets under the eaves: turquoise and blue
      if (E.top) {
        asBand(K, E, "satin", 2911850, AS_H - 3.6e-3, 2e-3, 8e-4, 1.6e-3);
        asBand(K, E, "satin", 2771852, AS_H - 1.6e-3, 1.6e-3, 1.6e-3, 2.4e-3);
      }
    },
    roof(K, R) {
      const gold = 14853418, ridge = 13209884;
      if (R.tower) asSkirt(K, R, R.y - AS_H * 0.42, 6e-3, gold);
      asPitched(K, R, {
        kind: "gloss", hex: gold, pitch: 0.72, over: 6e-3, up: 4.5e-3, hip: 0.32, ridge,
        // chiwen at the ridge ends
        end: (K2, p) => K2.box("gloss", ridge, p.clone().setY(p.y + 2.2e-3), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), 1.8e-3, 4.4e-3, 1.8e-3)
      });
    },
    prop(K, x, z, r) {
      if (r < 0.08) asTree(K, "pine", x, z, 1.1, r, 3364145);
      else if (r > 0.96) {
        // a great bronze vat
        K.cyl("satin", 5131302, new THREE6.Vector3(x, 0, z), new THREE6.Vector3(x, 6e-3, z), 4.5e-3, 5.5e-3, 12);
      }
    }
  },
  {
    id: "jiangnan",
    label: "Jiangnan",
    title: "Jiangnan · after Wu Guanzhong",
    era: "Water towns south of the Yangtze, as Wu Guanzhong painted them",
    blurb: "Planes of white wall, lines of black tile, a few dots of colour over still water",
    // one white for every wall and horse-head, lit evenly (wash): a face reads as one plane, as in the paintings
    palette: [16053999],
    kinds: { matte: "wash" },
    ground: { water: true, hex: 9348524, side: 4605510 },
    found: 6052956,
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0);
      // the dark line where the wall meets the water
      if (E.L === 0) asBand(K, E, "matte", 3816253, 0, 1.8e-3, 3e-4, 1e-3);
      // few openings, like ink dots: a black door on some ground floors, one small window on some faces
      const r = E.r;
      if (E.L === 0 && r < 0.2 && E.len > 0.012) asOn(K, E, "matte", 2236962, 0.28 + r * 2, 7.5e-3, 6e-3, 0.013, 4e-4);
      else if (r > 0.58 && E.len > 9e-3) asOn(K, E, "matte", 2763306, 0.22 + (r - 0.58) * 1.3, 0.018, 4.4e-3, 5e-3, 4e-4);
      // one black eave line under the roof
      if (E.top) asBand(K, E, "matte", 2828586, AS_H - 1e-3, 1e-3, 5e-4, 1.2e-3);
    },
    roof(K, R) {
      // every ridge in the town runs the same way: rows of black roofs, the order of the paintings
      asPitched(K, R, {
        kind: "matte", hex: 3092532, pitch: 0.62, over: 4e-3, up: 1.4e-3, ridge: 1907744, dir: AS_JIANGNAN_DIR, flush: true,
        // every gable end is a horse-head wall standing above the roof, which stops at it
        gable: (K2, p, q, apex) => asHorseHead(K2, p, q, apex, R)
      });
      // a red lantern here and there: the one warm note
      if (R.r < 0.05) {
        const k = R.join.indexOf(false);
        if (k >= 0) {
          const p = R.v3[k].clone().lerp(R.v3[(k + 1) % 4], 0.35).addScaledVector(R.n3[k], 3e-3);
          p.y -= 5e-3;
          K.sphere("glow", 13646377, p, 1.6e-3, 2e-3, 1.6e-3, 1);
        }
      }
    },
    prop(K, x, z, r) {
      if (r < 0.025) {
        // a narrow black boat
        const yaw = r * 250;
        K.ybox("matte", 2236962, x, -2.5e-3, z, 0.017, 1.6e-3, 3.4e-3, yaw);
        K.ybox("matte", 1710618, x, 0, z, 6e-3, 2.4e-3, 3.2e-3, yaw);
      } else if (r > 0.93) {
        // a willow leaning over the water: a few hanging strokes
        const top = new THREE6.Vector3(x, 0.015, z);
        K.cyl("matte", 3815994, new THREE6.Vector3(x, -3e-3, z), top, 9e-4, 6e-4, 5);
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * Math.PI * 2 + r * 9, p = top.clone().add(new THREE6.Vector3(Math.cos(a) * 4.5e-3, 1e-3, Math.sin(a) * 4.5e-3));
          K.cyl("matte", 8826993, p, p.clone().add(new THREE6.Vector3(Math.cos(a) * 1.5e-3, -0.012, Math.sin(a) * 1.5e-3)), 9e-4, 3e-4, 4);
        }
      }
    }
  },
  {
    id: "kyoto",
    label: "Kyoto",
    title: "Kyoto temples",
    era: "Japan · Kiyomizu-dera (1633) and the five-storey pagodas",
    blurb: "Vermilion posts and beams, white plaster, deep dark eaves; pagodas of five roofs",
    palette: [15724519, 15590633],
    ground: { hex: 8362845, side: 6044214 },
    wall(K, E) {
      const red = 12729890;
      asWall(K, E, "matte", E.bh, 0, AS_H, -1.2e-3, 0.02);
      if (E.L === 0) asBand(K, E, "matte", 9079431, 0, 2.6e-3, 6e-4, 1.6e-3, 1e-3);
      // the vermilion frame: posts at the bays, a tie beam halfway, a head beam under the eaves
      const bays = Math.max(1, Math.round(E.len / 0.011));
      for (let i = 0; i <= bays; i++) asOn(K, E, "satin", red, i / bays, AS_H / 2, 1.6e-3, AS_H, 6e-4, 1.6e-3);
      asBand(K, E, "satin", red, AS_H * 0.55, 1.4e-3, 5e-4, 1.4e-3);
      asBand(K, E, "satin", red, AS_H - 2.4e-3, 2.4e-3, 6e-4, 1.6e-3);
      // lattice shoji in some bays
      for (let i = 0; i < bays; i++) if (asHash(E.ci, E.k, E.L, i) < 0.4) {
        const u = (i + 0.5) / bays;
        asOn(K, E, "satin", 3815994, u, AS_H * 0.3, E.len / bays * 0.7, AS_H * 0.36, 3e-4, 8e-4);
      }
    },
    roof(K, R) {
      const tile = 3880754;
      if (R.tower) {
        // a five-storey pagoda: five deep roofs, each over a smaller vermilion storey, and the bronze sorin
        asFlat(K, R, { hex: tile });
        const b = R.cen.clone(), r0 = R.ins * 0.62;
        let y = b.y;
        for (let i = 0; i < 5; i++) {
          const r = r0 * (1 - i * 0.1), hh = 6.2e-3;
          K.cyl("satin", 12729890, b.clone().setY(y), b.clone().setY(y + hh), r * 0.62, r * 0.6, 4);
          K.cyl("matte", tile, b.clone().setY(y + hh), b.clone().setY(y + hh + 2.4e-3), r * 1.25, r * 0.55, 4);
          y += hh + 2.4e-3;
        }
        K.cyl("gold", 9135158, b.clone().setY(y), b.clone().setY(y + 0.016), 6e-4, 4e-4, 6);
        for (let i = 0; i < 5; i++) K.cyl("gold", 9135158, b.clone().setY(y + 3e-3 + i * 2e-3), b.clone().setY(y + 3.6e-3 + i * 2e-3), 1.4e-3, 1.4e-3, 8);
        return;
      }
      // irimoya: a hipped roof with deep, gently lifted eaves
      asPitched(K, R, { kind: "matte", hex: tile, pitch: 0.62, over: 7e-3, up: 3e-3, hip: 0.42, ridge: 2238238 });
    },
    prop(K, x, z, r) {
      // maples in autumn red, and pines
      if (r < 0.1) asTree(K, "round", x, z, 0.95, r, asPick([12597547, 14049837, 11481638], r * 10));
      else if (r < 0.16) asTree(K, "pine", x, z, 1, r, 3364145);
      else if (r > 0.97) {
        // a stone lantern
        K.cyl("matte", 9079431, new THREE6.Vector3(x, 0, z), new THREE6.Vector3(x, 6e-3, z), 1e-3, 1e-3, 6);
        K.ybox("matte", 9079431, x, 7e-3, z, 3.4e-3, 2.4e-3, 3.4e-3, r * 9);
        K.cyl("matte", 9079431, new THREE6.Vector3(x, 8.2e-3, z), new THREE6.Vector3(x, 0.0105, z), 3e-3, 2e-4, 6);
      }
    }
  },
  {
    id: "kremlin",
    label: "Kremlin",
    title: "Kremlin & St Basil's",
    era: "Moscow · 15th–17th century",
    blurb: "Red brick towers under green tents and ruby stars; St Basil's spiral onion domes",
    palette: [10893869, 11550767, 10893869, 15325380, 14267996],
    ground: { hex: 13617341, side: 9208953 },
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.05);
      const brick = E.bh === 10893869 || E.bh === 11550767, trim = 16316664;
      for (const u of [0.015, 0.985]) asOn(K, E, "matte", trim, u, AS_H / 2, 2.2e-3, AS_H, 6e-4, 1.2e-3);
      if (E.L > 0) asBand(K, E, "matte", trim, 0, 1.6e-3, 7e-4, 1.4e-3);
      for (const u of asSlots(E.len, brick ? 0.014 : 0.012)) {
        if (brick) {
          // narrow white-framed arched windows
          asArch(K, E, "matte", trim, u, 0.013, 4.6e-3, 8e-3, 5e-4);
          asArch(K, E, "matte", 2766654, u, 0.0128, 2.8e-3, 6.6e-3, 8e-4);
        } else {
          // a church: kokoshnik arches crown each window
          asOn(K, E, "matte", trim, u, 0.013, 7e-3, 0.0105, 5e-4, 1e-3);
          asOn(K, E, "matte", 2766654, u, 0.0125, 4.6e-3, 7.6e-3, 9e-4, 1e-3);
          const c = asAt(E, u, 0.0185, 5e-4);
          K.cyl("matte", trim, c.clone().addScaledVector(E.n3, -5e-4), c.clone().addScaledVector(E.n3, 5e-4), 3.5e-3, 3.5e-3, 10);
        }
      }
    },
    roof(K, R) {
      const brick = R.wall === 10893869 || R.wall === 11550767;
      if (!R.tower) {
        // the Kremlin wall: swallow-tail merlons; houses: green iron roofs
        if (brick && R.h <= 2) return asFlat(K, R, { hex: 9132587, parapet: 2e-3, merlon: 2.4e-3, phex: R.wall });
        return asPitched(K, R, { kind: "satin", hex: 3965520, pitch: 0.75, over: 3e-3, hip: 0.6 });
      }
      asFlat(K, R, { hex: R.wall });
      const b = R.cen.clone(), r = R.ins * 0.85;
      if (brick) {
        // a Kremlin tower: a white-trimmed tier, a green tent, a ruby star
        K.cyl("matte", R.wall, b, b.clone().setY(b.y + 0.012), r * 1.08, r * 0.95, 4);
        K.cyl("matte", 16316664, b.clone().setY(b.y + 0.012), b.clone().setY(b.y + 0.0135), r * 1.0, r * 1.0, 4);
        K.cyl("matte", R.wall, b.clone().setY(b.y + 0.0135), b.clone().setY(b.y + 0.021), r * 0.7, r * 0.7, 8);
        K.cyl("satin", 3036246, b.clone().setY(b.y + 0.021), b.clone().setY(b.y + 0.055), r * 0.85, r * 0.04, 8);
        K.sphere("glow", 14164012, b.clone().setY(b.y + 0.059), 2.6e-3, 3.2e-3, 1e-3, 0);
        K.sphere("gold", 14265674, b.clone().setY(b.y + 0.059), 3e-3, 3.6e-3, 6e-4, 0);
        return;
      }
      // St Basil's: a tall drum and a spiral-striped onion, with small onions at the corners
      const pairs = [[13182515, 3638857], [2717596, 15921906], [15312951, 3707706], [14248763, 1739130], [12464194, 15919814]];
      const [c1, c2] = pairs[Math.floor(asHash(R.ci, 4) * pairs.length)];
      K.cyl("matte", R.wall, b, b.clone().setY(b.y + 0.016), r * 0.62, r * 0.6, 12);
      const top = asOnion(K, b.clone().setY(b.y + 0.016), r * 0.62, r * 0.75, c1, c2, 1.2 + asHash(R.ci, 8));
      asCross(K, top);
      R.v3.forEach((p, k) => {
        if (asHash(R.ci, k, 31) > 0.55) return;
        const q = p.clone().lerp(R.cen, 0.32), [d1, d2] = pairs[Math.floor(asHash(R.ci, k, 5) * pairs.length)];
        K.cyl("matte", R.wall, q, q.clone().setY(q.y + 7e-3), r * 0.2, r * 0.2, 8);
        asCross(K, asOnion(K, q.clone().setY(q.y + 7e-3), r * 0.22, r * 0.3, d1, d2, 1.5));
      });
    },
    prop(K, x, z, r) {
      if (r < 0.12) asTree(K, "fir", x, z, 1, r);
      else if (r < 0.2) asTree(K, "birch", x, z, 1, r, 10203226);
    }
  },
  {
    id: "thai",
    label: "Thai temple",
    title: "Thai temples",
    era: "Ayutthaya to Bangkok · 14th–19th century · Wat Phra Kaew, Wat Arun",
    blurb: "White walls trimmed in gold, steep tiered roofs with chofa horns, golden chedis",
    palette: [16184300, 15988964],
    ground: { hex: 14208436, side: 10129002 },
    wall(K, E) {
      const gold = 14268984;
      asWall(K, E, "satin", E.bh, 0, AS_H, 0, 0.015);
      if (E.L === 0) asBand(K, E, "gloss", gold, 0, 2.2e-3, 6e-4, 1.4e-3);
      asBand(K, E, "gloss", gold, AS_H - 2e-3, 2e-3, 7e-4, 1.6e-3);
      for (const u of [0.02, 0.98]) asOn(K, E, "gloss", gold, u, AS_H / 2, 1.8e-3, AS_H, 7e-4, 1.4e-3);
      // tall doors and windows: deep red leaves in gold frames under pointed gold crowns
      for (const u of asSlots(E.len, 0.012)) {
        const hh = E.L === 0 ? 0.017 : 0.012, y = E.L === 0 ? 0.0105 : 0.014;
        asOn(K, E, "gloss", gold, u, y, 6.4e-3, hh + 1.6e-3, 4e-4, 1e-3);
        asOn(K, E, "satin", 9051930, u, y, 4.4e-3, hh, 8e-4, 1e-3);
        asPointed(K, E, "gloss", gold, u, y + hh / 2 + 1.4e-3, 3e-3, 1e-3, 6e-4);
      }
    },
    roof(K, R) {
      const gold = 14268984, tile = 13194028, edge = 3054152;
      if (R.tower) {
        // a golden chedi: stacked rings, the bell, a slender spire
        asFlat(K, R, { hex: gold, parapet: 1.6e-3, phex: R.wall });
        const b = R.cen.clone(), r = R.ins * 0.8;
        for (let i = 0; i < 3; i++) K.cyl("gloss", gold, b.clone().setY(b.y + i * 2.4e-3), b.clone().setY(b.y + (i + 1) * 2.4e-3), r * (1 - i * 0.12), r * (1 - i * 0.12), 16);
        K.lathe("gold", gold, b.clone().setY(b.y + 7.2e-3), "bell", r * 0.75, r * 1.1, 16, 0, 0, R.r);
        K.cyl("gold", gold, b.clone().setY(b.y + 7.2e-3 + r * 1.0), b.clone().setY(b.y + 7.2e-3 + r * 1.0 + 0.034), r * 0.16, 2e-4, 10);
        for (let i = 0; i < 6; i++) K.cyl("gold", gold, b.clone().setY(b.y + 7.2e-3 + r + i * 2.6e-3), b.clone().setY(b.y + 7.2e-3 + r + i * 2.6e-3 + 8e-4), r * 0.16 * (1 - i / 7) + 4e-4, r * 0.16 * (1 - i / 7) + 4e-4, 8);
        return;
      }
      // two tiers: a lower skirt, then the steep main roof with green-edged orange tiles, gold ridges, chofa
      asSkirt(K, R, R.y - AS_H * 0.3, 5e-3, tile);
      asPitched(K, R, {
        kind: "gloss", hex: tile, pitch: 1.05, over: 4e-3, up: 3e-3, hip: 0.15, ridge: gold,
        gable: (K2, p, q, apex) => K2.tri("gloss", gold, p, q, apex),
        end: (K2, p) => {
          // the chofa: a slender golden horn curling up from the gable peak
          K2.cyl("gold", gold, p, p.clone().add(new THREE6.Vector3(0, 6e-3, 0)), 7e-4, 5e-4, 5);
          K2.sphere("gold", gold, p.clone().add(new THREE6.Vector3(0, 6.4e-3, 0)), 9e-4, 1.2e-3, 9e-4, 0);
        }
      });
      // a green line along the eaves
      R.n3.forEach((n, k) => {
        if (R.join[k]) return;
        const a = R.v3[k].clone().addScaledVector(n, 4e-3), b = R.v3[(k + 1) % 4].clone().addScaledVector(n, 4e-3);
        K.cyl("satin", edge, a.setY(a.y + 4e-4), b.setY(b.y + 4e-4), 6e-4, 6e-4, 4);
      });
    },
    prop(K, x, z, r) {
      if (r < 0.12) asTree(K, "palm", x, z, 1, r);
      else if (r > 0.96) {
        // a small golden stupa
        K.cyl("gloss", 14268984, new THREE6.Vector3(x, 0, z), new THREE6.Vector3(x, 2e-3, z), 3e-3, 3e-3, 10);
        K.lathe("gold", 14268984, new THREE6.Vector3(x, 2e-3, z), "bell", 2.4e-3, 5e-3, 10);
      }
    }
  },
  {
    id: "prussian",
    label: "Prussian",
    title: "Prussian Brick Gothic",
    era: "Baltic Hanseatic towns to Berlin · 13th–19th century",
    blurb: "Red brick, white blind niches, stepped gables and copper-green spires",
    palette: [10766383, 9058088, 11161654],
    ground: { hex: 10131343, side: 7039851 },
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.06);
      if (E.L > 0) asBand(K, E, "matte", 15328980, 0, 1.6e-3, 5e-4, 1.2e-3);
      for (const u of asSlots(E.len, 0.0105)) {
        asPointed(K, E, "matte", 15328980, u, 0.0135, 6e-3, 0.0145, 4e-4);
        asPointed(K, E, "satin", 2370856, u, 0.013, 3.8e-3, 0.0125, 8e-4);
      }
      if (E.top && E.tower) {
        const c = asAt(E, 0.5, 0.022, 1.5e-3);
        K.cyl("satin", 15988457, c.clone().addScaledVector(E.n3, -8e-4), c, 4e-3, 4e-3, 14);
        K.box("satin", 2236962, c.clone().addScaledVector(E.n3, 2e-4).setY(c.y + 1.2e-3), E.t3, AS_UP, E.n3, 4e-4, 2.6e-3, 3e-4);
      }
    },
    roof(K, R) {
      const tile = asHash(R.ci, 6) < 0.5 ? 4146248 : 9321516;
      if (R.tower) {
        asFlat(K, R, { hex: R.wall, parapet: 3e-3, merlon: 2e-3 });
        const b = R.cen.clone(), r = R.ins * 0.92;
        K.cyl("satin", 6988687, b, b.clone().setY(b.y + 0.06), r, r * 0.04, 8);
        K.sphere("gold", 14265674, b.clone().setY(b.y + 0.061), 1.4e-3, 1.4e-3, 1.4e-3, 0);
        return;
      }
      asPitched(K, R, {
        kind: "matte", hex: tile, pitch: 1.15, over: 2.5e-3, gable: (K2, p, q, apex) => {
          // a stepped gable with white blind niches
          const t = q.clone().sub(p), len = t.length(), n = new THREE6.Vector3(t.z, 0, -t.x).normalize();
          t.normalize();
          const H0 = apex.y - p.y, steps = 5;
          for (let i = 0; i < steps; i++) {
            const u = (i + 0.5) / steps, hgt = H0 * (1 - Math.abs(2 * u - 1)) + H0 * 0.18 + 2e-3;
            const c = p.clone().addScaledVector(t, u * len).addScaledVector(n, -1.2e-3);
            c.y = p.y + hgt / 2;
            K2.box("matte", R.wall, c, t, AS_UP, n, len / steps + 2e-4, hgt, 2.4e-3, 0.05, R.r);
            K2.box("matte", 15328980, c.clone().addScaledVector(n, 1.2e-3).setY(p.y + hgt * 0.45), t, AS_UP, n, len / steps * 0.4, hgt * 0.5, 4e-4);
          }
        }
      });
    },
    prop(K, x, z, r) {
      if (r < 0.14) asTree(K, "round", x, z, 1.1, r, 6127429);
      else if (r > 0.95) {
        K.cyl("satin", 2236962, new THREE6.Vector3(x, 0, z), new THREE6.Vector3(x, 0.016, z), 4e-4, 4e-4, 5);
        K.sphere("glow", 16771508, new THREE6.Vector3(x, 0.017, z), 1.3e-3, 1.6e-3, 1.3e-3, 0);
      }
    }
  },
  {
    id: "gaudi",
    label: "Gaudí",
    title: "Antoni Gaudí",
    era: "Modernisme · Barcelona · 1880s–1926",
    blurb: "Walls that ripple like the sea, broken-tile mosaic, bone balconies, the spires of the Sagrada Família",
    palette: [14469539, 14074266, 14864048],
    ground: { hex: 13219990, side: 9271900 },
    tess: [2, 2],
    smooth: ["satin"],
    warp(p) {
      const s = Math.min(1, Math.max(0, p.y) / 0.03);
      p.x += s * 2.6e-3 * Math.sin(p.y * 95 + p.z * 46);
      p.z += s * 2.6e-3 * Math.cos(p.y * 85 + p.x * 48);
    },
    wall(K, E) {
      asWall(K, E, "satin", E.bh, 0, AS_H, 0, 0.05);
      for (const u of asSlots(E.len, 0.012)) {
        // oval windows with bone-white balcony masks
        asArch(K, E, "matte", 2895401, u, 0.014, 5e-3, 9e-3, 6e-4);
        if (E.L > 0) asOn(K, E, "matte", 15921392, u, 0.0085, 7e-3, 2.2e-3, 2.4e-3, 2.6e-3);
      }
      // a crown of broken-tile mosaic
      if (E.top) {
        const n = Math.max(2, Math.round(E.len / 3.4e-3));
        for (let i = 0; i < n; i++) asOn(K, E, "gloss", asPick(AS_TRENCADIS, asHash(E.ci, E.k, i)), (i + 0.5) / n, AS_H - 1.6e-3, E.len / n * 0.92, 3e-3, 1.2e-3, 1.6e-3);
      }
    },
    roof(K, R) {
      if (R.tower) {
        // a Sagrada Família spire: a tall bullet of stone, pierced, crowned with a mosaic finial
        const b = R.cen.clone(), r = R.ins * 0.75, H = 0.05 + R.h * 4e-3;
        asFlat(K, R, { hex: R.wall });
        K.lathe("matte", 13087878, b, "spire", r, H, 14, 0, 0.04, R.r);
        for (let i = 0; i < 6; i++) K.sphere("matte", 4210752, b.clone().add(new THREE6.Vector3(Math.cos(i * 1.05) * r * 0.86, H * 0.22 + i * H * 0.08, Math.sin(i * 1.05) * r * 0.86)), 6e-4, 1.2e-3, 6e-4, 0);
        const top = b.clone().setY(b.y + H);
        for (let i = 0; i < 4; i++) K.sphere("gloss", asPick(AS_TRENCADIS, asHash(R.ci, i)), top.clone().add(new THREE6.Vector3(Math.cos(i * 1.57) * 1.6e-3, 1.4e-3 + (i % 2) * 1e-3, Math.sin(i * 1.57) * 1.6e-3)), 1.5e-3, 1.5e-3, 1.5e-3, 1);
        return;
      }
      // Casa Batllo's dragon roof: scaled tiles shading from green to blue to orange, a spine of mosaic balls
      const hex = asPick([4165498, 5940075, 3830964, 13794126], asHash(R.ci, 3));
      const { R0, R2 } = asPitched(K, R, { kind: "gloss", hex, pitch: 0.95, over: 2.5e-3, hip: 0.75, up: 2e-3 });
      for (let i = 0; i <= 3; i++) K.sphere("gloss", asPick(AS_TRENCADIS, asHash(R.ci, i, 9)), R0.clone().lerp(R2, i / 3), 1.4e-3, 1.4e-3, 1.4e-3, 1);
      if (R.r < 0.25) {
        // a Casa Mila chimney warrior
        const p = R.v3[0].clone().lerp(R.cen, 0.45);
        K.cyl("matte", 15987699, p, p.clone().setY(p.y + 0.012), 1.8e-3, 1.1e-3, 8);
        K.sphere("gloss", asPick(AS_TRENCADIS, R.r * 7), p.clone().setY(p.y + 0.013), 2.2e-3, 1.4e-3, 2.2e-3, 1);
      }
    },
    prop(K, x, z, r) {
      if (r < 0.12) asTree(K, "palm", x, z, 1, r);
      else if (r > 0.95) {
        // a serpentine mosaic bench (Park Guell)
        for (let i = 0; i < 6; i++) K.ybox("gloss", asPick(AS_TRENCADIS, asHash(i, r * 1e4)), x + Math.cos(i * 0.6) * 6e-3, 2e-3, z + Math.sin(i * 0.9) * 3e-3, 2.4e-3, 4e-3, 1.6e-3, i * 0.5);
      }
    }
  },
  {
    id: "wright",
    label: "Wright",
    title: "Frank Lloyd Wright",
    era: "Organic architecture · USA · 1900s–1950s · Fallingwater",
    blurb: "Stacked stone and cream terraces cantilevered over the water, long horizontals in Cherokee red",
    palette: [10257510, 9402203, 10849388],
    ground: { water: true, hex: 5073758, side: 6115392 },
    found: 8220760,
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.22);
      // ledgestone courses
      for (const y of [0.007, 0.0145, 0.022]) asBand(K, E, "matte", 7364681, y, 7e-4, 2e-4, 6e-4);
      if (E.r < 0.7) {
        // a ribbon of windows with Cherokee-red mullions
        asBand(K, E, "glass", 2767414, 0.011, 9e-3, 3e-4, 6e-4);
        for (const u of asSlots(E.len, 5e-3, 0.2)) asOn(K, E, "satin", 10893867, u, 0.0155, 6e-4, 9e-3, 6e-4, 8e-4);
      }
      // the terrace: a cream slab cantilevered out past the wall and its corners
      if (E.r < 0.55 || E.top) asBand(K, E, "satin", 15260863, AS_H - 2.2e-3, 2.2e-3, 5e-3, 0.012, 0.012 + E.r * 0.01);
    },
    roof(K, R) {
      asFlat(K, R, { kind: "satin", hex: 15260863 });
      // a thin roof plane with a deep overhang
      const k = 7e-3, pts = R.v3.map((p, i) => p.clone().addScaledVector(R.n3[i], R.join[i] ? 0 : k).addScaledVector(R.n3[(i + 3) % 4], R.join[(i + 3) % 4] ? 0 : k).setY(R.y + 2.2e-3));
      K.poly("satin", 15260863, pts, 0.02, R.r);
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % 4];
        K.quad("satin", 13945246, p, q, q.clone().setY(R.y), p.clone().setY(R.y));
      });
      if (R.tower) {
        // the stone chimney core
        const b = R.cen;
        K.ybox("matte", R.wall, b.x, R.y + 0.012, b.z, R.ins * 0.9, 0.024, R.ins * 0.9, 0, 0.2, R.r);
        K.ybox("matte", 7364681, b.x, R.y + 0.0245, b.z, R.ins * 1.0, 1.2e-3, R.ins * 1.0, 0, 0.1, R.r);
      }
    },
    prop(K, x, z, r) {
      if (r < 0.06) K.ybox("matte", 8220760, x, -1e-3, z, 9e-3, 5e-3, 7e-3, r * 70, 0.2, r);
      else if (r > 0.94) asTree(K, "round", x, z, 1.2, r, 4741424);
    }
  },
  {
    id: "corbusier",
    label: "Le Corbusier",
    title: "Le Corbusier",
    era: "Modernism · 1920s–1960s · Villa Savoye, Unité d'Habitation",
    blurb: "Pilotis, ribbon windows, a free façade and a roof garden: the five points of a new architecture",
    palette: [15921386, 15658979],
    ground: { hex: 9414762, side: 7038040 },
    wall(K, E) {
      if (E.L === 0 && E.h >= 2) {
        // pilotis: the ground floor drawn back in dark green glass, the box above standing on white columns
        asWall(K, E, "satin", 4086346, 0, AS_H - 1.6e-3, -5e-3);
        const [a, b] = asInset(E, 5e-3);
        K.quad("satin", E.bh, a.setY(E.y0 + AS_H - 1.6e-3), b.setY(E.y0 + AS_H - 1.6e-3), E.b3.clone().setY(E.y0 + AS_H - 1.6e-3), E.a3.clone().setY(E.y0 + AS_H - 1.6e-3));
        asWall(K, E, "satin", E.bh, AS_H - 1.6e-3, AS_H);
        for (const u of asSlots(E.len, 0.011, 0.3)) {
          const p = asAt(E, u, 0, -1.4e-3);
          K.cyl("satin", 16316664, p, p.clone().setY(E.y0 + AS_H - 1.6e-3), 9e-4, 9e-4, 8);
        }
        return;
      }
      asWall(K, E, "satin", E.bh, 0, AS_H, 0, 0.02);
      if (E.r < 0.25 && E.L > 0) {
        // Unite d'Habitation: loggias painted red, yellow, blue, green
        for (const u of asSlots(E.len, 5.5e-3, 0.3)) {
          asOn(K, E, "matte", 3289650, u, 0.015, 4.8e-3, 0.024, 3e-4, 6e-4);
          asOn(K, E, "matte", asPick([13121325, 15778841, 2841256, 5937755], asHash(E.ci, E.k, E.L, u * 99)), u, 0.012, 3e-3, 0.016, 6e-4, 6e-4);
        }
        return;
      }
      // the ribbon window, the whole length of the façade
      asBand(K, E, "glass", 3160124, 0.012, 7.5e-3, 3e-4, 6e-4, -1e-3);
      for (const u of asSlots(E.len, 6e-3, 0.2)) asOn(K, E, "satin", 16316664, u - 0.5 / Math.max(1, Math.round(E.len / 6e-3)), 0.0157, 5e-4, 7.5e-3, 5e-4, 6e-4);
    },
    roof(K, R) {
      asFlat(K, R, { kind: "satin", hex: 15132378, parapet: 2.4e-3, phex: 15921386 });
      if (R.tower || R.r < 0.14) {
        // the roof garden's curved solarium screen
        const c = R.cen, rr = R.ins * 0.62, a0 = R.r * 40;
        for (let i = 0; i < 9; i++) {
          const a = a0 + i / 9 * Math.PI * 1.15, p = new THREE6.Vector3(c.x + Math.cos(a) * rr, R.y + 5e-3, c.z + Math.sin(a) * rr);
          K.ybox("satin", 15921386, p.x, p.y, p.z, rr * 0.38, 0.01, 8e-4, -a + Math.PI / 2);
        }
        K.ybox("matte", 6066258, c.x, R.y + 1e-3, c.z, R.ins * 0.5, 2e-3, R.ins * 0.5, 0.3);
      } else if (R.r > 0.85) K.poly("matte", 6066258, R.v3.map((p) => p.clone().lerp(R.cen, 0.25).setY(R.y + 6e-4)));
    },
    prop(K, x, z, r) {
      if (r < 0.14) asTree(K, "round", x, z, 1, r, 5212978);
    }
  },
  {
    id: "meier",
    label: "Meier",
    title: "Richard Meier · the New York Five",
    era: "Late modernism · 1960s–1990s · Getty Center",
    blurb: "Porcelain-white panel grids, glass curtain walls, ramps of light and pergolas",
    palette: [16250867, 15790318],
    ground: { hex: 10272628, side: 7376474 },
    wall(K, E) {
      if (E.r < 0.32) {
        asWall(K, E, "glass", 8361892, 0, AS_H);
        for (const u of asSlots(E.len, 7e-3, 0.2)) asOn(K, E, "satin", 16777215, u - 0.5 / Math.max(1, Math.round(E.len / 7e-3)), AS_H / 2, 7e-4, AS_H, 6e-4, 1e-3);
        asBand(K, E, "satin", 16777215, AS_H / 2, 7e-4, 6e-4, 1e-3);
      } else {
        asWall(K, E, "satin", E.bh, 0, AS_H, 0, 0.02);
        for (const u of asSlots(E.len, 9e-3, 0.2)) asOn(K, E, "satin", 13421772, u - 0.5 / Math.max(1, Math.round(E.len / 9e-3)), AS_H / 2, 3e-4, AS_H, 2e-4, 4e-4);
        asBand(K, E, "satin", 13421772, AS_H * 0.5, 3e-4, 2e-4, 4e-4);
        if (E.r > 0.62) asBand(K, E, "glass", 5269596, 0.012, 7e-3, 3e-4, 6e-4);
      }
      asBand(K, E, "satin", 16777215, AS_H - 1.4e-3, 1.4e-3, 8e-4, 1.6e-3, 1e-3);
    },
    roof(K, R) {
      asFlat(K, R, { kind: "satin", hex: 15132390, rail: 6e-3 });
      if (R.tower || R.r < 0.12) {
        // a pergola grid floating over the roof
        const y = R.y + 0.011, c = R.cen, s = R.ins * 2.6;
        for (const p of R.v3) K.box("satin", 16777215, p.clone().lerp(c, 0.15).setY(R.y + 5.5e-3), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), 8e-4, 0.011, 8e-4);
        for (let i = -2; i <= 2; i++) {
          K.box("satin", 16777215, c.clone().setY(y).add(new THREE6.Vector3(i * s / 5, 0, 0)), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), 6e-4, 8e-4, s);
          K.box("satin", 16777215, c.clone().setY(y).add(new THREE6.Vector3(0, 0, i * s / 5)), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), s, 8e-4, 6e-4);
        }
      }
    },
    prop(K, x, z, r) {
      if (r < 0.1) asTree(K, "round", x, z, 0.9, r, 7314507);
      else if (r < 0.3) K.poly("ground", 15592941, [-1, 1, 1, -1].map((s, i) => new THREE6.Vector3(x + s * 5e-3, 3e-4, z + (i < 2 ? -5e-3 : 5e-3))));
    }
  },
  {
    id: "ando",
    label: "Ando",
    title: "Tadao Ando",
    era: "Japan · 1980s–today · Church of the Light",
    blurb: "Fair-faced concrete with tie holes, slits of light, still water",
    palette: [11119012, 10724261],
    ground: { water: true, hex: 5201251, side: 9211020 },
    found: 10132377,
    wall(K, E) {
      asWall(K, E, "satin", E.bh, 0, AS_H, 0, 0.05);
      // formwork joints and tie holes
      asBand(K, E, "satin", 9408655, AS_H / 2, 3e-4, 1e-4, 3e-4);
      for (const y of [AS_H * 0.25, AS_H * 0.75]) for (const u of asSlots(E.len, 6e-3, 0.4)) asOn(K, E, "matte", 5592405, u, y, 9e-4, 9e-4, 1e-4, 3e-4);
      if (E.tower && E.top && E.k % 2 === 0) {
        // the cross of light
        asOn(K, E, "glow", 16775408, 0.5, AS_H / 2, 1.4e-3, 0.024, 3e-4, 6e-4);
        asOn(K, E, "glow", 16775408, 0.5, AS_H * 0.62, 0.014, 1.4e-3, 3e-4, 6e-4);
      } else if (E.r < 0.22) asOn(K, E, "glass", 2830391, 0.12, AS_H / 2, 1.6e-3, AS_H, 3e-4, 6e-4);
      else if (E.r > 0.8) asBand(K, E, "glass", 2830391, 0.019, 1.8e-3, 3e-4, 6e-4);
    },
    roof(K, R) {
      asFlat(K, R, { kind: "satin", hex: 10724261 });
    },
    prop(K, x, z, r) {
      if (r < 0.06) K.ybox("satin", 10132377, x, -2.5e-3, z, 9e-3, 2e-3, 9e-3, r * 50);
    }
  },
  {
    id: "pei",
    label: "I. M. Pei",
    title: "I. M. Pei",
    era: "1960s–2006 · Louvre Pyramid, Bank of China Tower, Suzhou Museum",
    blurb: "Pure geometry: white walls edged in grey granite, glass pyramids, a tower of triangles",
    palette: [16119023, 15790824],
    ground: { hex: 14276300, side: 9078656 },
    wall(K, E) {
      const granite = 5198679;
      if (E.tower && E.h >= 4 && E.L >= 1) {
        // Bank of China: glass faces crossed by white diagonals, an X every two storeys
        asWall(K, E, "glass", 6257811, 0, AS_H);
        const a = asAt(E, 0, E.y0 - E.a3.y + (E.L % 2 ? AS_H : 0), 6e-4), b = asAt(E, 1, E.y0 - E.a3.y + (E.L % 2 ? 0 : AS_H), 6e-4);
        const d = b.clone().sub(a), len = d.length();
        d.divideScalar(len);
        K.box("satin", 16250871, a.clone().lerp(b, 0.5), d, new THREE6.Vector3().crossVectors(E.n3, d), E.n3, len, 1.2e-3, 1e-3);
        if (E.L % 2 === 0) asBand(K, E, "satin", 16250871, 0, 1e-3, 6e-4, 1e-3);
        return;
      }
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.01);
      // grey granite lines: the cornice and the corners, as if drawn in ink
      if (E.top) asBand(K, E, "satin", granite, AS_H - 1.6e-3, 1.6e-3, 5e-4, 1.2e-3);
      for (const u of [0.01, 0.99]) if (E.r > 0.4) asOn(K, E, "satin", granite, u, AS_H / 2, 1.2e-3, AS_H, 5e-4, 1e-3);
      if (E.r < 0.3) {
        // a square window in a granite frame
        asOn(K, E, "satin", granite, 0.5, 0.015, 0.012, 0.012, 5e-4, 1e-3);
        asOn(K, E, "glass", 3292226, 0.5, 0.015, 0.0095, 0.0095, 9e-4, 1e-3);
      } else if (E.r > 0.75) asBand(K, E, "glass", 3292226, 0.02, 2.4e-3, 3e-4, 6e-4, -4e-3);
    },
    roof(K, R) {
      const granite = 5198679;
      if (R.tower && R.h >= 4) {
        // the tower's sloped glass crown
        asFlat(K, R, { hex: granite });
        asPyramid(K, R, "glass", 6257811, R.ins * 2.4, 16250871);
      } else if (R.tower || R.r < 0.16) {
        // a glass pyramid skylight on a granite roof
        asFlat(K, R, { kind: "satin", hex: granite });
        asPyramid(K, R, "glass", 9418441, R.ins * 1.3, 13421772);
      } else {
        // Suzhou Museum: geometric grey roof planes with plain white gables
        asPitched(K, R, { kind: "satin", hex: granite, pitch: 0.58, over: 1.2e-3, hip: 0, ridge: 4211274, dir: AS_JIANGNAN_DIR, gable: (K2, p, q, apex) => K2.tri("matte", R.wall, p, q, apex) });
      }
    },
    prop(K, x, z, r) {
      if (r < 0.08) {
        // Suzhou rock slices: thin grey slabs against the white walls
        for (let i = 0; i < 3; i++) K.ybox("satin", 8421246, x + (i - 1) * 3.5e-3, 3e-3 + i * 2e-3, z, 2.4e-3, 6e-3 + i * 4e-3, 1e-3, 0.2 + r * 9, 0.2, asHash(i, r * 1e4));
      } else if (r > 0.94) asTree(K, "round", x, z, 0.8, r, 5998133);
    }
  },
  {
    id: "gehry",
    label: "Gehry",
    title: "Frank Gehry",
    era: "Deconstructivism · 1990s · Guggenheim Bilbao",
    blurb: "Crumpled titanium skins, tumbling glass, billowing roofs on the river",
    palette: [13159634, 12370118, 14279380],
    ground: { water: true, hex: 5599354, side: 7039851 },
    found: 9079176,
    tess: [4, 4],
    smooth: true,
    warp(p) {
      const s = Math.min(1, Math.max(0, p.y) / 0.04);
      p.x += s * 7e-3 * Math.sin(p.z * 31 + p.y * 38 + Math.sin(p.x * 17) * 1.5);
      p.z += s * 7e-3 * Math.cos(p.x * 29 - p.y * 33);
      p.y += s * 2.5e-3 * Math.sin(p.x * 40 + p.z * 26);
    },
    wall(K, E) {
      asWall(K, E, "metal", E.bh, 0, AS_H, 0, 0.08);
      if (E.r < 0.45) {
        const u = 0.25 + E.r, ax = E.t3.clone().applyAxisAngle(E.n3, (E.r - 0.2) * 1.4);
        K.box("glass", 4945766, asAt(E, u, 0.015, 1.2e-3), ax, AS_UP.clone().applyAxisAngle(E.n3, (E.r - 0.2) * 1.4), E.n3, E.len * 0.45, 0.016, 1.6e-3);
      }
      asBand(K, E, "metal", 11185842, AS_H - 6e-4, 6e-4, 3e-4, 5e-4);
    },
    roof(K, R) {
      asPitched(K, R, { kind: "metal", hex: 13687262, pitch: 0.4 + R.r * 1.4, over: 4e-3, hip: 0.25 + R.r * 0.3, up: 7e-3 });
      if (R.tower) K.cyl("metal", 13687262, R.cen, R.cen.clone().add(new THREE6.Vector3(4e-3, 0.035, -3e-3)), R.ins * 0.8, R.ins * 0.1, 7);
    },
    prop(K, x, z, r) {
      if (r < 0.03) K.ybox("satin", 15263976, x, -2e-3, z, 0.014, 2e-3, 4e-3, r * 140);
    }
  },
  {
    id: "hadid",
    label: "Hadid",
    title: "Zaha Hadid",
    era: "Parametricism · 2000s–2010s · Heydar Aliyev Center",
    blurb: "Flowing white shells and ribbon glazing, as if the town had melted into one wave",
    palette: [15856622, 15330793],
    ground: { hex: 14277078, side: 12303291 },
    tess: [4, 3],
    smooth: true,
    warp(p) {
      // the sway grows with height, so storeys slide over each other like strata
      const s = Math.min(1.6, Math.max(0, p.y) / 0.05);
      p.x += s * 0.011 * Math.sin(p.z * 17 + p.y * 34);
      p.z += s * 0.011 * Math.cos(p.x * 16 + p.y * 30);
    },
    wall(K, E) {
      asWall(K, E, "glass", 3095108, 0, 0.018, 0);
      asWall(K, E, "satin", E.bh, 0.018, AS_H, 1.2e-3);
      const [a, b] = asInset(E, -1.2e-3);
      K.quad("satin", E.bh, E.a3.clone().setY(E.y0 + 0.018), E.b3.clone().setY(E.y0 + 0.018), b.setY(E.y0 + 0.018), a.setY(E.y0 + 0.018));
    },
    roof(K, R) {
      if (R.tower) asPitched(K, R, { kind: "satin", hex: 15856622, pitch: 1.6, over: 1.2e-3, hip: 0.95 });
      else asFlat(K, R, { kind: "satin", hex: 15856622 });
    },
    prop(K, x, z, r) {
      if (r < 0.08) K.sphere("satin", 15856622, new THREE6.Vector3(x, 0, z), 9e-3, 3e-3, 6e-3, 2);
    }
  }
];
// the town's one ridge direction (Jiangnan and Suzhou rows of roofs run parallel, as in Wu Guanzhong's paintings)
var AS_JIANGNAN_DIR = new THREE6.Vector3(Math.cos(0.5), 0, Math.sin(0.5));
// Gaudi's broken-tile mosaic
var AS_TRENCADIS = [3112897, 4694875, 14721082, 13784638, 8176841, 15848299, 15921906, 6977208];
// the horse-head wall of a Jiangnan gable: a stepped white wall in three steps, each capped with a thin line of
// black tile
function asHorseHead(K, p, q, apex, R) {
  const t = q.clone().sub(p), len = t.length(), n = new THREE6.Vector3(t.z, 0, -t.x).normalize();
  t.normalize();
  // each step stands above the gable triangle over its whole width: the triangle already reaches 2/3 of the apex
  // height at the inner end of an outer step
  const H0 = apex.y - p.y, hs = [0.76, 1.18, 0.76];
  hs.forEach((f, i) => {
    const u = (i + 0.5) / hs.length, hgt = H0 * f + 2.5e-3;
    const c = p.clone().addScaledVector(t, u * len).addScaledVector(n, -1.2e-3);
    c.y = p.y + hgt / 2;
    K.box("matte", R.wall, c, t, AS_UP, n, len / hs.length + 3e-4, hgt, 2.4e-3);
    K.box("matte", 2302755, c.clone().setY(p.y + hgt + 5e-4), t, AS_UP, n, len / hs.length + 1.4e-3, 1e-3, 4e-3);
  });
}
// an onion dome striped in a spiral of two colours (St Basil's); returns its tip
function asOnion(K, base, r, h, c1, c2, twist = 1.2) {
  const prof = AS_PROFILES.onion, top = prof.at(-1)[1], seg = 16;
  const at = (i, j) => {
    const [pr, py] = prof[j], a = i / seg * Math.PI * 2 + twist * Math.PI * py / top;
    return new THREE6.Vector3(base.x + Math.cos(a) * pr * r, base.y + py / top * h, base.z + Math.sin(a) * pr * r);
  };
  for (let i = 0; i < seg; i++) for (let j = 0; j + 1 < prof.length; j++) {
    const hex = i % 2 ? c1 : c2;
    K.tri("satin", hex, at(i, j), at(i, j + 1), at(i + 1, j + 1));
    K.tri("satin", hex, at(i, j), at(i + 1, j + 1), at(i + 1, j));
  }
  return base.clone().setY(base.y + h);
}
// a lower eave all round a column at height y (the second eave of a Chinese hall), corners lifted
function asSkirt(K, R, y, d, hex) {
  const n = R.n3, out = R.v3.map((p, i) => {
    const o = n[i].clone().add(n[(i + 3) % 4]);
    return p.clone().addScaledVector(o, d).setY(y - d * 0.5 + 1.8e-3);
  });
  R.v3.forEach((p, i) => {
    const q = R.v3[(i + 1) % 4];
    K.poly("gloss", hex, [p.clone().setY(y), q.clone().setY(y), out[(i + 1) % 4], out[i]], 0.05, R.r);
  });
}
// a pyramid on the roof (Louvre): glass faces and metal edges
function asPyramid(K, R, kind, hex, height, edge) {
  const c = R.v3.map((p) => p.clone().lerp(R.cen, 0.12).setY(R.y + 3e-4)), apex = R.cen.clone().setY(R.y + height);
  c.forEach((p, i) => {
    K.tri(kind, hex, p, c[(i + 1) % 4], apex);
    K.cyl("metal", edge, p, apex, 4e-4, 4e-4, 4);
  });
}
