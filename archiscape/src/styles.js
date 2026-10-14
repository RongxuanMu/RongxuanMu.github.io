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
    era: "Athens · 5th century BC · the Parthenon",
    blurb: "Marble colonnades on stepped bases, painted friezes, low pediments",
    palette: [15459800, 15524061, 14802626],
    ground: { hex: 13483935, side: 10392180 },
    wall(K, E) {
      if (E.L === 0) {
        asWall(K, E, "satin", 14274493, 0, AS_H, -5.5e-3);
        asBand(K, E, "satin", 15459800, 0, 2.4e-3, 2.2e-3, 6e-3, 6e-3);
        asBand(K, E, "satin", 14802626, 0, 1.2e-3, 4.5e-3, 6e-3, 0.011);
        for (const u of asSlots(E.len, 8.5e-3, 0.3)) {
          const p = asAt(E, u, 2.4e-3, 1.5e-3);
          K.cyl("satin", 15985624, p, p.clone().setY(E.y1 - 4.2e-3), 1.7e-3, 1.4e-3, 8);
          K.box("satin", 15985624, p.clone().setY(E.y1 - 4.6e-3), E.t3, AS_UP, E.n3, 4.4e-3, 1.1e-3, 4.4e-3);
        }
      } else {
        asWall(K, E, "satin", E.bh, 0, AS_H, 0, 0.04);
        for (const u of [0.02, 0.98]) asOn(K, E, "satin", 15985624, u, AS_H / 2, 2.2e-3, AS_H, 8e-4, 1.6e-3);
        for (const u of asSlots(E.len, 0.014)) asOn(K, E, "satin", 4867133, u, 0.014, 4e-3, 8e-3, 4e-4, 1e-3);
      }
      // entablature: architrave, a painted frieze, cornice
      asBand(K, E, "satin", 15459800, AS_H - 4.4e-3, 2.2e-3, 1.5e-3, 3e-3, 1e-3);
      asBand(K, E, "satin", E.top ? 3376266 : 15459800, AS_H - 2.2e-3, 1.4e-3, 1.6e-3, 3e-3, 1e-3);
      if (E.top) asBand(K, E, "satin", 11811396, AS_H - 1e-3, 6e-4, 2.2e-3, 3e-3, 1e-3);
    },
    roof(K, R) {
      asPitched(K, R, {
        kind: "satin", hex: 12085055, pitch: 0.3, over: 3.5e-3,
        gable: (K2, p, q, apex) => {
          K2.tri("satin", 15524061, p, q, apex);
          K2.sphere("gold", 13280596, apex.clone().setY(apex.y + 1.6e-3), 1.6e-3, 1.6e-3, 1.6e-3, 0);
        }
      });
      if (R.tower) K.sphere("gold", 13280596, R.cen.clone().setY(R.y + 0.012), 2.4e-3, 4.5e-3, 2.4e-3, 1);
    },
    prop(K, x, z, r) {
      if (r < 0.12) asTree(K, "cypress", x, z, 1, r);
      else if (r < 0.28) asTree(K, "olive", x, z, 1, r);
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
      const s = asSlots(E.len, 0.011, 0.5);
      for (const u of s) asArch(K, E, "matte", 3877152, u, 0.012, 6.4e-3, 0.014);
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
    id: "jiangnan",
    label: "Jiangnan",
    title: "Jiangnan water town",
    era: "South of the Yangtze · Ming and Qing China",
    blurb: "Whitewashed walls, grey tiles with upswept eaves, horse-head gables over the canals",
    palette: [15921126, 15263716],
    ground: { water: true, hex: 7311238, side: 5329234 },
    found: 9079176,
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.04);
      if (E.L === 0) asBand(K, E, "matte", 7106660, 0, 4e-3, 4e-4, 1.6e-3);
      for (const u of asSlots(E.len, 0.013)) {
        if (E.L === 0 && asHash(E.ci, E.k, u * 100) < 0.5) {
          asOn(K, E, "satin", 3811871, u, 0.0105, 9e-3, 0.017, 4e-4);
          asOn(K, E, "satin", 6967352, u, 0.0105, 4e-4, 0.017, 9e-4);
        } else {
          asOn(K, E, "satin", 3877664, u, 0.015, 8e-3, 0.01, 5e-4);
          asOn(K, E, "satin", 7032888, u, 0.0094, 9.5e-3, 1.2e-3, 1.1e-3);
        }
      }
      // pent eaves between storeys
      if (E.L > 0) {
        const [a, b] = asInset(E, -6e-3);
        K.poly("satin", 4540493, [E.a3.clone().setY(E.y0 + 1e-3), E.b3.clone().setY(E.y0 + 1e-3), b.setY(E.y0 - 3.5e-3), a.setY(E.y0 - 3.5e-3)], 0.05, E.r);
      }
    },
    roof(K, R) {
      const { R0, R2 } = asPitched(K, R, {
        kind: "satin", hex: 4540493, pitch: 0.55, over: 4.5e-3, up: 3e-3, ridge: 3092787,
        gable: (K2, p, q, apex) => asHorseHead(K2, p, q, apex, R)
      });
      if (R.tower) {
        const mid = R0.clone().lerp(R2, 0.5);
        K.cyl("satin", 3092787, mid, mid.clone().setY(mid.y + 0.012), 1.2e-3, 3e-4, 6);
        for (let i = 0; i < 3; i++) K.sphere("satin", 3092787, mid.clone().setY(mid.y + 3e-3 + i * 3e-3), 1.6e-3 - i * 3e-4, 1e-3, 1.6e-3 - i * 3e-4, 0);
      }
      if (R.r < 0.3) {
        // a red lantern under the eaves
        const k = R.join.indexOf(false);
        if (k >= 0) {
          const p = R.v3[k].clone().lerp(R.v3[(k + 1) % 4], 0.3).addScaledVector(R.n3[k], 3.5e-3);
          p.y -= 5e-3;
          K.sphere("glow", 14174767, p, 1.8e-3, 2.2e-3, 1.8e-3, 1);
        }
      }
    },
    prop(K, x, z, r) {
      if (r < 0.035) {
        // a black-awning boat
        const yaw = r * 180;
        K.ybox("satin", 3811871, x, -2e-3, z, 0.016, 2e-3, 4.5e-3, yaw);
        K.ybox("satin", 2236962, x, 5e-4, z, 7e-3, 3e-3, 4e-3, yaw);
      } else if (r > 0.9) {
        // lotus pads
        for (let i = 0; i < 3; i++) K.cyl("matte", 5605442, new THREE6.Vector3(x + Math.cos(i * 2.1 + r) * 3e-3, -3.5e-3, z + Math.sin(i * 2.1 + r) * 3e-3), new THREE6.Vector3(x + Math.cos(i * 2.1 + r) * 3e-3, -3.3e-3, z + Math.sin(i * 2.1 + r) * 3e-3), 2e-3, 2e-3, 8);
      }
    }
  },
  {
    id: "russian",
    label: "Russian",
    title: "Old Russian",
    era: "Moscow · 16th–17th century · St Basil's",
    blurb: "Painted walls, kokoshnik window crowns, tented roofs and onion domes",
    palette: [8369109, 15255146, 14249821, 10274714, 15921126],
    ground: { hex: 15131119, side: 11710133 },
    wall(K, E) {
      asWall(K, E, "matte", E.bh, 0, AS_H, 0, 0.04);
      for (const u of [0.015, 0.985]) asOn(K, E, "matte", 16316664, u, AS_H / 2, 2.4e-3, AS_H, 6e-4, 1.2e-3);
      if (E.L > 0) asBand(K, E, "matte", 16316664, 0, 1.8e-3, 7e-4, 1.4e-3);
      for (const u of asSlots(E.len, 0.012)) {
        asOn(K, E, "matte", 16316664, u, 0.013, 7e-3, 0.0105, 5e-4, 1e-3);
        asOn(K, E, "matte", 2766654, u, 0.0125, 4.6e-3, 7.6e-3, 9e-4, 1e-3);
        const c = asAt(E, u, 0.0185, 5e-4);
        K.cyl("matte", 16316664, c.clone().addScaledVector(E.n3, -5e-4), c.clone().addScaledVector(E.n3, 5e-4), 3.5e-3, 3.5e-3, 10);
      }
    },
    roof(K, R) {
      const metal = asPick([4160092, 10107443, 3049960], asHash(R.ci, 2));
      if (!R.tower) return asPitched(K, R, { kind: "satin", hex: metal, pitch: 0.8, over: 3e-3, hip: 0.6 });
      asFlat(K, R, { hex: R.wall });
      const dome = asPick([14199354, 3104680, 4165466, 11680314, 14199354], asHash(R.ci, 4));
      const cross = (K2, p) => asCross(K2, p);
      if (R.h >= 4) {
        // a tented roof with a small onion on top
        const b = R.cen.clone(), r = R.ins * 0.85;
        K.cyl("matte", R.wall, b, b.clone().setY(b.y + 6e-3), r, r, 8);
        K.cyl("satin", 4160092, b.clone().setY(b.y + 6e-3), b.clone().setY(b.y + 0.04), r * 1.05, r * 0.12, 8);
        K.lathe("gold", dome, b.clone().setY(b.y + 0.039), "onion", r * 0.25, r * 0.3, 10);
        cross(K, b.clone().setY(b.y + 0.039 + r * 0.52));
      } else asDome(K, R, { kind: dome === 14199354 ? "gold" : "satin", hex: dome, profile: "onion", scale: 0.55, drum: 0.012, drumHex: R.wall, height: 1.05, finial: cross });
    },
    prop(K, x, z, r) {
      if (r < 0.12) asTree(K, "fir", x, z, 1, r);
      else if (r < 0.22) asTree(K, "birch", x, z, 1, r, 10203226);
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
// the horse-head wall of a Jiangnan gable: stepped white wall pieces with dark tile caps
function asHorseHead(K, p, q, apex, R) {
  const t = q.clone().sub(p), len = t.length(), n = new THREE6.Vector3(t.z, 0, -t.x).normalize();
  t.normalize();
  const H0 = apex.y - p.y, hs = [0.42, 0.78, 1.18, 0.78, 0.42];
  hs.forEach((f, i) => {
    const u = (i + 0.5) / hs.length, hgt = H0 * f + 2.5e-3;
    const c = p.clone().addScaledVector(t, u * len).addScaledVector(n, -1.2e-3);
    c.y = p.y + hgt / 2;
    K.box("matte", R.wall, c, t, AS_UP, n, len / hs.length + 3e-4, hgt, 2.4e-3, 0.03, R.r);
    K.box("satin", 3092787, c.clone().setY(p.y + hgt + 6e-4), t, AS_UP, n, len / hs.length + 9e-4, 1.4e-3, 4.6e-3);
  });
}
