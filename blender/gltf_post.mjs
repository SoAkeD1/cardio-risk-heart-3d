// glTF post-processing for the Track A heart asset (run by build_heart.py after the Blender export).
//
//   node blender/gltf_post.mjs <in.glb> <out.glb> <clinical_baseColor.png|""> <attribution> <modifications>
//
// 1. KHR_materials_variants: "realistic" (default, original Sketchfab material) + "clinical" (desaturated,
//    lifted toward #D9A79A, painted lines softened, roughness 0.65, normal scale 0.4) on Heart_Myocardium
//    and Aorta.
// 2. alpha-0 helpers (Extra_Hit_*, Extra_Outline_*) -> alphaMode BLEND (the Blender exporter writes MASK).
// 3. coronary materials: explicit emissiveFactor [0,0,0] (emissive-ready for the app's glow).
// 4. asset.extras: CC BY 4.0 attribution + modifications.
// Texture resize, WebP and Draco are applied afterwards with `npx gltf-transform resize | webp | draco`.
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsVariants } from "@gltf-transform/extensions";

const [, , inp, out, clinicalPng, attribution, modifications] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();

for (const m of root.listMaterials()) {
  const n = m.getName();
  if (/^MAT_Extra_(Hit|Outline)_/.test(n)) {
    m.setAlphaMode("BLEND");
    const c = m.getBaseColorFactor();
    m.setBaseColorFactor([c[0], c[1], c[2], 0]);
  }
  if (/^MAT_Coronary_/.test(n)) m.setEmissiveFactor([0, 0, 0]);
}

let variantInfo = "none";
if (clinicalPng && fs.existsSync(clinicalPng)) {
  const ext = doc.createExtension(KHRMaterialsVariants);
  const vReal = ext.createVariant("realistic");
  const vClin = ext.createVariant("clinical");
  const clinTex = doc.createTexture("Heart_Tex_baseColor_clinical")
    .setImage(fs.readFileSync(clinicalPng)).setMimeType("image/png").setURI("Heart_Tex_baseColor_clinical.png");
  let mapped = 0;
  for (const name of ["MAT_Heart_Myocardium", "MAT_Aorta"]) {
    const real = root.listMaterials().find((m) => m.getName() === name);
    if (!real) throw new Error(`material ${name} not found`);
    const clin = real.clone().setName(`${name}_clinical`);
    clin.setBaseColorTexture(clinTex);
    clin.setMetallicRoughnessTexture(null);
    clin.setMetallicFactor(0).setRoughnessFactor(0.65);
    clin.setNormalScale(0.4);
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMaterial() !== real) continue;
        const list = ext.createMappingList();
        list.addMapping(ext.createMapping().setMaterial(real).addVariant(vReal));
        list.addMapping(ext.createMapping().setMaterial(clin).addVariant(vClin));
        prim.setExtension("KHR_materials_variants", list);
        mapped++;
      }
    }
  }
  variantInfo = `realistic(default)+clinical on ${mapped} primitives`;
}

const asset = root.getAsset();
asset.extras = { ...(asset.extras || {}), attribution, modifications, variants: variantInfo };
await io.write(out, doc);
console.log(`[gltf_post] ${out}: variants=${variantInfo}`);
