# ASSET_SPEC: 3D heart and torso (contract for Step 6)

_Generated from `artifacts/anatomy_map.json` by `cardio_ml.anatomy.write_asset_spec()`. Do not edit by hand. Change the map instead._

## Export
* One file, glTF 2.0 binary (.glb): Y-up, in metres, with the origin at the heart centroid.
* **Budget:** at most 150,000 triangles in total, at most 10 MB, with `KHR_draco_mesh_compression`. It must run in a browser without a dedicated GPU.
* **Materials:** exactly 1 material per mesh; base colour set at runtime; no baked colours or textures on coronary meshes.
* **Validation:** `python -c "from cardio_ml.anatomy import validate_glb_names as v; print(v('heart.glb'))"` must return `ok: True`.

## Required meshes (exact names)
| mesh | role | colour at runtime |
|---|---|---|
| `Coronary_LAD` | Left Anterior Descending (LAD): Supplies blood to the front of the heart. | risk colour, uniform along the **whole** vessel |
| `Coronary_LCX` | Left Circumflex (LCX): Supplies blood to the side and back of the heart. | risk colour, uniform along the **whole** vessel |
| `Coronary_RCA` | Right Coronary Artery (RCA): Supplies blood to the right side and bottom of the heart. | risk colour, uniform along the **whole** vessel |
| `Territory_LAD` | AHA segments [1, 2, 7, 8, 13, 14, 17] (LAD territory) | vessel colour at reduced opacity; hidden by default |
| `Territory_LCX` | AHA segments [5, 6, 11, 12, 16] (LCX territory) | vessel colour at reduced opacity; hidden by default |
| `Territory_RCA` | AHA segments [3, 4, 9, 10, 15] (RCA territory) | vessel colour at reduced opacity; hidden by default |
| `Heart_Myocardium` | Heart (myocardium) | tint by CAD risk tier |
| `Coronary_LM` | Left main coronary artery | fixed neutral `#C9C2B8`, not risk-coloured |
| `Coronary_Branches` (optional) | Diagonals and other branches | fixed neutral `#C9C2B8`, not risk-coloured |
| `Aorta` | Aorta | fixed neutral `#D9CFC4`, not risk-coloured |
| `Torso_Shell` | Torso | fixed neutral `#F1ECE6`, not risk-coloured |
| `Organ_Lungs` | torso region: Lungs & smoking | glow overlay (contributing risk factor, NOT disease location) |
| `Organ_Kidneys` | torso region: Kidneys | glow overlay (contributing risk factor, NOT disease location) |
| `Organ_Pancreas` | torso region: Pancreas / glucose metabolism | glow overlay (contributing risk factor, NOT disease location) |
| `Organ_Thyroid` | torso region: Thyroid | glow overlay (contributing risk factor, NOT disease location) |
| `Organ_Brain` | torso region: Brain | glow overlay (contributing risk factor, NOT disease location) |
| `Organ_Legs` | torso region: Legs | glow overlay (contributing risk factor, NOT disease location) |

Torso-region overlay meshes (a region may reuse a heart/vessel/torso mesh as an additive glow layer, or have no mesh and be shown as a HUD chip at its anchor): `heart` -> `Heart_Myocardium`; `vessels` -> `Aorta`; `lungs` -> `Organ_Lungs`; `kidneys` -> `Organ_Kidneys`; `pancreas` -> `Organ_Pancreas`; `thyroid` -> `Organ_Thyroid`; `brain` -> `Organ_Brain`; `blood` -> no mesh (HUD chip at its anchor); `legs` -> `Organ_Legs`; `whole_body` -> `Torso_Shell`.

## Required camera anchors (empty objects)
`Anchor_LAD`, `Anchor_LCX`, `Anchor_RCA`, `Anchor_Heart`, `Anchor_Vessels`, `Anchor_Lungs`, `Anchor_Kidneys`, `Anchor_Pancreas`, `Anchor_Thyroid`, `Anchor_Brain`, `Anchor_Blood`, `Anchor_Legs`, `Anchor_WholeBody`

Place each anchor at the centre of its structure, slightly in front of it, to act as the focus and zoom target.

## Coronary modelling rules
* Model the LAD, LCX and RCA as separate meshes along their whole course. Do **not** split them into proximal, mid or distal segments: the dataset has no lesion location.
* The left main, diagonals and other branches are separate neutral meshes (tooltip: "not modelled - no label in dataset").
* Do not bake colours or textures into the coronaries. Colour is set at runtime from the scene state.
* Territories: Right-dominant circulation; AHA 17-segment model (Cerqueira et al., Circulation 2002;105:539-542).
* Region RWMA is a clinical input, **not** a coordinate. Nothing in the model is placed from feature values.

## Sources and licences
| source | url | licence | model / author | attribution text |
|---|---|---|---|---|
| Procedurally generated in this repo | blender/build_heart.py | CC0 1.0 (public domain dedication) | Track A team | none required |
